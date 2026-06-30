import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Apollo } from 'apollo-angular';
import { ConfigParam, InfosSociete, UpdateInfosSocieteInput } from '../../shared/models/configuration.model';
import { GET_CONFIGS, GET_INFOS_SOCIETE } from '../../graphql/queries/configuration.queries';
import { UPDATE_CONFIG, UPDATE_INFOS_SOCIETE } from '../../graphql/mutations/configuration.mutations';

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
}
