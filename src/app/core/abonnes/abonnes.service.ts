import { Injectable, inject } from '@angular/core';
import { Apollo } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import { GET_ABONNE, GET_ABONNES } from '../../graphql/queries/abonnes.queries';
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

export interface RemplacerCompteurInput {
  numeroCompteur: number;
  quartier: string;
  camp: number;
  indexInitial: number;
  datePose: string;
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

  async getAbonnes(statut?: StatutAbonne): Promise<Abonne[]> {
    const result = await firstValueFrom(
      this.apollo.query<{ abonnes: Abonne[] }>({
        query: GET_ABONNES,
        variables: statut ? { statut } : {},
        fetchPolicy: 'network-only',
      }),
    );
    return result.data?.abonnes ?? [];
  }

  async getAbonne(id: string): Promise<Abonne> {
    const result = await firstValueFrom(
      this.apollo.query<{ abonne: Abonne }>({
        query: GET_ABONNE,
        variables: { id },
        fetchPolicy: 'network-only',
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
}
