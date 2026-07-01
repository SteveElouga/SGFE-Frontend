import { Injectable, computed, inject, signal } from '@angular/core';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { Apollo } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import {
  ACTIVATE_ACCOUNT,
  CHANGE_PASSWORD,
  LOGIN,
  LOGOUT,
  REFRESH_TOKEN,
  REQUEST_PASSWORD_RESET,
  REQUEST_PHONE_OTP,
  RESET_PASSWORD,
  UPDATE_EMAIL,
  VERIFY_OTP_AND_SET_PASSWORD,
} from '../../graphql/mutations/auth.mutations';
import { AuthPayload, OtpSentPayload, User } from '../../shared/models/user.model';

// Patterns that indicate a technical backend/network message not suitable for display.
// Return '' so callers fall back to their own user-friendly message.
const TECHNICAL_MESSAGE_PATTERNS = [
  /^INTERNAL_SERVER_ERROR/i,
  /^Failed to fetch/i,
  /^Network error/i,
  /^HTTP\s+\d+/i,
  /Received status code \d+/i,
  /^Response not successful/i,
  /^Cannot query field/i,
  /^Unexpected token/i,
  /^ApolloError/i,
  /^Error:/i,
];

function sanitizeGqlMessage(raw: string): string {
  return TECHNICAL_MESSAGE_PATTERNS.some((p) => p.test(raw)) ? '' : raw;
}

export function extractGqlError(error: unknown): { code: string; message: string } {
  if (CombinedGraphQLErrors.is(error)) {
    const gqlError = error.errors[0];
    return {
      code: ((gqlError?.extensions?.['grpc_code'] ?? gqlError?.extensions?.['code']) as string) ?? '',
      message: sanitizeGqlMessage(gqlError?.message ?? ''),
    };
  }
  return { code: '', message: sanitizeGqlMessage(error instanceof Error ? error.message : '') };
}

function extractServerErrorMessage(error: unknown, fallback: string): string {
  const { message } = extractGqlError(error);
  return message || fallback;
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

  async login(identifier: string, password: string): Promise<void> {
    try {
      const result = await firstValueFrom(
        this.apolloClient.mutate<{ login: AuthPayload }>({
          mutation: LOGIN,
          variables: { identifier, password },
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

  async requestPhoneOtp(phoneNumber: string): Promise<string> {
    const result = await firstValueFrom(
      this.apolloClient.mutate<{ requestPhoneOtp: OtpSentPayload }>({
        mutation: REQUEST_PHONE_OTP,
        variables: { phoneNumber },
      }),
    );
    return result.data?.requestPhoneOtp.maskedPhone ?? '';
  }

  async verifyOtpAndSetPassword(phoneNumber: string, otpCode: string, password: string): Promise<void> {
    await firstValueFrom(
      this.apolloClient.mutate<{ verifyOtpAndSetPassword: boolean }>({
        mutation: VERIFY_OTP_AND_SET_PASSWORD,
        variables: { phoneNumber, otpCode, password },
      }),
    );
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

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await firstValueFrom(
      this.apolloClient.mutate<{ changePassword: boolean }>({
        mutation: CHANGE_PASSWORD,
        variables: { currentPassword, newPassword },
      }),
    );
  }

  async updateEmail(email: string): Promise<void> {
    const result = await firstValueFrom(
      this.apolloClient.mutate<{ updateEmail: { id: string; email: string } }>({
        mutation: UPDATE_EMAIL,
        variables: { email },
      }),
    );
    const updated = result.data?.updateEmail;
    if (updated) {
      this._user.update((u) => (u ? { ...u, email: updated.email } : null));
    }
  }

  private clearSession(): void {
    this._accessToken.set(null);
    this._user.set(null);
  }
}
