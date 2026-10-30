/**
 * Les sources (API existantes) ne sont produites que pour le web et le
 * desktop dans cette version. Les autres cibles refusent clairement, plutôt
 * que de produire un code qui n'appellerait rien.
 */
import type { Application } from '../ri/types.js';
import type { Diagnostic } from '../analyse/erreurs.js';

export function verifierSourcesPourLaCible(application: Application, cible: 'mobile' | 'statique'): Diagnostic[] {
  const diagnostics: Diagnostic[] = application.sources.map((s) => ({
    gravite: 'erreur' as const,
    ligne: 1,
    message: `la source « ${s.nom} » n'est pas encore disponible sur la cible ${cible} : compilez pour le web ou le desktop.`,
  }));
  for (const ecran of application.ecrans) {
    if (JSON.stringify(ecran.gestionnaires).includes('"type":"optimiste"')) diagnostics.push({
      gravite: 'erreur', ligne: ecran.ligne,
      message: `« en supposant que ça marche » (page « ${ecran.nom} ») n'est pas encore disponible sur la cible ${cible} : compilez pour le web ou le desktop.`,
    });
  }
  return diagnostics;
}

/**
 * L'adresse choisie, les pages réservées, « continuer », les sous-pages, les filtres
 * d'adresse, les ancres, « revenir » et les liens externes ne sont produits que pour le
 * web et le desktop.
 */
export function verifierNavigationPourLaCible(application: Application, cible: 'mobile' | 'statique'): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const e of application.ecrans) {
    const dit = (quoi: string) =>
      diagnostics.push({ gravite: 'erreur', ligne: e.ligne, message: `${quoi} (page « ${e.nom} ») n'est pas encore disponible sur la cible ${cible} : compilez pour le web ou le desktop.` });
    if (e.adresse !== undefined) dit('Une adresse choisie');
    if (e.reservee) dit('Une page réservée');
    if (JSON.stringify(e.gestionnaires).includes('"continuer":true')) dit('« continuer vers »');
    if (e.parent !== undefined) dit('Une sous-page');
    if (e.filtres?.length) dit('Un filtre d\'adresse');
    const code = JSON.stringify(e);
    if (/"(ancre|versAncre)"/.test(code)) dit('Une ancre');
    if (code.includes('"externe"')) dit('Un lien externe');
    if (code.includes('"type":"retour"')) dit('« revenir »');
    if (code.includes('"type":"sousPage"')) dit('« sous page »');
  }
  return diagnostics;
}

/**
 * Le choix et l'envoi d'un fichier (plan des médias, 4.3) ne sont produits que
 * pour le web et le desktop : l'envoi passe par le moteur des sources, qui
 * n'existe pas encore sur le mobile ni sur le site statique. Refusé avec un
 * message clair plutôt qu'un bouton qui n'enverrait rien.
 */
export function verifierFichiersPourLaCible(application: Application, cible: 'mobile' | 'statique'): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const e of [...application.ecrans, ...application.composants]) {
    const code = JSON.stringify([e.vue, e.gestionnaires]);
    if (code.includes('"genre":"fichier"') || code.includes('"type":"envoiFichier"')) {
      diagnostics.push({
        gravite: 'erreur',
        ligne: e.ligne,
        message: `Le choix et l'envoi d'un fichier (page « ${e.nom} ») ne sont pas encore disponibles sur la cible ${cible} : l'envoi passe par les sources, qui n'existent pas encore ici. Compilez pour le web ou le desktop.`,
      });
    }
  }
  return diagnostics;
}
