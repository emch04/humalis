/** Messages propres au cache : « en cache pendant … » et « vider le cache de "…" » (17 novembre 2026). */
import type { EntreeErreur } from './erreurs';
const page = 'page "accueil" :\n    titre "Accueil"';
const livre = '    donnee livre :\n        titre : texte\n';
const route = (lignes: string) => `serveur "librairie" :\n${livre}    route "livres" :\n        tout le monde peut lire livre\n        seul admin peut modifier livre\n${lignes}${page}`;
const enCache = '        en cache pendant 5 minutes\n';
const tache = (corps: string, cache = enCache) => `serveur "librairie" :\n${livre}    route "livres" :\n        tout le monde peut lire livre\n        seul admin peut modifier livre\n${cache}    tous les jours a 7 h :\n        ${corps}\n${page}`;
const source = (lignes: string, jeton = 'jeton secret depuis l\'environnement "METEO_CLE" dans le parametre "key"') =>
  `serveur "agenda" :\n${livre}    route "livres" :\n        tout le monde peut lire livre\n        seul admin peut modifier livre\n    tous les jours a 7 h :\n        vider le cache de "meteo"\nsource "meteo" :\n    adresse "https://api.meteo.example"\n    ${jeton}\n${lignes}    donnee prevision :\n        jour : texte\n    route "previsions" :\n        tout le monde peut lire une liste de prevision dans "jours"\n${page}`;
const sourceSeule = (lignes: string, jeton: string) =>
  `serveur "agenda" :\n${livre}    route "livres" :\n        tout le monde peut lire livre\n        seul admin peut modifier livre\nsource "meteo" :\n    adresse "https://api.meteo.example"\n    ${jeton}\n${lignes}    donnee prevision :\n        jour : texte\n    route "previsions" :\n        ${jeton.startsWith('jeton secret') ? 'tout le monde peut ' : ''}lire une liste de prevision dans "jours"\n${page}`;
const secret = 'jeton secret depuis l\'environnement "METEO_CLE" dans le parametre "key"';
const entree = (id: string, titre: string, fautif: string, corrige: string, motif: string, groupe: EntreeErreur['groupe'] = 'grammaire'): EntreeErreur => ({ id, groupe, titre, explication: titre, correction: 'Corrige la ligne indiquée selon la phrase complète.', fautif, corrige, motif, gravite: 'erreur', sites: 1, atteignable: true });
export const ENTREES_ERREURS_CACHE: EntreeErreur[] = [
  entree('cache-route-double', 'Le cache déjà écrit pour cette route', route(enCache + '        en cache pendant 1 heure\n'), route(enCache), 'est déjà écrit pour cette route'),
  entree('cache-source-ligne', 'Une ligne inconnue dans une source', sourceSeule('    en direct\n', secret), sourceSeule('    en cache pendant 30 minutes\n', secret), 'n\'est pas une ligne d\'une source'),
  entree('cache-source-double', 'Le cache déjà écrit pour cette source', source('    en cache pendant 30 minutes\n    en cache pendant 1 heure\n'), source('    en cache pendant 30 minutes\n'), 'est déjà écrit pour cette source'),
  entree('cache-sans-pendant', 'La durée du cache sans « pendant »', route('        en cache 5 minutes\n'), route(enCache), 'on écrit la durée après « pendant »'),
  entree('cache-duree-nulle', 'Une durée de cache nulle', route('        en cache pendant 0 minutes\n'), route(enCache), 'au moins une seconde'),
  entree('vider-cache-ecriture', '« vider le cache » mal écrit', tache('vider la memoire de "livres"'), tache('vider le cache de "livres"'), 'on écrit : vider le cache de'),
  entree('cache-route-sans-lecture', 'Une route en cache que personne ne lit', `serveur "librairie" :\n${livre}    route "livres" :\n        seul admin peut modifier livre\n${enCache}${page}`, route(enCache), 'mais personne ne peut la lire', 'sens'),
  entree('cache-comptes', 'Les comptes en cache', `serveur "api" :\n    roles gerant\n    route "equipe" :\n        seul admin peut lire comptes\n${enCache}${page}`, `serveur "api" :\n    roles gerant\n    route "equipe" :\n        seul admin peut lire comptes\n${page}`, 'les comptes ne se gardent pas en cache', 'sens'),
  entree('cache-source-sans-passerelle', 'Une source en cache sans passerelle', sourceSeule('    en cache pendant 30 minutes\n', 'jeton public "pk_essai_public"'), sourceSeule('    cache 30 minutes\n', 'jeton public "pk_essai_public"'), 'est appelée par la page elle-même', 'sens'),
  entree('vider-cache-inconnu', '« vider le cache » d’un nom inconnu', tache('vider le cache de "inconnu"'), tache('vider le cache de "livres"'), 'aucune route ni source ne s\'appelle', 'sens'),
  entree('vider-cache-source', '« vider le cache » d’une source qui n’est pas en cache', source(''), source('    en cache pendant 30 minutes\n'), 'n\'est pas en cache : écrivez « en cache pendant 30 minutes » dans la source', 'sens'),
  entree('vider-cache-route', '« vider le cache » d’une route qui n’est pas en cache', tache('vider le cache de "livres"', ''), tache('vider le cache de "livres"'), 'n\'est pas en cache : écrivez « en cache pendant 5 minutes » dans la route', 'sens'),
];
