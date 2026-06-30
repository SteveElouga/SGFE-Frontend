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
        fetchPolicy: 'network-only',
      }),
    );
    return result.data.infosSociete;
  }

  async getConfigs(): Promise<ConfigParam[]> {
    const result = await firstValueFrom(
      this.apollo.query<{ configs: ConfigParam[] }>({
        query: GET_CONFIGS,
        fetchPolicy: 'network-only',
      }),
    );
    return result.data.configs;
  }

  async updateInfosSociete(input: UpdateInfosSocieteInput): Promise<InfosSociete> {
    const result = await firstValueFrom(
      this.apollo.mutate<{ updateInfosSociete: InfosSociete }>({
        mutation: UPDATE_INFOS_SOCIETE,
        variables: { input },
      }),
    );
    return result.data!.updateInfosSociete;
  }

  async updateConfig(cle: string, valeur: string): Promise<ConfigParam> {
    const result = await firstValueFrom(
      this.apollo.mutate<{ updateConfig: ConfigParam }>({
        mutation: UPDATE_CONFIG,
        variables: { cle, valeur },
      }),
    );
    return result.data!.updateConfig;
  }
}
