import { HttpClient, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

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
@Injectable({ providedIn: 'root' })
export class ExportsService {
  private readonly http = inject(HttpClient);

  /** CSV des factures d'une campagne. */
  facturesCsv(campagneId: string): Promise<void> {
    return this.download('/rapports/factures.csv', { campagne_id: campagneId }, `factures-${campagneId}.csv`);
  }

  /** CSV des paiements d'une campagne. */
  paiementsCsv(campagneId: string): Promise<void> {
    return this.download('/rapports/paiements.csv', { campagne_id: campagneId }, `paiements-${campagneId}.csv`);
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
      resp = await firstValueFrom(
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
