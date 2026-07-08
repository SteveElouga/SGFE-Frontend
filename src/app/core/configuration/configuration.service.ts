import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Apollo } from 'apollo-angular';
import {
  ConfigParam,
  InfosSociete,
  TestEnvoiResult,
  UpdateInfosSocieteInput,
} from '../../shared/models/configuration.model';
import { GET_CONFIGS, GET_INFOS_SOCIETE } from '../../graphql/queries/configuration.queries';
import {
  REVOQUER_TOKEN_ABONNE,
  REVOQUER_TOUS_TOKENS_ABONNES,
  TESTER_ENVOI_WHATSAPP,
  UPDATE_CONFIG,
  UPDATE_INFOS_SOCIETE,
} from '../../graphql/mutations/configuration.mutations';

/**
 * Accès GraphQL aux paramètres de l'application : informations société, table de
 * configuration clé/valeur, et actions WhatsApp (test d'envoi, révocation des
 * tokens d'accès abonnés). Alimente l'écran Configuration. Singleton.
 */
@Injectable({ providedIn: 'root' })
export class ConfigurationService {
  private readonly apollo = inject(Apollo);

  async getInfosSociete(): Promise<InfosSociete> {
    const result = await firstValueFrom(
      this.apollo.query<{ infosSociete: InfosSociete }>({
        query: GET_INFOS_SOCIETE,
        // cache-first par défaut (apollo.config.ts) — réseau seulement si absent du cache
      }),
    );
    return result.data!.infosSociete;
  }

  async getConfigs(): Promise<ConfigParam[]> {
    const result = await firstValueFrom(
      this.apollo.query<{ configs: ConfigParam[] }>({
        query: GET_CONFIGS,
        // cache-first par défaut (apollo.config.ts)
      }),
    );
    return result.data!.configs;
  }

  async updateInfosSociete(input: UpdateInfosSocieteInput): Promise<InfosSociete> {
    const result = await firstValueFrom(
      this.apollo.mutate<{ updateInfosSociete: InfosSociete }>({
        mutation: UPDATE_INFOS_SOCIETE,
        variables: { input },
      }),
    );
    const updated = result.data!.updateInfosSociete;
    // Mise à jour manuelle du cache (InfosSociete n'a pas d'id, Apollo ne le fait pas seul)
    this.apollo.client.writeQuery({
      query: GET_INFOS_SOCIETE,
      data: { infosSociete: updated },
    });
    return updated;
  }

  async updateConfig(cle: string, valeur: string): Promise<ConfigParam> {
    const result = await firstValueFrom(
      this.apollo.mutate<{ updateConfig: ConfigParam }>({
        mutation: UPDATE_CONFIG,
        variables: { cle, valeur },
      }),
    );
    const updated = result.data!.updateConfig;
    // Patch de la liste dans le cache sans tout recharger
    const cached = this.apollo.client.readQuery<{ configs: ConfigParam[] }>({
      query: GET_CONFIGS,
    });
    if (cached) {
      this.apollo.client.writeQuery({
        query: GET_CONFIGS,
        data: {
          configs: cached.configs.map((c) => (c.cle === updated.cle ? updated : c)),
        },
      });
    }
    return updated;
  }

  /**
   * Envoi de test WhatsApp vers un numéro donné (ADMIN).
   * Renvoie toujours { success, message } : sur échec de livraison,
   * success=false + le motif exact affichable tel quel. Un numéro vide
   * lève en revanche une vraie erreur GraphQL (INVALID_ARGUMENT).
   */
  async testerEnvoiWhatsapp(phoneNumber: string): Promise<TestEnvoiResult> {
    const result = await firstValueFrom(
      this.apollo.mutate<{ testerEnvoiWhatsapp: TestEnvoiResult }>({
        mutation: TESTER_ENVOI_WHATSAPP,
        variables: { phoneNumber },
      }),
    );
    const test = result.data?.testerEnvoiWhatsapp;
    if (!test) throw new Error('Réponse invalide du serveur');
    return test;
  }

  /** Révoque en masse tous les tokens d'accès abonnés (ADMIN). Renvoie le nombre révoqué. */
  async revoquerTousTokensAbonnes(): Promise<number> {
    const result = await firstValueFrom(
      this.apollo.mutate<{ revoquerTousTokensAbonnes: number }>({
        mutation: REVOQUER_TOUS_TOKENS_ABONNES,
      }),
    );
    return result.data?.revoquerTousTokensAbonnes ?? 0;
  }

  /** Révoque un token d'accès abonné précis (ADMIN). */
  async revoquerTokenAbonne(tokenId: string): Promise<boolean> {
    const result = await firstValueFrom(
      this.apollo.mutate<{ revoquerTokenAbonne: boolean }>({
        mutation: REVOQUER_TOKEN_ABONNE,
        variables: { tokenId },
      }),
    );
    return result.data?.revoquerTokenAbonne ?? false;
  }
}
