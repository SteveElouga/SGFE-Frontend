import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

/** Une facture telle que renvoyée par l'endpoint public de l'espace abonné. */
export interface EspaceAbonneFacture {
  facture_id: string;
  numero: string;
  date_releve: string;
  montant: number;
  statut: string;
  date_limite_paiement: string;
  solde_restant: number;
  montant_paye: number;
}

/** Réponse de `GET /espace-abonne/<token>/`. */
export interface EspaceAbonneData {
  abonne_id: string;
  token_expiration: string;
  factures: EspaceAbonneFacture[];
}

/**
 * Accès PUBLIC (sans authentification) aux factures d'un abonné, identifié par
 * le token du lien WhatsApp. Tout le contrôle d'accès est porté par le gateway
 * (validation du token côté Notification Service, anti-IDOR sur le PDF) — voir
 * `gateway/schema/espace_abonne.py`.
 *
 * Deux conventions, comme `/graphql` et `/factures/<id>/pdf/` :
 *  1. Chemin à la RACINE, slash final (Django), SANS préfixe `/api`.
 *  2. Le token voyage dans le CHEMIN (pas en query string) pour ne pas fuiter
 *     dans les logs/en-tête Referer.
 */
@Injectable({ providedIn: 'root' })
export class EspaceAbonneService {
  private readonly http = inject(HttpClient);

  /** Factures + soldes de l'abonné. Renvoie 401 si le token est invalide/expiré. */
  getFactures(token: string): Observable<EspaceAbonneData> {
    return this.http.get<EspaceAbonneData>(`/espace-abonne/${encodeURIComponent(token)}/`);
  }

  /**
   * URL du PDF d'une facture. Endpoint public (token dans le chemin) : on l'ouvre
   * par navigation directe (`window.open`), donc sans passer par l'intercepteur
   * JWT. Le gateway vérifie que la facture appartient bien à l'abonné du token.
   */
  pdfUrl(token: string, factureId: string): string {
    return `/espace-abonne/${encodeURIComponent(token)}/facture/${encodeURIComponent(factureId)}/pdf/`;
  }
}
