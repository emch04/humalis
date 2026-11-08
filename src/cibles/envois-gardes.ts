/**
 * Combien de jours un envoi « hors ligne » peut attendre sur l'appareil. Le serveur garde
 * son identifiant au moins aussi longtemps : un renvoi tardif ne crée donc jamais de doublon.
 */
export const JOURS_ENVOIS_GARDES = 30;
