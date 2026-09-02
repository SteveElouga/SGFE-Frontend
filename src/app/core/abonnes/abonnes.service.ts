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
import { Abonne, Compteur, StatutAbonne } from '../../shared/models/abonne.model';
import type { AbonneUpdatedSubscription, CreateAbonneMutation, GetAbonneQuery, GetAbonnesActifsQuery, GetAbonnesQuery, GetHistoriqueCompteurQuery, ReactiverAbonneMutation, RemplacerCompteurMutation, ResilierAbonneMutation, SuspendreAbonneMutation, UpdateAbonneMutation, UpdateCompteurMutation } from '../../graphql/generated';

/**
 * Entrée de `remplacerCompteur`, alignée sur `RemplacerCompteurInput` de la
 * gateway.
 *
 * Les noms portent tous le préfixe « nouveau » parce que la mutation en
 * manipule deux : celui qu'on archive et celui qu'on pose. Sans ce préfixe,
 * `numeroCompteur` ne dit pas duquel il parle — et c'est exactement l'erreur
 * qu'a faite cette interface, qui décrivait un compteur générique là où le
 * schéma en distingue deux. Cinq champs sur six ne correspondaient à rien
 * côté serveur, et le remplacement échouait à chaque tentative.
 */
export interface RemplacerCompteurInput {
  /** Dernier index relevé de l'ancien compteur — il est archivé avec lui. */
  indexFermeture: number;
  nouveauNumeroCompteur: number;
  nouveauQuartier: string;
  nouveauCamp: number;
  nouvelIndexInitial: number;
  dateRemplacement: string;
  /** Motif du remplacement (ex. « Compteur défectueux »). Optionnel. */
  motif?: string;
  /** Emplacement du nouveau compteur dans le camp. Optionnel. */
  nouvellePosition?: string;
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
  /** Emplacement du compteur dans le camp (texte libre). Optionnel. */
  position?: string;
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
  position?: string;
}

@Injectable({ providedIn: 'root' })
export class AbonnesService {
  private readonly apollo = inject(Apollo);

  startCacheSync(): void {
    type AbonneActifCache = { id: string; compteur?: { quartier: string; camp: number } | null };

    this.apollo
      .subscribe<AbonneUpdatedSubscription>({ query: ABONNE_UPDATED_SUB,
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

  async getAbonnesActifs(): Promise<Array<{ id: string; quartier: string | null; camp: number | null }>> {
    const result = await firstValueFrom(
      this.apollo.query<GetAbonnesActifsQuery>({ query: GET_ABONNES_ACTIFS,
        // C'est cette lecture qui affichait 17 abonnés au lieu de 18.
        fetchPolicy: 'network-only',
      }),
    );
    return (result.data?.abonnesActifs ?? []).map((a) => ({
      id: a.id,
      quartier: a.compteur?.quartier ?? null,
      camp: a.compteur?.camp ?? null,
    }));
  }

  watchAbonnes(statut?: StatutAbonne): QueryRef<GetAbonnesQuery> {
    return this.apollo.watchQuery<GetAbonnesQuery>({ query: GET_ABONNES,
      variables: statut ? { statut } : {},
    });
  }

  watchAbonne(id: string): QueryRef<GetAbonneQuery> {
    return this.apollo.watchQuery<GetAbonneQuery>({ query: GET_ABONNE,
      variables: { id },
    });
  }

  async getAbonne(id: string): Promise<NonNullable<GetAbonneQuery['abonne']>> {
    const result = await firstValueFrom(
      this.apollo.query<GetAbonneQuery>({ query: GET_ABONNE,
        variables: { id },
      }),
    );
    const abonne = result.data?.abonne;
    if (!abonne) throw new Error('Abonné introuvable');
    return abonne;
  }

  async createAbonne(input: CreateAbonneInput): Promise<NonNullable<CreateAbonneMutation['createAbonne']>> {
    const result = await firstValueFrom(
      this.apollo.mutate<CreateAbonneMutation>({ mutation: CREATE_ABONNE,
        variables: { input },
        // Sans cela, la liste garde son cache : un abonné créé n'apparaissait
        // pas dans `/abonnes` avant un rechargement forcé du navigateur.
        // `startCacheSync` tient `GET_ABONNES_ACTIFS` à jour, mais rien ne
        // suivait `GET_ABONNES`, la requête de la liste.
        refetchQueries: [{ query: GET_ABONNES }, { query: GET_ABONNES_ACTIFS }],
        awaitRefetchQueries: true,
      }),
    );
    const abonne = result.data?.createAbonne;
    if (!abonne) throw new Error('Réponse invalide du serveur');
    return abonne;
  }

  async updateAbonne(id: string, input: UpdateAbonneInput): Promise<NonNullable<UpdateAbonneMutation['updateAbonne']>> {
    const result = await firstValueFrom(
      this.apollo.mutate<UpdateAbonneMutation>({ mutation: UPDATE_ABONNE,
        variables: { id, input },
      }),
    );
    const abonne = result.data?.updateAbonne;
    if (!abonne) throw new Error('Réponse invalide du serveur');
    return abonne;
  }

  async suspendreAbonne(id: string): Promise<NonNullable<SuspendreAbonneMutation['suspendreAbonne']>> {
    const result = await firstValueFrom(
      this.apollo.mutate<SuspendreAbonneMutation>({ mutation: SUSPENDRE_ABONNE,
        variables: { id },
      }),
    );
    const abonne = result.data?.suspendreAbonne;
    if (!abonne) throw new Error('Réponse invalide du serveur');
    return abonne;
  }

  async reactiverAbonne(id: string): Promise<NonNullable<ReactiverAbonneMutation['reactiverAbonne']>> {
    const result = await firstValueFrom(
      this.apollo.mutate<ReactiverAbonneMutation>({ mutation: REACTIVER_ABONNE,
        variables: { id },
      }),
    );
    const abonne = result.data?.reactiverAbonne;
    if (!abonne) throw new Error('Réponse invalide du serveur');
    return abonne;
  }

  async resilierAbonne(id: string): Promise<NonNullable<ResilierAbonneMutation['resilierAbonne']>> {
    const result = await firstValueFrom(
      this.apollo.mutate<ResilierAbonneMutation>({ mutation: RESILIER_ABONNE,
        variables: { id },
      }),
    );
    const abonne = result.data?.resilierAbonne;
    if (!abonne) throw new Error('Réponse invalide du serveur');
    return abonne;
  }

  async updateCompteur(abonneId: string, input: UpdateCompteurInput): Promise<NonNullable<UpdateCompteurMutation['updateCompteur']>> {
    const result = await firstValueFrom(
      this.apollo.mutate<UpdateCompteurMutation>({ mutation: UPDATE_COMPTEUR,
        variables: { abonneId, input },
      }),
    );
    const compteur = result.data?.updateCompteur;
    if (!compteur) throw new Error('Réponse invalide du serveur');
    return compteur;
  }

  async remplacerCompteur(abonneId: string, input: RemplacerCompteurInput): Promise<Compteur> {
    const result = await firstValueFrom(
      this.apollo.mutate<RemplacerCompteurMutation>({ mutation: REMPLACER_COMPTEUR,
        variables: { abonneId, input },
      }),
    );
    const compteur = result.data?.remplacerCompteur;
    if (!compteur) throw new Error('Réponse invalide du serveur');
    return compteur;
  }

  async getHistoriqueCompteur(abonneId: string): Promise<GetHistoriqueCompteurQuery['historiqueCompteur']> {
    const result = await firstValueFrom(
      this.apollo.query<GetHistoriqueCompteurQuery>({ query: GET_HISTORIQUE_COMPTEUR,
        variables: { id: abonneId },
      }),
    );
    return result.data?.historiqueCompteur ?? [];
  }
}
