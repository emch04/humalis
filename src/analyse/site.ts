/**
 * Les vérifications de publication (plan 2026-10-30-qualite-publication,
 * parties 3 et 4). Elles ne s'appliquent que si le bloc « site : » est
 * déclaré : c'est la déclaration « je publie ». Sans lui, un programme
 * d'exemple compile en silence.
 */
import type { Expression, Instruction, Page, Programme, Test } from '../parser/ast.js';
import type { Diagnostic } from './erreurs.js';
import { langueDuMot } from '../i18n/langues.js';

/** Le texte d'un littéral sans « {…} », sinon `undefined`. */
export function texteLitteral(expression: Expression | undefined): string | undefined {
  if (expression?.type !== 'Chaine' || !expression.parties.every((p) => p.type === 'texte')) return undefined;
  return expression.parties.map((p) => p.valeur).join('');
}

/**
 * « si langue est anglais » : vrai si le test est vrai dans la langue `code`,
 * faux sinon ; `undefined` pour un test qui ne porte pas sur la langue.
 */
function testDeLangue(test: Test, code: string): boolean | undefined {
  if (test.type !== 'Comparaison' || test.gauche.type !== 'Reference' || test.gauche.nom !== 'langue' || test.droite?.type !== 'Reference') return undefined;
  if (test.operateur !== 'egal' && test.operateur !== 'different') return undefined;
  const langue = langueDuMot(test.droite.nom);
  if (!langue) return undefined;
  return (langue.code === code) !== (test.operateur === 'different') !== Boolean(test.negation);
}

/**
 * Le premier « titre » ou « texte » écrit dans la page, même dans un bloc de mise en page.
 * Avec des langues, une branche « si langue est … » compte : celle de la langue de base.
 */
function premier(genre: 'titre' | 'texte', instructions: Instruction[], langueDeBase?: string): Expression | undefined {
  for (const instruction of instructions) {
    if (instruction.type === 'Element' && instruction.element === genre) return instruction.contenu;
    const vraie = instruction.type === 'Condition' && langueDeBase !== undefined ? testDeLangue(instruction.test, langueDeBase) : undefined;
    const corps = instruction.type === 'Bloc' ? instruction.corps : instruction.type === 'Condition' && vraie !== undefined ? (vraie ? instruction.alors : instruction.sinon) : undefined;
    if (corps) {
      const trouve = premier(genre, corps, langueDeBase);
      if (trouve) return trouve;
    }
  }
  return undefined;
}

/** Le titre et la description propres à la page : son aperçu, sinon son premier titre et son premier texte. */
export function apercuDeLaPage(page: Page, langueDeBase?: string): { titre?: Expression; description?: Expression } {
  return {
    titre: page.apercu?.titre ?? premier('titre', page.corps, langueDeBase),
    description: page.apercu?.description ?? premier('texte', page.corps, langueDeBase),
  };
}

export function analyserPublication(programme: Programme, diagnostics: Diagnostic[]): void {
  const site = programme.site;
  if (!site) return;
  const avertir = (message: string, ligne: number) => diagnostics.push({ gravite: 'avertissement', message, ligne });

  if (site.adresse !== undefined && !/^https:\/\/[^/]/.test(site.adresse) && !/^http:\/\/localhost(:\d+)?(\/|$)/.test(site.adresse)) {
    diagnostics.push({
      gravite: 'erreur',
      message: `l'adresse du site « ${site.adresse} » doit commencer par https:// (ou http://localhost pour un essai).`,
      ligne: site.lignes.adresse ?? site.ligne,
    });
  }
  if (site.logo === undefined) {
    avertir('le site n\'a pas d\'icône : ajoutez « logo "./logo.svg" » au bloc « site » (un SVG, ou un PNG carré de 512×512 au moins).', site.ligne);
  }
  if (site.image !== undefined && /^https?:\/\//.test(site.image)) {
    avertir(`l'image de partage « ${site.image} » est sur un autre site : si elle disparaît, l'aperçu des liens du site la perd. Préférez un fichier du projet.`, site.lignes.image ?? site.ligne);
  }

  const titres = new Map<string, string>();
  const premiereLangue = programme.langues?.langues[0];
  const langueDeBase = premiereLangue ? langueDuMot(premiereLangue.mot)?.code : undefined;
  for (const page of programme.pages) {
    if (page.nom === 'introuvable') continue;
    const { titre, description } = apercuDeLaPage(page, langueDeBase);
    const ligneApercu = page.apercu?.ligne ?? page.ligne;
    const titreLu = texteLitteral(titre);
    const descriptionLue = texteLitteral(description);

    if (titreLu !== undefined && titreLu.length > 60) {
      avertir(`le titre de la page « ${page.nom} » fait plus de 60 caractères (${titreLu.length}) : il sera coupé dans les résultats de recherche.`, ligneApercu);
    }
    if (descriptionLue !== undefined && descriptionLue.length < 50) {
      avertir(`la description de la page « ${page.nom} » fait moins de 50 caractères (${descriptionLue.length}) : dites en une phrase ce qu'on y trouve.`, ligneApercu);
    } else if (descriptionLue !== undefined && descriptionLue.length > 160) {
      avertir(`la description de la page « ${page.nom} » fait plus de 160 caractères (${descriptionLue.length}) : elle sera coupée dans les résultats de recherche.`, ligneApercu);
    }
    if (description === undefined) {
      avertir(`la page « ${page.nom} » n'a pas de description : ajoutez un « texte », ou « description "…" » dans un bloc « apercu : ».`, page.ligne);
    }
    const calcule = [page.apercu?.titre, page.apercu?.description, page.apercu?.image].some((v) => v !== undefined && texteLitteral(v) === undefined);
    if (calcule) {
      avertir(
        `l'aperçu de partage de « ${page.nom} » dépend de données : l'onglet le montre, mais les réseaux sociaux, qui ne lisent pas le JavaScript, montreront celui du site.`,
        ligneApercu,
      );
    }
    if (titreLu !== undefined) {
      const deja = titres.get(titreLu);
      if (deja) avertir(`les pages « ${deja} » et « ${page.nom} » ont le même titre « ${titreLu} » : les moteurs de recherche ne sauront pas laquelle montrer.`, page.ligne);
      else titres.set(titreLu, page.nom);
    }
  }
}
