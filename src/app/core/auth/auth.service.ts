import { Injectable, computed, inject, signal } from '@angular/core';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { Apollo } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import {
  ACTIVATE_ACCOUNT,
  LOGIN,
  LOGOUT,
  REFRESH_TOKEN,
  REQUEST_PASSWORD_RESET,
  RESET_PASSWORD,
} from '../../graphql/mutations/auth.mutations';
import { AuthPayload, User } from '../../shared/models/user.model';

function extractServerErrorMessage(error: unknown, fallback: string): string {
  if (CombinedGraphQLErrors.is(error)) {
    return error.errors[0]?.message || fallback;
  }
  return fallback;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _accessToken = signal<string | null>(null);
  private readonly _user = signal<User | null>(null);

  user = this._user.asReadonly();
  isAuthenticated = computed(() => this._user() !== null);
  role = computed(() => this._user()?.role ?? null);

  isAdmin = computed(() => this.role() === 'ADMIN');
  isAgent = computed(() => this.role() === 'AGENT');
  isComptable = computed(() => this.role() === 'COMPTABLE');

  private readonly apolloClient = inject(Apollo);

  accessToken(): string | null {
    return this._accessToken();
  }

  async login(username: string, password: string): Promise<void> {
    try {
      const result = await firstValueFrom(
        this.apolloClient.mutate<{ login: AuthPayload }>({
          mutation: LOGIN,
          variables: { username, password },
        }),
      );

      const payload = result.data?.login;
      if (!payload) {
        throw new Error('Échec de la connexion');
      }

      this._accessToken.set(payload.accessToken);
      this._user.set(payload.user);
    } catch (error) {
      throw new Error(extractServerErrorMessage(error, 'Identifiants incorrects. Veuillez réessayer.'));
    }
  }

  async refreshToken(): Promise<void> {
    try {
      const result = await firstValueFrom(
        this.apolloClient.mutate<{ refreshToken: AuthPayload }>({
          mutation: REFRESH_TOKEN,
        }),
      );

      const payload = result.data?.refreshToken;
      if (!payload) {
        throw new Error('Impossible de rafraîchir la session');
      }

      this._accessToken.set(payload.accessToken);
      this._user.set(payload.user);
    } catch (error) {
      this.clearSession();
      throw error;
    }
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.apolloClient.mutate<{ logout: boolean }>({ mutation: LOGOUT }));
    } finally {
      this.clearSession();
    }
  }

  async requestPasswordReset(email: string): Promise<void> {
    await firstValueFrom(
      this.apolloClient.mutate<{ requestPasswordReset: boolean }>({
        mutation: REQUEST_PASSWORD_RESET,
        variables: { email },
      }),
    );
  }

  async activateAccount(token: string, password: string): Promise<void> {
    await firstValueFrom(
      this.apolloClient.mutate<{ activateAccount: boolean }>({
        mutation: ACTIVATE_ACCOUNT,
        variables: { token, password },
      }),
    );
  }

  async resetPassword(token: string, password: string): Promise<void> {
    await firstValueFrom(
      this.apolloClient.mutate<{ resetPassword: boolean }>({
        mutation: RESET_PASSWORD,
        variables: { token, password },
      }),
    );
  }

  private clearSession(): void {
    this._accessToken.set(null);
    this._user.set(null);
  }
}
