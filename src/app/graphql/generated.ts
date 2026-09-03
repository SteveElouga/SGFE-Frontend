/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
export type CorrigerReleveInput = {
  abonneId: string;
  campagneId: string;
  nouveauIndex: number;
  observation?: string;
};

export type CreateAbonneInput = {
  adresse?: string | null | undefined;
  camp: number;
  datePose: string;
  indexInitial: number;
  nom: string;
  numeroCompteur: number;
  position?: string | null | undefined;
  prenom: string;
  quartier: string;
  telephoneWhatsapp: string;
};

export type CreateCampagneInput = {
  datePlanifiee?: string;
  demarrerMaintenant?: boolean;
  envoyerWhatsappAuto?: boolean;
  genererFacturesAuto?: boolean;
  nom: string;
  numeroMobileMoney?: string;
  periodeAnnee: number;
  periodeMois: number;
};

export type MarquerNonReleveInput = {
  abonneId: string;
  campagneId: string;
  observation?: string;
  statut?: string;
};

export type RemplacerCompteurInput = {
  dateRemplacement: string;
  indexFermeture: number;
  motif?: string;
  nouveauCamp: number;
  nouveauNumeroCompteur: number;
  nouveauQuartier: string;
  nouvelIndexInitial: number;
  nouvellePosition?: string;
};

export type Role =
  | 'ADMIN'
  | 'AGENT'
  | 'COMPTABLE'
  | 'SUPERVISEUR';

export type SaisirIndexInput = {
  abonneId: string;
  campagneId: string;
  nouveauIndex: number;
  observation?: string;
};

export type StatutAbonne =
  | 'ACTIF'
  | 'RESILIE'
  | 'SUSPENDU';

export type StatutCompteur =
  | 'ACTIF'
  | 'DESACTIVE'
  | 'REMPLACE';

export type UpdateAbonneInput = {
  adresse?: string | null | undefined;
  nom?: string | null | undefined;
  prenom?: string | null | undefined;
  telephoneWhatsapp?: string | null | undefined;
};

export type UpdateCompteurInput = {
  camp?: number | null | undefined;
  datePose?: string | null | undefined;
  indexInitial?: number | null | undefined;
  position?: string | null | undefined;
  quartier?: string | null | undefined;
};

export type UpdateInfosSocieteInput = {
  adresse?: string;
  logoPath?: string;
  nom?: string;
  telephone?: string;
};

export type ZoneInput = {
  camp: number;
  quartier: string;
};

export type AbonneListFieldsFragment = { id: string, numeroAbonne: string, nom: string, prenom: string, statut: StatutAbonne, compteur: { id: string, numeroCompteur: number, quartier: string, camp: number, statut: StatutCompteur } | null };

export type AbonneDetailFieldsFragment = { id: string, numeroAbonne: string, nom: string, prenom: string, telephoneWhatsapp: string, adresse: string | null, statut: StatutAbonne, createdAt: string, compteur: { id: string, numeroCompteur: number, quartier: string, camp: number, indexInitial: number, datePose: string, position: string, statut: StatutCompteur } | null };

export type FactureLigneFieldsFragment = { factureId: string, numeroFacture: string, abonneId: string, abonneNom: string, abonneNumero: string, campagneId: string, campagneNom: string, campagnePeriodeMois: number, campagnePeriodeAnnee: number, statut: string, consommation: number, montant: number, dateReleve: string, dateLimitePaiement: string };

export type CampagneFieldsFragment = { campagneId: string, nom: string, periodeMois: number, periodeAnnee: number, statut: string, datePlanifiee: string, dateCreation: string, dateCloture: string, createdBy: string, numeroMobileMoney: string, genererFacturesAuto: boolean, envoyerWhatsappAuto: boolean };

export type DiffusionFieldsFragment = { diffusionId: string, message: string, statut: string, nbTotal: number, nbEnvoyes: number, nbEchecs: number, createdBy: string, createdAt: string };

export type PaiementFieldsFragment = { paiementId: string, factureId: string, montant: number, datePaiement: string, modePaiement: string, referenceTransaction: string, createdAt: string, annule: boolean, annuleLe: string, annulePar: string, motifAnnulation: string };

export type CreateAbonneMutationVariables = Exact<{
  input: CreateAbonneInput;
}>;


export type CreateAbonneMutation = { createAbonne: { id: string, numeroAbonne: string, compteur: { numeroCompteur: number } | null } };

export type UpdateAbonneMutationVariables = Exact<{
  id: string | number;
  input: UpdateAbonneInput;
}>;


export type UpdateAbonneMutation = { updateAbonne: { id: string, nom: string, prenom: string, telephoneWhatsapp: string, adresse: string | null, statut: StatutAbonne } };

export type SuspendreAbonneMutationVariables = Exact<{
  id: string | number;
}>;


export type SuspendreAbonneMutation = { suspendreAbonne: { id: string, numeroAbonne: string, nom: string, prenom: string, statut: StatutAbonne, compteur: { id: string, numeroCompteur: number, quartier: string, camp: number, statut: StatutCompteur } | null } };

export type ReactiverAbonneMutationVariables = Exact<{
  id: string | number;
}>;


export type ReactiverAbonneMutation = { reactiverAbonne: { id: string, numeroAbonne: string, nom: string, prenom: string, statut: StatutAbonne, compteur: { id: string, numeroCompteur: number, quartier: string, camp: number, statut: StatutCompteur } | null } };

export type ResilierAbonneMutationVariables = Exact<{
  id: string | number;
}>;


export type ResilierAbonneMutation = { resilierAbonne: { id: string, statut: StatutAbonne } };

export type UpdateCompteurMutationVariables = Exact<{
  abonneId: string | number;
  input: UpdateCompteurInput;
}>;


export type UpdateCompteurMutation = { updateCompteur: { id: string, numeroCompteur: number, quartier: string, camp: number, indexInitial: number, datePose: string, position: string, statut: StatutCompteur } };

export type RemplacerCompteurMutationVariables = Exact<{
  abonneId: string | number;
  input: RemplacerCompteurInput;
}>;


export type RemplacerCompteurMutation = { remplacerCompteur: { id: string, numeroCompteur: number, quartier: string, camp: number, indexInitial: number, datePose: string, position: string, statut: StatutCompteur } };

export type UserFieldsFragment = { id: string, username: string, email: string, phoneNumber: string, role: Role, isActive: boolean, createdAt: string };

export type LoginMutationVariables = Exact<{
  identifier: string;
  password: string;
}>;


export type LoginMutation = { login: { accessToken: string, expiresIn: number, user: { id: string, username: string, email: string, phoneNumber: string, role: Role, isActive: boolean, createdAt: string } } };

export type RefreshTokenMutationVariables = Exact<{ [key: string]: never; }>;


export type RefreshTokenMutation = { refreshToken: { accessToken: string, expiresIn: number, user: { id: string, username: string, email: string, phoneNumber: string, role: Role, isActive: boolean, createdAt: string } } };

export type LogoutMutationVariables = Exact<{ [key: string]: never; }>;


export type LogoutMutation = { logout: boolean };

export type RequestPasswordResetMutationVariables = Exact<{
  email: string;
}>;


export type RequestPasswordResetMutation = { requestPasswordReset: boolean };

export type ActivateAccountMutationVariables = Exact<{
  token: string;
  password: string;
}>;


export type ActivateAccountMutation = { activateAccount: boolean };

export type ResetPasswordMutationVariables = Exact<{
  token: string;
  password: string;
}>;


export type ResetPasswordMutation = { resetPassword: boolean };

export type RequestPhoneOtpMutationVariables = Exact<{
  phoneNumber: string;
}>;


export type RequestPhoneOtpMutation = { requestPhoneOtp: { maskedPhone: string } };

export type VerifyOtpAndSetPasswordMutationVariables = Exact<{
  phoneNumber: string;
  otpCode: string;
  password: string;
}>;


export type VerifyOtpAndSetPasswordMutation = { verifyOtpAndSetPassword: boolean };

export type CreerCampagneMutationVariables = Exact<{
  input: CreateCampagneInput;
}>;


export type CreerCampagneMutation = { creerCampagne: { campagneId: string, nom: string, statut: string, periodeMois: number, periodeAnnee: number, datePlanifiee: string, dateCreation: string, dateCloture: string } };

export type AjouterAbonnesCampagneMutationVariables = Exact<{
  campagneId: string;
  abonneIds: Array<string> | string;
}>;


export type AjouterAbonnesCampagneMutation = { ajouterAbonnesCampagne: { nbAjoutes: number, nbIgnores: number } };

export type AffecterAgentMutationVariables = Exact<{
  campagneId: string;
  agentId: string;
}>;


export type AffecterAgentMutation = { affecterAgent: { campagneId: string, nom: string, statut: string } };

export type AffecterZonesMutationVariables = Exact<{
  campagneId: string;
  agentId: string;
  zones: Array<ZoneInput> | ZoneInput;
}>;


export type AffecterZonesMutation = { affecterZones: Array<{ agentId: string, username: string, role: string, statut: string, derniereActivite: string, nbReleves: number, zones: Array<{ quartier: string, camp: number, nbAbonnes: number, nbReleves: number, pct: number }> }> };

export type CloturerCampagneMutationVariables = Exact<{
  campagneId: string;
}>;


export type CloturerCampagneMutation = { cloturerCampagne: { campagneId: string, statut: string, dateCloture: string } };

export type DemarrerCampagneMutationVariables = Exact<{
  campagneId: string;
}>;


export type DemarrerCampagneMutation = { demarrerCampagne: { campagneId: string, statut: string } };

export type SaisirIndexMutationVariables = Exact<{
  input: SaisirIndexInput;
}>;


export type SaisirIndexMutation = { saisirIndex: { releveId: string, abonneId: string, nouveauIndex: number, consommation: number, statut: string, dateReleve: string } };

export type MarquerNonReleveMutationVariables = Exact<{
  input: MarquerNonReleveInput;
}>;


export type MarquerNonReleveMutation = { marquerNonReleve: { releveId: string, abonneId: string, statut: string, observation: string } };

export type CorrigerReleveMutationVariables = Exact<{
  input: CorrigerReleveInput;
}>;


export type CorrigerReleveMutation = { corrigerReleve: { releveId: string, nouveauIndex: number, consommation: number, statut: string, audit: Array<{ action: string, nouvelIndex: number, horodatage: string, auteur: { username: string, role: string } }> } };

export type CreerDiffusionMutationVariables = Exact<{
  message: string;
  abonneIds: Array<string> | string;
}>;


export type CreerDiffusionMutation = { creerDiffusion: { diffusionId: string, message: string, statut: string, nbTotal: number, nbEnvoyes: number, nbEchecs: number, createdBy: string, createdAt: string } };

export type UpdateInfosSocieteMutationVariables = Exact<{
  input: UpdateInfosSocieteInput;
}>;


export type UpdateInfosSocieteMutation = { updateInfosSociete: { nom: string, adresse: string, telephone: string, logoPath: string, updatedAt: string } };

export type UpdateConfigMutationVariables = Exact<{
  cle: string;
  valeur: string;
}>;


export type UpdateConfigMutation = { updateConfig: { cle: string, valeur: string, description: string } };

export type TesterEnvoiWhatsappMutationVariables = Exact<{
  phoneNumber: string;
}>;


export type TesterEnvoiWhatsappMutation = { testerEnvoiWhatsapp: { success: boolean, message: string } };

export type RevoquerTousTokensAbonnesMutationVariables = Exact<{ [key: string]: never; }>;


export type RevoquerTousTokensAbonnesMutation = { revoquerTousTokensAbonnes: number };

export type RevoquerTokenAbonneMutationVariables = Exact<{
  tokenId: string;
}>;


export type RevoquerTokenAbonneMutation = { revoquerTokenAbonne: boolean };

export type EnregistrerPaiementMutationVariables = Exact<{
  factureId: string;
  abonneId: string;
  montant: number;
  datePaiement: string;
  modePaiement: string;
  referenceTransaction?: string | null | undefined;
}>;


export type EnregistrerPaiementMutation = { enregistrerPaiement: { paiementId: string, factureId: string, montant: number, datePaiement: string, modePaiement: string, referenceTransaction: string, createdAt: string } };

export type GenererFacturesMutationVariables = Exact<{
  campagneId: string;
  envoyerWhatsappAuto: boolean;
}>;


export type GenererFacturesMutation = { genererFactures: Array<{ factureId: string, numeroFacture: string, abonneId: string, montant: number, statut: string }> };

export type EnvoyerToutesFacturesWhatsappMutationVariables = Exact<{
  campagneId: string;
}>;


export type EnvoyerToutesFacturesWhatsappMutation = { envoyerToutesFacturesWhatsapp: number };

export type EnvoyerFactureWhatsappMutationVariables = Exact<{
  factureId: string;
  abonneId: string;
}>;


export type EnvoyerFactureWhatsappMutation = { envoyerFactureWhatsapp: { envoiId: string, statut: string, dateEnvoi: string, erreur: string } };

export type RenvoyerFactureWhatsappMutationVariables = Exact<{
  factureId: string;
}>;


export type RenvoyerFactureWhatsappMutation = { renvoyerFactureWhatsapp: { envoiId: string, statut: string, dateEnvoi: string, erreur: string } };

export type RenvoyerEnvoiMutationVariables = Exact<{
  envoiId: string;
}>;


export type RenvoyerEnvoiMutation = { renvoyerEnvoi: { envoiId: string, statut: string, dateEnvoi: string, erreur: string } };

export type EnvoyerRecuPaiementMutationVariables = Exact<{
  paiementId: string;
  factureId: string;
  abonneId: string;
}>;


export type EnvoyerRecuPaiementMutation = { envoyerRecuPaiement: { envoiId: string, statut: string, dateEnvoi: string, erreur: string } };

export type UpdateStatutFactureMutationVariables = Exact<{
  factureId: string;
  statut: string;
}>;


export type UpdateStatutFactureMutation = { updateStatutFacture: { factureId: string, numeroFacture: string, statut: string, montant: number, dateLimitePaiement: string } };

export type UpdateTarifMutationVariables = Exact<{
  prixM3: number;
  dateEffet: string;
}>;


export type UpdateTarifMutation = { updateTarif: { tarifId: string, prixM3: number, dateEffet: string, isActive: boolean } };

export type CreerRegularisationMutationVariables = Exact<{
  abonneId: string;
  montant: number;
  motif: string;
  dateLimitePaiement?: string | null | undefined;
}>;


export type CreerRegularisationMutation = { creerRegularisation: { factureId: string, numeroFacture: string, montant: number, statut: string, dateLimitePaiement: string } };

export type EnregistrerPaiementAbonneMutationVariables = Exact<{
  abonneId: string;
  montant: number;
  datePaiement: string;
  modePaiement: string;
  referenceTransaction?: string | null | undefined;
}>;


export type EnregistrerPaiementAbonneMutation = { enregistrerPaiementAbonne: { excedentEnAvoir: number, paiements: Array<{ paiementId: string, factureId: string, montant: number, modePaiement: string, datePaiement: string }> } };

export type AnnulerFactureMutationVariables = Exact<{
  factureId: string;
  motif: string;
}>;


export type AnnulerFactureMutation = { annulerFacture: { factureId: string, numeroFacture: string, statut: string, motifAnnulation: string, dateAnnulation: string, annuleePar: string, remplaceeParId: string } };

export type RegenererFactureMutationVariables = Exact<{
  factureId: string;
  motif: string;
}>;


export type RegenererFactureMutation = { regenererFacture: { annulee: { factureId: string, numeroFacture: string, statut: string, motifAnnulation: string, remplaceeParId: string }, nouvelle: { factureId: string, numeroFacture: string, statut: string, montant: number, consommation: number, ancienIndex: number, nouveauIndex: number, dateLimitePaiement: string, remplaceId: string } } };

export type AnnulerPaiementMutationVariables = Exact<{
  paiementId: string;
  motif: string;
}>;


export type AnnulerPaiementMutation = { annulerPaiement: { paiementId: string, factureId: string, montant: number, datePaiement: string, modePaiement: string, referenceTransaction: string, createdAt: string, operateur: string, statutFacture: string, annule: boolean, annuleLe: string, annulePar: string, motifAnnulation: string } };

export type CrediterAvoirMutationVariables = Exact<{
  abonneId: string;
  montant: number;
  motif: string;
}>;


export type CrediterAvoirMutation = { crediterAvoir: { abonneId: string, montant: number, mouvements: Array<{ montant: number, typeMouvement: string, motif: string, factureId: string, creePar: string, createdAt: string }> } };

export type UserFieldsFullFragment = { id: string, username: string, email: string, phoneNumber: string, role: Role, isActive: boolean, createdAt: string };

export type CreateUserMutationVariables = Exact<{
  username: string;
  phoneNumber: string;
  role: Role;
  email?: string | null | undefined;
}>;


export type CreateUserMutation = { createUser: { id: string, username: string, email: string, phoneNumber: string, role: Role, isActive: boolean, createdAt: string } };

export type UpdateUserMutationVariables = Exact<{
  id: string | number;
  email?: string | null | undefined;
  role?: Role | null | undefined;
  phoneNumber?: string | null | undefined;
}>;


export type UpdateUserMutation = { updateUser: { id: string, username: string, email: string, phoneNumber: string, role: Role, isActive: boolean, createdAt: string } };

export type DeactivateUserMutationVariables = Exact<{
  id: string | number;
}>;


export type DeactivateUserMutation = { deactivateUser: { id: string, username: string, email: string, phoneNumber: string, role: Role, isActive: boolean, createdAt: string } };

export type ReactivateUserMutationVariables = Exact<{
  id: string | number;
}>;


export type ReactivateUserMutation = { reactivateUser: { id: string, username: string, email: string, phoneNumber: string, role: Role, isActive: boolean, createdAt: string } };

export type ResetUserPasswordMutationVariables = Exact<{
  id: string | number;
}>;


export type ResetUserPasswordMutation = { resetUserPassword: { id: string, username: string, email: string, phoneNumber: string, role: Role, isActive: boolean, createdAt: string } };

export type AbonneUpdatedSubscriptionVariables = Exact<{ [key: string]: never; }>;


export type AbonneUpdatedSubscription = { abonneUpdated: { id: string, numeroAbonne: string, nom: string, prenom: string, statut: StatutAbonne, compteur: { id: string, numeroCompteur: number, quartier: string, camp: number, statut: StatutCompteur } | null } };

export type AbonneDetailUpdatedSubscriptionVariables = Exact<{
  id: string | number;
}>;


export type AbonneDetailUpdatedSubscription = { abonneUpdated: { id: string, numeroAbonne: string, nom: string, prenom: string, telephoneWhatsapp: string, adresse: string | null, statut: StatutAbonne, createdAt: string, compteur: { id: string, numeroCompteur: number, quartier: string, camp: number, indexInitial: number, datePose: string, position: string, statut: StatutCompteur } | null } };

export type GetAbonnesQueryVariables = Exact<{
  statut?: StatutAbonne | null | undefined;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;


export type GetAbonnesQuery = { abonnes: Array<{ id: string, numeroAbonne: string, nom: string, prenom: string, statut: StatutAbonne, compteur: { id: string, numeroCompteur: number, quartier: string, camp: number, statut: StatutCompteur } | null }> };

export type GetAbonnesCountQueryVariables = Exact<{
  statut?: StatutAbonne | null | undefined;
}>;


export type GetAbonnesCountQuery = { abonnesCount: number };

export type GetAbonnesActifsQueryVariables = Exact<{ [key: string]: never; }>;


export type GetAbonnesActifsQuery = { abonnesActifs: Array<{ id: string, compteur: { quartier: string, camp: number } | null }> };

export type GetHistoriqueCompteurQueryVariables = Exact<{
  id: string | number;
}>;


export type GetHistoriqueCompteurQuery = { historiqueCompteur: Array<{ id: string, indexFermeture: number, dateRemplacement: string, createdAt: string, ancienCompteur: { numeroCompteur: number, quartier: string, camp: number, indexInitial: number, position: string }, nouveauCompteur: { numeroCompteur: number, quartier: string, camp: number, indexInitial: number, position: string } }> };

export type GetAbonneQueryVariables = Exact<{
  id: string | number;
}>;


export type GetAbonneQuery = { abonne: { id: string, numeroAbonne: string, nom: string, prenom: string, telephoneWhatsapp: string, adresse: string | null, statut: StatutAbonne, createdAt: string, compteur: { id: string, numeroCompteur: number, quartier: string, camp: number, indexInitial: number, datePose: string, position: string, statut: StatutCompteur } | null } | null };

export type MeQueryVariables = Exact<{ [key: string]: never; }>;


export type MeQuery = { me: { id: string, username: string, email: string, phoneNumber: string, role: Role, isActive: boolean, createdAt: string } | null };

export type GetCampagnesQueryVariables = Exact<{ [key: string]: never; }>;


export type GetCampagnesQuery = { campagnes: Array<{ campagneId: string, nom: string, periodeMois: number, periodeAnnee: number, statut: string, datePlanifiee: string, dateCreation: string, dateCloture: string, createdBy: string, numeroMobileMoney: string, genererFacturesAuto: boolean, envoyerWhatsappAuto: boolean }> };

export type GetCampagneQueryVariables = Exact<{
  campagneId: string;
}>;


export type GetCampagneQuery = { campagne: { campagneId: string, nom: string, periodeMois: number, periodeAnnee: number, statut: string, datePlanifiee: string, dateCreation: string, dateCloture: string, createdBy: string, numeroMobileMoney: string, genererFacturesAuto: boolean, envoyerWhatsappAuto: boolean } };

export type GetRelevesQueryVariables = Exact<{
  campagneId: string;
}>;


export type GetRelevesQuery = { releves: Array<{ releveId: string, abonneId: string, ancienIndex: number, nouveauIndex: number, consommation: number, statut: string, observation: string, dateReleve: string, abonneNom: string, abonnePrenom: string, numeroAbonne: string, numeroCompteur: number, quartier: string, camp: number }> };

export type GetAgentsCampagneQueryVariables = Exact<{
  campagneId: string;
}>;


export type GetAgentsCampagneQuery = { agentsCampagne: Array<{ agentId: string, username: string, role: string, statut: string, derniereActivite: string, nbReleves: number, zones: Array<{ quartier: string, camp: number }> }> };

export type GetRepartitionZoneQueryVariables = Exact<{
  campagneId: string;
}>;


export type GetRepartitionZoneQuery = { repartitionParZone: Array<{ quartier: string, camp: number, agentId: string, agentUsername: string, nbAbonnes: number, nbReleves: number, pct: number }> };

export type GetRelevesParAgentQueryVariables = Exact<{
  campagneId: string;
  agentId: string;
}>;


export type GetRelevesParAgentQuery = { relevesParAgent: Array<{ releveId: string, abonneId: string, ancienIndex: number, nouveauIndex: number, consommation: number, statut: string, observation: string, dateReleve: string, abonneNom: string, abonnePrenom: string, numeroAbonne: string, numeroCompteur: number, quartier: string, camp: number }> };

export type GetProgressionQueryVariables = Exact<{
  campagneId: string;
}>;


export type GetProgressionQuery = { progression: { campagneId: string, totalAbonnes: number, nbReleves: number, nbEnAttente: number, pourcentage: number } };

export type ResumeClotureQueryVariables = Exact<{
  campagneId: string;
}>;


export type ResumeClotureQuery = { resumeCloture: { campagneId: string, totalAbonnes: number, nbReleves: number, nbEstimes: number, nbNonReleves: number, nbRestants: number, nbFacturesAGenerer: number } };

export type ProgressionUpdatedSubscriptionVariables = Exact<{
  campagneId?: string | number | null | undefined;
}>;


export type ProgressionUpdatedSubscription = { progressionUpdated: { campagneId: string, totalAbonnes: number, nbReleves: number, nbEnAttente: number, pourcentage: number } };

export type GetDernierIndexQueryVariables = Exact<{
  abonneId: string;
}>;


export type GetDernierIndexQuery = { dernierIndex: { abonneId: string, dernierIndex: number, estIndexInitial: boolean } };

export type GetCampagneActiveQueryVariables = Exact<{ [key: string]: never; }>;


export type GetCampagneActiveQuery = { campagnes: Array<{ campagneId: string, periodeMois: number, periodeAnnee: number, statut: string }> };

export type GetAgentsDisponiblesQueryVariables = Exact<{ [key: string]: never; }>;


export type GetAgentsDisponiblesQuery = { agentsDisponibles: Array<{ id: string, username: string, phoneNumber: string, role: Role, isActive: boolean }> };

export type GetZonesDisponiblesQueryVariables = Exact<{ [key: string]: never; }>;


export type GetZonesDisponiblesQuery = { zonesDisponibles: Array<{ quartier: string, camp: number, nbAbonnes: number }> };

export type GetDiffusionsQueryVariables = Exact<{ [key: string]: never; }>;


export type GetDiffusionsQuery = { diffusions: Array<{ diffusionId: string, message: string, statut: string, nbTotal: number, nbEnvoyes: number, nbEchecs: number, createdBy: string, createdAt: string }> };

export type GetDiffusionQueryVariables = Exact<{
  diffusionId: string;
}>;


export type GetDiffusionQuery = { diffusion: { diffusionId: string, message: string, statut: string, nbTotal: number, nbEnvoyes: number, nbEchecs: number, createdBy: string, createdAt: string } };

export type DiffusionProgressionUpdatedSubscriptionVariables = Exact<{
  diffusionId?: string | number | null | undefined;
}>;


export type DiffusionProgressionUpdatedSubscription = { diffusionProgressionUpdated: { diffusionId: string, message: string, statut: string, nbTotal: number, nbEnvoyes: number, nbEchecs: number, createdBy: string, createdAt: string } };

export type WhatsappQrQueryVariables = Exact<{ [key: string]: never; }>;


export type WhatsappQrQuery = { whatsappQr: { ready: boolean, qr: string, number: string, phase: string, depuisMs: number } };

export type WhatsappStatusSubscriptionVariables = Exact<{ [key: string]: never; }>;


export type WhatsappStatusSubscription = { whatsappStatus: { ready: boolean, qr: string, number: string, phase: string, depuisMs: number } };

export type GetInfosSocieteQueryVariables = Exact<{ [key: string]: never; }>;


export type GetInfosSocieteQuery = { infosSociete: { nom: string, adresse: string, telephone: string, logoPath: string, updatedAt: string } };

export type GetConfigsQueryVariables = Exact<{ [key: string]: never; }>;


export type GetConfigsQuery = { configs: Array<{ cle: string, valeur: string, description: string }> };

export type ConfigUpdatedSubscriptionVariables = Exact<{
  cle?: string | null | undefined;
}>;


export type ConfigUpdatedSubscription = { configUpdated: { cle: string, valeur: string, description: string } };

export type TarifUpdatedSubscriptionVariables = Exact<{ [key: string]: never; }>;


export type TarifUpdatedSubscription = { tarifUpdated: { tarifId: string, prixM3: number, dateEffet: string, isActive: boolean } };

export type GetFacturesParCampagneQueryVariables = Exact<{
  campagneId: string;
}>;


export type GetFacturesParCampagneQuery = { facturesParCampagne: Array<{ factureId: string, numeroFacture: string, abonneId: string, abonneNom: string, abonneNumero: string, campagneId: string, campagneNom: string, campagnePeriodeMois: number, campagnePeriodeAnnee: number, statut: string, consommation: number, montant: number, dateReleve: string, dateLimitePaiement: string }> };

export type GetFacturesQueryVariables = Exact<{
  campagneId?: string | null | undefined;
  abonneId?: string | null | undefined;
  statut?: string | null | undefined;
  limit?: number | null | undefined;
  offset?: number | null | undefined;
}>;


export type GetFacturesQuery = { factures: Array<{ factureId: string, numeroFacture: string, abonneId: string, abonneNom: string, abonneNumero: string, campagneId: string, campagneNom: string, campagnePeriodeMois: number, campagnePeriodeAnnee: number, statut: string, consommation: number, montant: number, dateReleve: string, dateLimitePaiement: string }> };

export type GetFacturesCountQueryVariables = Exact<{
  campagneId?: string | null | undefined;
  abonneId?: string | null | undefined;
  statut?: string | null | undefined;
}>;


export type GetFacturesCountQuery = { facturesCount: number };

export type GetFactureQueryVariables = Exact<{
  factureId: string;
}>;


export type GetFactureQuery = { facture: { factureId: string, numeroFacture: string, abonneId: string, abonneNom: string, abonneNumero: string, campagneId: string, campagneNom: string, ancienIndex: number, nouveauIndex: number, consommation: number, prixM3: number, montant: number, statut: string, dateReleve: string, dateLimitePaiement: string, dateGeneration: string, pdfPath: string, numeroMobileMoney: string, campagnePeriodeMois: number, campagnePeriodeAnnee: number, motifAnnulation: string, dateAnnulation: string, annuleePar: string, remplaceeParId: string, remplaceId: string, nature: string, motif: string } };

export type GetTarifActuelQueryVariables = Exact<{ [key: string]: never; }>;


export type GetTarifActuelQuery = { tarifActuel: { tarifId: string, prixM3: number, dateEffet: string, isActive: boolean } };

export type GetSoldeFactureQueryVariables = Exact<{
  factureId: string;
}>;


export type GetSoldeFactureQuery = { soldeFacture: { factureId: string, montantTotal: number, montantPaye: number, soldeRestant: number, statut: string, abonneId: string, dateLimitePaiement: string, avoirImpute: number } };

export type GetPaiementsQueryVariables = Exact<{
  factureId: string;
  abonneId?: string | null | undefined;
}>;


export type GetPaiementsQuery = { paiements: Array<{ paiementId: string, factureId: string, montant: number, datePaiement: string, modePaiement: string, referenceTransaction: string, createdAt: string, annule: boolean, annuleLe: string, annulePar: string, motifAnnulation: string }> };

export type GetEnvoisQueryVariables = Exact<{
  factureId: string;
  abonneId?: string | null | undefined;
}>;


export type GetEnvoisQuery = { envois: Array<{ envoiId: string, statut: string, dateEnvoi: string, typeEnvoi: string, erreur: string }> };

export type GetAllEnvoisQueryVariables = Exact<{ [key: string]: never; }>;


export type GetAllEnvoisQuery = { envois: Array<{ envoiId: string, abonneId: string, factureId: string, typeEnvoi: string, statut: string, dateEnvoi: string, erreur: string, raisonEchec: string }> };

export type FactureUpdatedSubscriptionVariables = Exact<{
  campagneId?: string | number | null | undefined;
}>;


export type FactureUpdatedSubscription = { factureUpdated: { factureId: string, numeroFacture: string, abonneId: string, campagneId: string, statut: string, consommation: number, montant: number, dateReleve: string, dateLimitePaiement: string } };

export type PaiementCreeSubscriptionVariables = Exact<{
  campagneId?: string | number | null | undefined;
}>;


export type PaiementCreeSubscription = { paiementCree: { paiementId: string, factureId: string, montant: number, datePaiement: string, modePaiement: string, referenceTransaction: string } };

export type GetAvoirAbonneQueryVariables = Exact<{
  abonneId: string;
}>;


export type GetAvoirAbonneQuery = { avoirAbonne: { abonneId: string, montant: number, mouvements: Array<{ montant: number, typeMouvement: string, motif: string, factureId: string, creePar: string, createdAt: string }> } };

export type GetAllPaiementsQueryVariables = Exact<{ [key: string]: never; }>;


export type GetAllPaiementsQuery = { paiements: Array<{ paiementId: string, factureId: string, montant: number, datePaiement: string, modePaiement: string, referenceTransaction: string, createdAt: string, annule: boolean, annuleLe: string, annulePar: string, motifAnnulation: string }> };

export type GetImpayesQueryVariables = Exact<{ [key: string]: never; }>;


export type GetImpayesQuery = { impayes: Array<{ factureId: string, montantTotal: number, montantPaye: number, soldeRestant: number, statut: string, abonneId: string, dateLimitePaiement: string }> };

export type GetSuiviImpayeQueryVariables = Exact<{
  factureId: string;
}>;


export type GetSuiviImpayeQuery = { suiviImpaye: { suiviId: string, factureId: string, abonneId: string, dateDepassement: string, etapeActuelle: number, resoluLe: string } };

export type GetDetteAbonneQueryVariables = Exact<{
  abonneId: string;
  horsFactureId?: string | null | undefined;
}>;


export type GetDetteAbonneQuery = { detteAbonne: { totalDu: number, nbFactures: number, plusAncienneEcheance: string | null } };

export type GetStatsGlobalesQueryVariables = Exact<{ [key: string]: never; }>;


export type GetStatsGlobalesQuery = { statsGlobales: { consommationTotaleGlobale: number, montantTotalFactureGlobal: number, montantTotalEncaisseGlobal: number, historiqueCampagnes: Array<{ campagneId: string, nomCampagne: string, totalAbonnes: number, nbReleves: number, pourcentageProgression: number, consommationTotale: number }> } };

export type GetStatsParMoisQueryVariables = Exact<{
  nbMois?: number | null | undefined;
}>;


export type GetStatsParMoisQuery = { statsParMois: Array<{ mois: string, annee: number, moisNum: number, encaisse: number, facture: number, consommation: number, nbPaiements: number, nbFactures: number }> };

export type GetUsersQueryVariables = Exact<{ [key: string]: never; }>;


export type GetUsersQuery = { users: Array<{ id: string, username: string, email: string, phoneNumber: string, role: Role, isActive: boolean, createdAt: string }> };

export type UtilisateurUpdatedSubscriptionVariables = Exact<{
  utilisateurId?: string | number | null | undefined;
}>;


export type UtilisateurUpdatedSubscription = { utilisateurUpdated: { id: string, username: string, email: string, phoneNumber: string, role: Role, isActive: boolean, createdAt: string } };
