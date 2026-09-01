import { HttpClient, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

import { AuthService } from '../auth/auth.service';
import { fetchWithAuthRetry } from '../auth/rest-auth-retry';

/**
 * Exports back-office de l'écran Rapports (écran 13).
 *
 * Ces 4 routes sont des flux binaires HTTP servis par la Gateway **hors GraphQL**,
 * protégés par le même JWT (rôle ADMIN/COMPTABLE). Le `jwtInterceptor` ajoute le
 * `Authorization: Bearer` à toutes les requêtes HttpClient → ces chemins sont
 * couverts automatiquement.
 *
 * ⚠️ Un `<a href>` / `window.open()` ne porterait pas l'en-tête d'auth (→ 401) :
 * on télécharge donc en `responseType: 'blob'` puis on déclenche l'enregistrement
 * via un Object URL. Chemins **relatifs** (proxy en dev, nginx en prod).
 */
/**
 * Critères d'un export CSV. Tous optionnels et cumulables.
 *
 * Aucun critère = tout l'historique, ce qu'une clôture d'exercice demande. Le
 * `campagne_id` était auparavant obligatoire côté serveur (400 sinon) : aucun
 * journal mensuel n'était possible, et les régularisations — créées sans
 * campagne — étaient exportables par aucun chemin.
 */
export interface CriteresExport {
  campagneId?: string;
  /** Borne ISO `AAAA-MM-JJ`, incluse. */
  dateDebut?: string;
  /** Borne ISO `AAAA-MM-JJ`, incluse. */
  dateFin?: string;
}

@Injectable({ providedIn: 'root' })
export class ExportsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  /** CSV des factures — par campagne, par période, ou tout l'historique. */
  facturesCsv(criteres: CriteresExport = {}): Promise<void> {
    return this.download('/rapports/factures.csv', ...this.parametres('factures', criteres));
  }

  /** CSV des paiements — par campagne, par période, ou tout l'historique. */
  paiementsCsv(criteres: CriteresExport = {}): Promise<void> {
    return this.download('/rapports/paiements.csv', ...this.parametres('paiements', criteres));
  }

  /**
   * Traduit les critères en query-string, et compose un nom de fichier de repli.
   *
   * Les bornes vides ne sont PAS envoyées : la vue distingue « pas de borne » d'une
   * borne illisible, et refuse la seconde (400). Envoyer `date_debut=` ferait
   * échouer un export qui n'en demandait pas.
   *
   * Le nom de repli porte le critère — trois exports du même mois dans le dossier
   * des téléchargements doivent rester distinguables. Il ne sert que si le serveur
   * n'a pas posé de `Content-Disposition` ; en pratique il en pose toujours un.
   */
  private parametres(base: string, c: CriteresExport): [Record<string, string>, string] {
    const params: Record<string, string> = {};
    if (c.campagneId) params['campagne_id'] = c.campagneId;
    if (c.dateDebut) params['date_debut'] = c.dateDebut;
    if (c.dateFin) params['date_fin'] = c.dateFin;

    const suffixe = c.campagneId
      ? c.campagneId
      : c.dateDebut || c.dateFin
        ? `${c.dateDebut || 'debut'}_${c.dateFin || 'fin'}`
        : 'tout';
    return [params, `${base}-${suffixe}.csv`];
  }

  /** PDF de synthèse chiffrée d'une campagne. */
  synthesePdf(campagneId: string): Promise<void> {
    return this.download('/rapports/synthese/pdf/', { campagne_id: campagneId }, `synthese-${campagneId}.pdf`);
  }

  /** PDF du bilan des impayés (global, toutes campagnes). */
  bilanImpayesPdf(): Promise<void> {
    return this.download('/bilan-impayes/pdf/', {}, 'bilan-impayes.pdf');
  }

  private async download(url: string, params: Record<string, string>, fallbackName: string): Promise<void> {
    let resp: HttpResponse<Blob>;
    try {
      resp = await fetchWithAuthRetry(this.auth, () =>
        this.http.get(url, { params, responseType: 'blob', observe: 'response' }),
      );
    } catch (err) {
      // Sur erreur (4xx/5xx), le corps est un JSON { erreur } — pas un fichier.
      throw new Error(await this.readError(err as HttpErrorResponse));
    }
    this.saveBlob(resp.body!, this.filenameFrom(resp) ?? fallbackName);
  }

  private saveBlob(blob: Blob, name: string): void {
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
  }

  /** Nom de fichier fourni par l'en-tête `Content-Disposition`. */
  private filenameFrom(resp: HttpResponse<Blob>): string | null {
    const cd = resp.headers.get('Content-Disposition');
    if (!cd) return null;
    const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
    return m ? decodeURIComponent(m[1]) : null;
  }

  /** Le corps d'erreur est un blob JSON `{ "erreur": "..." }` à re-parser. */
  private async readError(err: HttpErrorResponse): Promise<string> {
    if (err.error instanceof Blob) {
      try {
        return (JSON.parse(await err.error.text()).erreur as string) ?? 'Erreur inconnue';
      } catch {
        return 'Erreur inconnue';
      }
    }
    return (err.error?.erreur as string) ?? err.message ?? 'Erreur inconnue';
  }
}
