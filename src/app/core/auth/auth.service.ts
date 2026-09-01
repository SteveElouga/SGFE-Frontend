import { Injectable, computed, inject, signal } from '@angular/core';
import type { InMemoryCache } from '@apollo/client/core';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { Apollo } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { purgePersistedCache, restorePersistedCacheFor } from '../graphql/apollo-persistence';
import {
  ACTIVATE_ACCOUNT,
  LOGIN,
  LOGOUT,
  REFRESH_TOKEN,
  REQUEST_PASSWORD_RESET,
  REQUEST_PHONE_OTP,
  RESET_PASSWORD,
  VERIFY_OTP_AND_SET_PASSWORD,
} from '../../graphql/mutations/auth.mutations';
import { User } from '../../shared/models/user.model';
import type { ActivateAccountMutation, LoginMutation, LogoutMutation, RefreshTokenMutation, RequestPasswordResetMutation, RequestPhoneOtpMutation, ResetPasswordMutation, VerifyOtpAndSetPasswordMutation } from '../../graphql/generated';

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

// Le backend Django sérialise parfois ses ValidationError sous forme de liste
// Python : "['Message lisible.']". On déroule ce wrapper pour n'afficher que le
// message. Gère aussi les listes à plusieurs éléments (jointes par « · »).
function unwrapDjangoList(raw: string): string {
  const trimmed = raw.trim();
  if (!/^\[.*\]$/.test(trimmed)) return raw;
  const inner = trimmed.slice(1, -1);
  const parts = inner.match(/(['"])(.*?)\1/g);
  if (!parts || parts.length === 0) return raw;
  return parts.map((p) => p.slice(1, -1)).join(' · ');
}

function sanitizeGqlMessage(raw: string): string {
  const unwrapped = unwrapDjangoList(raw);
  return TECHNICAL_MESSAGE_PATTERNS.some((p) => p.test(unwrapped)) ? '' : unwrapped;
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

/**
 * Source de vérité de la session : détient l'access token (en mémoire
 * uniquement, perdu au reload) et l'utilisateur courant sous forme de signals,
 * et expose les opérations d'authentification GraphQL — login, refresh
 * silencieux, logout, OTP/reset, changement d'email et de mot de passe.
 * Signals dérivés : `isAuthenticated`, `role`, `isAdmin`/`isAgent`/`isComptable`.
 * Singleton (`providedIn: 'root'`).
 */
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
  isSuperviseur = computed(() => this.role() === 'SUPERVISEUR');

  private readonly apolloClient = inject(Apollo);

  accessToken(): string | null {
    return this._accessToken();
  }

  async login(identifier: string, password: string): Promise<void> {
    try {
      const result = await firstValueFrom(
        this.apolloClient.mutate<LoginMutation>({ mutation: LOGIN,
          variables: { identifier, password },
        }),
      );

      const payload = result.data?.login;
      if (!payload) {
        throw new Error('Échec de la connexion');
      }

      // Repart d'un cache propre : sur un appareil partagé, empêche que les
      // données normalisées d'une session précédente (cache persisté)
      // soient servies au nouvel utilisateur. La persistance sera ré-estampillée
      // du nouveau userId à la prochaine sauvegarde.
      await this.resetStore();
      purgePersistedCache();

      this._accessToken.set(payload.accessToken);
      this._user.set(payload.user);
    } catch (error) {
      throw new Error(extractServerErrorMessage(error, 'Identifiants incorrects. Veuillez réessayer.'));
    }
  }

  async requestPhoneOtp(phoneNumber: string): Promise<string> {
    const result = await firstValueFrom(
      this.apolloClient.mutate<RequestPhoneOtpMutation>({ mutation: REQUEST_PHONE_OTP,
        variables: { phoneNumber },
      }),
    );
    return result.data?.requestPhoneOtp.maskedPhone ?? '';
  }

  async verifyOtpAndSetPassword(phoneNumber: string, otpCode: string, password: string): Promise<void> {
    await firstValueFrom(
      this.apolloClient.mutate<VerifyOtpAndSetPasswordMutation>({ mutation: VERIFY_OTP_AND_SET_PASSWORD,
        variables: { phoneNumber, otpCode, password },
      }),
    );
  }

  async refreshToken(): Promise<void> {
    try {
      const result = await firstValueFrom(
        this.apolloClient.mutate<RefreshTokenMutation>({ mutation: REFRESH_TOKEN,
          // Best-effort : le refresh silencieux (bootstrap + retry 401) ne doit
          // jamais faire remonter d'erreur globale. Un cookie périmé/invalide
          // signifie simplement « pas de session » → on retombe sur le login.
          context: { silentError: true },
        }),
      );

      const payload = result.data?.refreshToken;
      if (!payload) {
        throw new Error('Impossible de rafraîchir la session');
      }

      this._accessToken.set(payload.accessToken);
      this._user.set(payload.user);

      // Réouverture silencieuse (même utilisateur) : restaure ses données
      // hors-ligne — et uniquement les siennes (blob rattaché à son userId).
      restorePersistedCacheFor(this.apolloClient.client.cache as InMemoryCache, payload.user.id);
    } catch (error) {
      this.clearSession();
      throw error;
    }
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.apolloClient.mutate<LogoutMutation>({ mutation: LOGOUT }));
    } finally {
      this.clearSession();
    }
  }

  async requestPasswordReset(email: string): Promise<void> {
    await firstValueFrom(
      this.apolloClient.mutate<RequestPasswordResetMutation>({ mutation: REQUEST_PASSWORD_RESET,
        variables: { email },
      }),
    );
  }

  /** Même règle que pour la réinitialisation : le serveur a révoqué l'avant. */
  async activateAccount(token: string, password: string): Promise<void> {
    await firstValueFrom(
      this.apolloClient.mutate<ActivateAccountMutation>({ mutation: ACTIVATE_ACCOUNT,
        variables: { token, password },
      }),
    );
    this.clearSession();
  }

  /**
   * Réinitialise le mot de passe depuis un lien, puis ferme la session locale.
   *
   * Le serveur révoque tous les jetons émis avant le changement — c'est ce
   * qu'attend quelqu'un qui réinitialise parce qu'il pense son compte
   * compromis. Garder le jeton et le cache ici laisserait une application qui a
   * l'air connectée et dont chaque requête va échouer, ce qui se lit comme une
   * panne plutôt que comme une déconnexion.
   */
  async resetPassword(token: string, password: string): Promise<void> {
    await firstValueFrom(
      this.apolloClient.mutate<ResetPasswordMutation>({ mutation: RESET_PASSWORD,
        variables: { token, password },
      }),
    );
    this.clearSession();
  }

  private clearSession(): void {
    this._accessToken.set(null);
    this._user.set(null);
    // Vide le cache en mémoire et la persistance : aucune donnée d'une session
    // fermée (logout ou refresh échoué) ne doit subsister pour la suivante.
    void this.resetStore();
    purgePersistedCache();
  }

  /** Vide le magasin Apollo (données normalisées en mémoire) sans refetch. */
  private async resetStore(): Promise<void> {
    try {
      await this.apolloClient.client.clearStore();
    } catch {
      /* pas de client actif / déjà vide — sans conséquence */
    }
  }
}
