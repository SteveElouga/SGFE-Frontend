import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

/**
 * Ouverture du PDF d'une facture.
 *
 * Le PDF est servi par un endpoint REST du gateway (`/factures/<id>/pdf/`)
 * protégé par le JWT + rôle ADMIN/COMPTABLE. Deux pièges évités ici :
 *  1. Le gateway n'a AUCUN préfixe `/api` — le chemin est à la racine, avec
 *     slash final (convention Django), exactement comme `/graphql`.
 *  2. Une navigation `<a href>` / `window.open(url)` ne porte pas le header
 *     `Authorization` → 401. On récupère donc le PDF via HttpClient (l'intercepteur
 *     JWT ajoute le Bearer) sous forme de blob, puis on l'ouvre.
 */
@Injectable({ providedIn: 'root' })
export class FacturePdfService {
  private readonly http = inject(HttpClient);

  /**
   * Récupère le PDF et l'ouvre dans un nouvel onglet (repli téléchargement si
   * la popup est bloquée). Lève en cas d'échec pour que l'appelant affiche un toast.
   *
   * ⚠️ À appeler dans le geste utilisateur (clic) : `window.open` est exécuté
   * de façon synchrone avant l'`await` pour éviter le blocage popup.
   */
  async open(factureId: string, filename?: string): Promise<void> {
    const win = window.open('', '_blank');
    try {
      const blob = await firstValueFrom(
        this.http.get(`/factures/${factureId}/pdf/`, { responseType: 'blob' }),
      );
      const url = URL.createObjectURL(blob);
      if (win) {
        win.location.href = url;
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename ?? `facture-${factureId}.pdf`;
        a.click();
      }
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      win?.close();
      throw err;
    }
  }
}
