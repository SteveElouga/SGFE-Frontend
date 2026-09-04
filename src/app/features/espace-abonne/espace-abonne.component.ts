import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import {
  EspaceAbonneData,
  EspaceAbonneFacture,
  EspaceAbonneService,
} from '../../core/espace-abonne/espace-abonne.service';
import { FcfaPipe } from '../../shared/pipes/fcfa.pipe';
import { PlurielPipe } from '../../shared/pipes/pluriel.pipe';

type Etat = 'loading' | 'ready' | 'invalid' | 'error';

/** Une facture enrichie de ce que l'abonné a besoin de savoir pour agir. */
export interface LigneEspace {
  facture: EspaceAbonneFacture;
  /** Régularisation : dette déclarée, sans relevé — elle s'affiche autrement. */
  regularisation: boolean;
  /** Reste dû et échéance dépassée. */
  echue: boolean;
  /** Jours écoulés depuis l'échéance (0 si pas échue). */
  joursDeRetard: number;
  /** Jours restants avant l'échéance (0 si déjà échue ou soldée). */
  joursRestants: number;
  soldee: boolean;
}

const JOUR_MS = 86_400_000;

/**
 * Écrans M-06 / MB-10 / 06 / 25 — Espace abonné PUBLIC (accès par lien WhatsApp
 * tokenisé, sans authentification — aucun authGuard sur la route `espace/:token`).
 *
 * L'abonné voit ses factures, leur statut et son solde, peut télécharger chaque
 * PDF, et — décision d'audit §10.2 levée — payer en ligne une facture non
 * soldée. Ce paiement est un MOCK/SANDBOX de démonstration : aucune vraie
 * passerelle n'est branchée. `EspaceAbonneService.creerPaiementEnLigne` crée
 * une session côté serveur, puis la page navigue vers l'URL de redirection
 * reçue — une route FRONTEND interne (`paiement-confirmation.component`) qui
 * simule la confirmation, jamais un fournisseur externe.
 * Le token du lien porte l'identité ; sa validation et l'anti-IDOR sur le PDF
 * sont côté gateway. Un token invalide/expiré → 401 → état « lien invalide ».
 *
 * ── Ce que l'abonné vient chercher ────────────────────────────────────────────
 *
 * Quelqu'un qui ouvre ce lien depuis WhatsApp pose trois questions, dans cet
 * ordre : combien je dois, est-ce que je suis en retard, et sur quoi.
 *
 * L'écran ne répondait qu'à la première et à la troisième. Tout ce qui n'était
 * pas payé portait le même rouge : une facture émise avant-hier et pas encore
 * exigible ressemblait trait pour trait à un arriéré de deux mois. C'est la
 * distinction la plus utile de la page — c'est elle qui dit s'il faut agir
 * aujourd'hui — et c'était la seule absente.
 *
 * D'où trois régimes pour le bandeau : rien à payer, une dette dont rien n'est
 * échu, une dette dont une partie l'est. Le rouge est réservé au dernier.
 *
 * ── L'ordre de la liste ───────────────────────────────────────────────────────
 *
 * Les factures sont triées par exigibilité, la plus ancienne d'abord — le même
 * ordre que celui dans lequel un versement s'impute (FIFO côté paiement). Ce
 * n'est pas cosmétique : ce que l'abonné lit en haut est ce que son argent
 * éteindra en premier. Un tri par date d'émission ferait mentir l'écran.
 *
 * ── Les régularisations ───────────────────────────────────────────────────────
 *
 * Une régularisation est une dette antérieure à l'application, saisie à la main.
 * Aucun index ne la justifie. Affichée comme les autres, elle donnait une facture
 * d'eau à laquelle il manquait son relevé — un tiret là où l'abonné cherche des
 * mètres cubes. Elle affiche donc son motif à la place, et le dit en toutes
 * lettres.
 */
@Component({
  selector: 'app-espace-abonne',
  standalone: true,
  imports: [PlurielPipe, TranslatePipe, FcfaPipe, DatePipe],
  templateUrl: './espace-abonne.component.html',
  styleUrl: './espace-abonne.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EspaceAbonneComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly svc = inject(EspaceAbonneService);

  private readonly token = this.route.snapshot.paramMap.get('token') ?? '';

  readonly etat = signal<Etat>('loading');
  readonly data = signal<EspaceAbonneData | null>(null);

  /** Id de la facture dont la session de paiement en ligne est en cours de création (une seule à la fois). */
  readonly chargementPaiement = signal<string | null>(null);

  /** Dernière erreur de paiement en ligne : la facture concernée et la clé i18n du message. */
  readonly erreurPaiement = signal<{ factureId: string; cle: string } | null>(null);

  /**
   * Les factures, enrichies et remises dans l'ordre où l'argent les éteindra.
   *
   * Le jour de référence est arrêté une fois pour l'ensemble du calcul : sinon
   * deux lignes évaluées de part et d'autre de minuit ne se compareraient pas.
   */
  readonly lignes = computed<LigneEspace[]>(() => {
    const factures = this.data()?.factures ?? [];
    const aujourdhui = this.debutDeJournee(new Date());

    return factures
      .map((f): LigneEspace => {
        const reste = f.solde_restant ?? 0;
        const soldee = reste <= 0;
        const limite = this.dateOuNull(f.date_limite_paiement);
        const ecart = limite ? Math.round((aujourdhui - limite) / JOUR_MS) : 0;
        return {
          facture: f,
          regularisation: (f.nature ?? '') === 'REGULARISATION',
          echue: !soldee && ecart > 0,
          joursDeRetard: !soldee && ecart > 0 ? ecart : 0,
          joursRestants: !soldee && ecart < 0 ? -ecart : 0,
          soldee,
        };
      })
      .sort((a, b) => {
        // Ce qui reste dû passe devant ce qui est réglé : l'abonné vient pour
        // ce qu'il doit, pas pour l'archive.
        if (a.soldee !== b.soldee) return a.soldee ? 1 : -1;
        const da = a.facture.date_limite_paiement || '9999-12-31';
        const db = b.facture.date_limite_paiement || '9999-12-31';
        return a.soldee ? db.localeCompare(da) : da.localeCompare(db);
      });
  });

  /** Solde total encore dû — la première des trois questions. */
  readonly soldeTotal = computed(() =>
    this.lignes().reduce((s, l) => s + (l.facture.solde_restant ?? 0), 0),
  );

  /** La part déjà exigible — la seule qui appelle une action aujourd'hui. */
  readonly soldeEchu = computed(() =>
    this.lignes()
      .filter((l) => l.echue)
      .reduce((s, l) => s + (l.facture.solde_restant ?? 0), 0),
  );

  readonly nbAPayer = computed(() => this.lignes().filter((l) => !l.soldee).length);

  /** Ancienneté de la dette échue : c'est elle qui déclenche les relances. */
  readonly retardMax = computed(() =>
    this.lignes().reduce((max, l) => Math.max(max, l.joursDeRetard), 0),
  );

  /** Prochaine échéance quand rien n'est encore échu — dit quand agir. */
  readonly prochaineEcheance = computed(() => {
    const attente = this.lignes().filter((l) => !l.soldee && !l.echue);
    return attente.length > 0 ? attente[0].facture.date_limite_paiement : null;
  });

  /**
   * Crédit disponible — ce que la régie doit à l'abonné.
   *
   * Il ne se soustrait pas du solde affiché : les deux montants répondent à des
   * questions différentes, « combien je dois » et « combien j'ai d'avance », et
   * les fondre en un seul chiffre rendrait l'un et l'autre incompréhensibles.
   */
  readonly avoir = computed(() => this.data()?.avoir ?? 0);

  /** Les trois régimes du bandeau. Le rouge est réservé au retard réel. */
  readonly regime = computed<'solde' | 'a-venir' | 'retard'>(() => {
    if (this.soldeTotal() <= 0) return 'solde';
    return this.soldeEchu() > 0 ? 'retard' : 'a-venir';
  });

  constructor() {
    this.charger();
  }

  charger(): void {
    if (!this.token) {
      this.etat.set('invalid');
      return;
    }
    this.etat.set('loading');
    this.svc.getFactures(this.token).subscribe({
      next: (d) => {
        this.data.set(d);
        this.etat.set('ready');
      },
      // 401 = token invalide/expiré (message dédié) ; tout le reste = incident serveur (réessayable).
      error: (err: HttpErrorResponse) => this.etat.set(err.status === 401 ? 'invalid' : 'error'),
    });
  }

  /** Ouvre le PDF de la facture (endpoint public, token dans l'URL → navigation directe). */
  ouvrirPdf(factureId: string): void {
    window.open(this.svc.pdfUrl(this.token, factureId), '_blank', 'noopener');
  }

  /** Télécharge le relevé de compte complet en CSV.
   *
   * Le SRS promet « export PDF et CSV » deux fois ; seul le PDF d'une facture
   * existait. L'abonné pouvait télécharger une facture à la fois, jamais l'état
   * de son compte.
   */
  telechargerCsv(): void {
    window.open(this.svc.csvUrl(this.token), '_blank', 'noopener');
  }

  /** Vrai si LA session de paiement de cette facture est en cours de création. */
  estEnChargement(factureId: string): boolean {
    return this.chargementPaiement() === factureId;
  }

  /** Clé i18n de l'erreur de paiement à afficher sous cette facture, s'il y en a une. */
  erreurPour(factureId: string): string | null {
    const e = this.erreurPaiement();
    return e && e.factureId === factureId ? e.cle : null;
  }

  /**
   * Lance un paiement en ligne pour une facture non soldée.
   *
   * MOCK/SANDBOX de démonstration (décision d'audit §10.2 levée) : crée une
   * session côté serveur, qui renvoie `url_redirection` en URL ABSOLUE
   * (`FRONTEND_URL` + chemin, voir `passerelle_paiement.py` côté backend) —
   * délibérément, pour que le mock d'aujourd'hui et un vrai fournisseur
   * externe demain suivent exactement le même contrat. `Router.navigateByUrl`
   * attend un chemin INTERNE (`/espace/...`) : lui passer une URL absolue le
   * ferait tenter de matcher `http:` comme premier segment de route, sans
   * jamais atteindre l'écran de confirmation. Une navigation de page complète
   * (`window.location.href`) fonctionne dans les deux cas — mock interne
   * (rechargement, l'app Angular redémarre sur la bonne route) et futur
   * fournisseur externe (domaine différent).
   */
  payerEnLigne(l: LigneEspace): void {
    const factureId = l.facture.facture_id;
    if (this.chargementPaiement()) return; // un paiement est déjà en cours

    this.erreurPaiement.set(null);
    this.chargementPaiement.set(factureId);
    this.svc.creerPaiementEnLigne(this.token, factureId, l.facture.solde_restant).subscribe({
      next: (session) => {
        this.chargementPaiement.set(null);
        window.location.href = session.url_redirection;
      },
      error: () => {
        this.chargementPaiement.set(null);
        this.erreurPaiement.set({ factureId, cle: 'ESPACE.PAIEMENT.ERREUR' });
      },
    });
  }

  /**
   * La ligne de vérification d'une facture : les index, et le prix du m³.
   *
   * Elle n'existait pas. L'abonné lisait un montant sans rien pour le
   * rapprocher de quoi que ce soit — et un montant qu'on ne peut pas vérifier
   * est un montant qu'on contestera.
   *
   * Rendue vide quand les index manquent (régularisation, ou facture d'avant
   * l'exposition de ces champs) : mieux vaut pas de ligne qu'une ligne
   * « 0 → 0 ».
   */
  releve(l: LigneEspace): string {
    const { ancien_index: ancien, nouveau_index: nouveau, prix_m3: prix } = l.facture;
    if (l.regularisation || ancien == null || nouveau == null || nouveau <= ancien) return '';
    const index = `${ancien.toLocaleString('fr-FR')} → ${nouveau.toLocaleString('fr-FR')}`;
    return prix ? `${index} · ${prix.toLocaleString('fr-FR')} FCFA/m³` : index;
  }

  /**
   * Le badge dit l'état de la dette, pas seulement celui du statut.
   *
   * `IMPAYEE` recouvre deux situations opposées : une facture émise hier, et un
   * arriéré de deux mois. Les peindre pareil, c'est effacer la seule chose que
   * l'abonné a besoin de lire.
   */
  badge(l: LigneEspace): { cle: string; classe: string } {
    if (l.soldee) return { cle: 'ESPACE.BADGE.REGLEE', classe: 'ea-badge--ok' };
    if (l.echue) return { cle: 'ESPACE.BADGE.EN_RETARD', classe: 'ea-badge--danger' };
    if ((l.facture.montant_paye ?? 0) > 0)
      return { cle: 'ESPACE.BADGE.PARTIELLE', classe: 'ea-badge--warn' };
    return { cle: 'ESPACE.BADGE.A_VENIR', classe: 'ea-badge--neutre' };
  }


  /** Minuit local : borne stable pour comparer des dates sans heure. */
  private debutDeJournee(d: Date): number {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }

  /**
   * Lit une date sans heure comme une date **locale**, et non comme un instant UTC.
   *
   * `new Date('2026-08-27')` ne rend pas le 27 août : il rend minuit UTC ce
   * jour-là, converti dans le fuseau du navigateur. À l'ouest de Greenwich, cela
   * tombe la veille au soir — et l'échéance recule d'un jour. Une facture due le
   * 27 s'annoncerait en retard dès le 27 au matin, et le compteur de jours
   * afficherait partout une unité de trop.
   *
   * Une échéance de facture n'a pas d'heure : c'est un jour du calendrier, et il
   * doit se lire dans le calendrier de celui qui regarde l'écran.
   *
   * Renvoie `null` sur une date illisible, plutôt qu'un `Invalid Date` qui
   * contaminerait silencieusement tous les calculs en aval.
   */
  private dateOuNull(iso: string | null | undefined): number | null {
    if (!iso) return null;

    const jourSeul = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
    if (jourSeul) {
      const [, a, m, j] = jourSeul;
      const d = new Date(Number(a), Number(m) - 1, Number(j));
      return Number.isNaN(d.getTime()) ? null : d.getTime();
    }

    // Horodatage complet : il porte son propre instant, on le ramène au jour local.
    const t = new Date(iso).getTime();
    return Number.isNaN(t) ? null : this.debutDeJournee(new Date(t));
  }
}
