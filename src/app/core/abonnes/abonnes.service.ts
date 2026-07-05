import { Injectable, inject } from '@angular/core';
import { Apollo, QueryRef } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import {
  ABONNE_UPDATED_SUB,
  GET_ABONNE,
  GET_ABONNES,
  GET_ABONNES_ACTIFS,
  GET_HISTORIQUE_COMPTEUR,
} from '../../graphql/queries/abonnes.queries';
import {
  CREATE_ABONNE,
  REACTIVER_ABONNE,
  REMPLACER_COMPTEUR,
  RESILIER_ABONNE,
  SUSPENDRE_ABONNE,
  UPDATE_ABONNE,
  UPDATE_COMPTEUR,
} from '../../graphql/mutations/abonnes.mutations';
import {
  Abonne,
  Compteur,
  HistoriqueCompteurEntry,
  StatutAbonne,
} from '../../shared/models/abonne.model';

export interface RemplacerCompteurInput {
  numeroCompteur: number;
  quartier: string;
  camp: number;
  indexInitial: number;
  datePose: string;
  /** Dernier index relevé de l'ancien compteur (index de fermeture, archivé). */
  indexFermeture: number;
}

export interface CreateAbonneInput {
  nom: string;
  prenom: string;
  telephoneWhatsapp: string;
  adresse?: string;
  numeroCompteur: number;
  quartier: string;
  camp: number;
  indexInitial: number;
  datePose: string;
}

export interface UpdateAbonneInput {
  nom?: string;
  prenom?: string;
  telephoneWhatsapp?: string;
  adresse?: string;
}

export interface UpdateCompteurInput {
  quartier?: string;
  camp?: number;
  indexInitial?: number;
  datePose?: string;
}

@Injectable({ providedIn: 'root' })
export class AbonnesService {
  private readonly apollo = inject(Apollo);

  startCacheSync(): void {
    type AbonneActifCache = { id: string; compteur?: { quartier: string; camp: number } | null };

    this.apollo
      .subscribe<{ abonneUpdated: { id: string; statut: string; compteur?: { quartier: string; camp: number } } }>({
        query: ABONNE_UPDATED_SUB,
        context: { silentError: true },
      })
      .subscribe({
        next: ({ data }) => {
          const updated = data?.abonneUpdated;
          if (!updated) return;

          const cache = this.apollo.client.cache;
          const cached = cache.readQuery<{ abonnesActifs: AbonneActifCache[] }>({
            query: GET_ABONNES_ACTIFS,
          });
          if (!cached) return;

          const isActif = updated.statut === 'ACTIF';
          const existsInList = cached.abonnesActifs.some((a) => a.id === updated.id);

          if (!isActif && existsInList) {
            cache.writeQuery({
              query: GET_ABONNES_ACTIFS,
              data: { abonnesActifs: cached.abonnesActifs.filter((a) => a.id !== updated.id) },
            });
          } else if (isActif && !existsInList) {
            const newEntry: AbonneActifCache & { __typename: string } = {
              __typename: 'Abonne',
              id: updated.id,
              compteur: updated.compteur
                ? { __typename: 'Compteur', quartier: updated.compteur.quartier, camp: updated.compteur.camp } as AbonneActifCache['compteur'] & { __typename: string }
                : null,
            };
            cache.writeQuery({
              query: GET_ABONNES_ACTIFS,
              data: { abonnesActifs: [...cached.abonnesActifs, newEntry] },
            });
          }
        },
      });
  }

  async getAbonnesActifs(): Promise<Array<{ id: string; quartier: string | null }>> {
    const result = await firstValueFrom(
      this.apollo.query<{ abonnesActifs: Array<{ id: string; compteur?: { quartier: string } | null }> }>({
        query: GET_ABONNES_ACTIFS,
        fetchPolicy: 'cache-first',
      }),
    );
    return (result.data?.abonnesActifs ?? []).map((a) => ({
      id: a.id,
      quartier: a.compteur?.quartier ?? null,
    }));
  }

  watchAbonnes(statut?: StatutAbonne): QueryRef<{ abonnes: Abonne[] }> {
    return this.apollo.watchQuery<{ abonnes: Abonne[] }>({
      query: GET_ABONNES,
      variables: statut ? { statut } : {},
    });
  }

  watchAbonne(id: string): QueryRef<{ abonne: Abonne }> {
    return this.apollo.watchQuery<{ abonne: Abonne }>({
      query: GET_ABONNE,
      variables: { id },
    });
  }

  async getAbonne(id: string): Promise<Abonne> {
    const result = await firstValueFrom(
      this.apollo.query<{ abonne: Abonne }>({
        query: GET_ABONNE,
        variables: { id },
      }),
    );
    const abonne = result.data?.abonne;
    if (!abonne) throw new Error('Abonné introuvable');
    return abonne;
  }

  async createAbonne(input: CreateAbonneInput): Promise<Abonne> {
    const result = await firstValueFrom(
      this.apollo.mutate<{ createAbonne: Abonne }>({
        mutation: CREATE_ABONNE,
        variables: { input },
      }),
    );
    const abonne = result.data?.createAbonne;
    if (!abonne) throw new Error('Réponse invalide du serveur');
    return abonne;
  }

  async updateAbonne(id: string, input: UpdateAbonneInput): Promise<Abonne> {
    const result = await firstValueFrom(
      this.apollo.mutate<{ updateAbonne: Abonne }>({
        mutation: UPDATE_ABONNE,
        variables: { id, input },
      }),
    );
    const abonne = result.data?.updateAbonne;
    if (!abonne) throw new Error('Réponse invalide du serveur');
    return abonne;
  }

  async suspendreAbonne(id: string): Promise<Abonne> {
    const result = await firstValueFrom(
      this.apollo.mutate<{ suspendreAbonne: Abonne }>({
        mutation: SUSPENDRE_ABONNE,
        variables: { id },
      }),
    );
    const abonne = result.data?.suspendreAbonne;
    if (!abonne) throw new Error('Réponse invalide du serveur');
    return abonne;
  }

  async reactiverAbonne(id: string): Promise<Abonne> {
    const result = await firstValueFrom(
      this.apollo.mutate<{ reactiverAbonne: Abonne }>({
        mutation: REACTIVER_ABONNE,
        variables: { id },
      }),
    );
    const abonne = result.data?.reactiverAbonne;
    if (!abonne) throw new Error('Réponse invalide du serveur');
    return abonne;
  }

  async resilierAbonne(id: string): Promise<Abonne> {
    const result = await firstValueFrom(
      this.apollo.mutate<{ resilierAbonne: Abonne }>({
        mutation: RESILIER_ABONNE,
        variables: { id },
      }),
    );
    const abonne = result.data?.resilierAbonne;
    if (!abonne) throw new Error('Réponse invalide du serveur');
    return abonne;
  }

  async updateCompteur(abonneId: string, input: UpdateCompteurInput): Promise<Compteur> {
    const result = await firstValueFrom(
      this.apollo.mutate<{ updateCompteur: Compteur }>({
        mutation: UPDATE_COMPTEUR,
        variables: { abonneId, input },
      }),
    );
    const compteur = result.data?.updateCompteur;
    if (!compteur) throw new Error('Réponse invalide du serveur');
    return compteur;
  }

  async remplacerCompteur(abonneId: string, input: RemplacerCompteurInput): Promise<Compteur> {
    const result = await firstValueFrom(
      this.apollo.mutate<{ remplacerCompteur: Compteur }>({
        mutation: REMPLACER_COMPTEUR,
        variables: { abonneId, input },
      }),
    );
    const compteur = result.data?.remplacerCompteur;
    if (!compteur) throw new Error('Réponse invalide du serveur');
    return compteur;
  }

  async getHistoriqueCompteur(abonneId: string): Promise<HistoriqueCompteurEntry[]> {
    const result = await firstValueFrom(
      this.apollo.query<{ historiqueCompteur: HistoriqueCompteurEntry[] }>({
        query: GET_HISTORIQUE_COMPTEUR,
        variables: { id: abonneId },
      }),
    );
    return result.data?.historiqueCompteur ?? [];
  }
}
