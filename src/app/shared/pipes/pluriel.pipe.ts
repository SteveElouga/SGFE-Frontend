import { Pipe, PipeTransform, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';

/**
 * Choisit la forme d'un libellé selon un compteur.
 *
 * Trente libellés paramétrés étaient accordés **en dur au pluriel** :
 * « {{n}} agents affectés » donnait « 1 agents affectés », « {{count}} factures »
 * donnait « 1 factures ». Le motif à deux clés existait déjà six fois dans le
 * dépôt — il n'avait simplement pas été suivi.
 *
 * Le pipe cherche, dans l'ordre, `CLE_ZERO`, `CLE_SINGULAR`, `CLE_PLURAL`, et
 * retombe sur `CLE` si la variante n'existe pas. Une clé sans variante continue
 * donc de fonctionner : la migration peut se faire libellé par libellé.
 *
 * Zéro a sa propre forme parce que « 0 facture » se lit comme un décompte
 * alors que c'est un état : « Aucune facture » dit ce qui se passe.
 *
 * ```html
 * {{ 'FACTURATION.SUBTITLE' | pluriel:count():{ count: count() } }}
 * ```
 *
 * Impur, comme `TranslatePipe` : la langue peut changer sans que le compteur
 * bouge.
 */
@Pipe({ name: 'pluriel', pure: false })
export class PlurielPipe implements PipeTransform {
  private readonly translate = inject(TranslateService);

  transform(cleBase: string, n: number, params: Record<string, unknown> = {}): string {
    const lang = this.translate.currentLang() ?? undefined;
    const suffixe = n === 0 ? '_ZERO' : n === 1 ? '_SINGULAR' : '_PLURAL';

    const candidate = `${cleBase}${suffixe}`;
    const rendu = this.translate.instant(candidate, params, lang);

    // `instant` rend la clé elle-même quand elle est absente : c'est le signal
    // que ce libellé n'a pas encore sa variante, et qu'il faut servir la base.
    if (rendu !== candidate) return rendu;

    // Zéro sans forme dédiée retombe sur le pluriel avant la base — « 0 factures »
    // reste meilleur que « 0 facture ».
    if (n === 0) {
      const plur = `${cleBase}_PLURAL`;
      const renduPlur = this.translate.instant(plur, params, lang);
      if (renduPlur !== plur) return renduPlur;
    }

    return this.translate.instant(cleBase, params, lang);
  }
}
