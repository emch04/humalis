// Transforme la licence (LICENSE, et sa traduction LICENSE.en.md) en page Humalis pour le site
// public : site-public/pages/licence.humalis. Les deux fichiers restent la seule source : on les
// modifie, puis on relance
//   npm run site:licence
// tests/licence-site.test.ts vérifie que la page est à jour. Avec --verifier, rien n'est écrit :
// le script s'arrête en erreur si la page n'est plus celle que donnent les deux fichiers.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const racine = fileURLToPath(new URL('..', import.meta.url));
const SORTIE = 'site-public/pages/licence.humalis';

/** Un texte Humalis entre guillemets : \" pour un guillemet. */
const guillemets = (texte) => `"${texte.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const deuxLangues = (fr, en) => (fr === en ? `${guillemets(fr)} sans traduction` : `${guillemets(fr)} en anglais ${guillemets(en)}`);

/**
 * Découpe une licence en morceaux : le titre, le préambule (tout ce qui précède l'article 1), puis
 * les articles (« 1. Définitions »), les paragraphes, les puces (« - »), les sous-puces (« - »
 * précédé d'espaces) et les lettres (« (a) »). Une ligne qui commence par des espaces, sans être une
 * sous-puce, continue le morceau en cours ; une ligne vide le termine.
 */
export function lireLicence(texte) {
  const lignes = texte.replace(/\r/g, '').split('\n');
  const premierArticle = lignes.findIndex((l) => /^1\. /.test(l));
  if (premierArticle < 0) throw new Error('La licence n’a pas d’article « 1. ».');
  const titre = lignes[0].trim();
  const preambule = lignes.slice(1, premierArticle).map((l) => l.trim()).filter(Boolean).join(' ');
  const morceaux = [];
  let encours = null;
  for (const ligne of lignes.slice(premierArticle)) {
    if (ligne.trim() === '') {
      encours = null;
      continue;
    }
    let sorte = null;
    let contenu = ligne.trim();
    if (/^\d+\. /.test(ligne)) sorte = 'article';
    else if (/^\s+- /.test(ligne)) sorte = 'souspuce';
    else if (/^- /.test(ligne)) sorte = 'puce';
    else if (/^\([a-z]\) /.test(ligne)) sorte = 'lettre';
    if (sorte === 'souspuce' || sorte === 'puce') contenu = contenu.slice(2);
    if (sorte) {
      encours = sorte === 'article' ? null : { sorte, texte: contenu };
      morceaux.push(encours ?? { sorte, texte: contenu });
    } else if (encours && (/^\s/.test(ligne) || encours.sorte === 'paragraphe')) {
      encours.texte += ` ${contenu}`;
    } else {
      encours = { sorte: 'paragraphe', texte: contenu };
      morceaux.push(encours);
    }
  }
  return { titre, preambule, morceaux };
}

/** Les deux licences, morceau par morceau : elles doivent avoir la même forme. */
function apparier(fr, en) {
  if (fr.morceaux.length !== en.morceaux.length) {
    throw new Error(`LICENSE a ${fr.morceaux.length} morceaux et LICENSE.en.md ${en.morceaux.length} : les deux textes doivent garder la même forme.`);
  }
  return fr.morceaux.map((m, i) => {
    const e = en.morceaux[i];
    if (m.sorte !== e.sorte) throw new Error(`Morceau ${i + 1} : « ${m.texte.slice(0, 40)}… » est un ${m.sorte} en français et un ${e.sorte} en anglais.`);
    return { sorte: m.sorte, fr: m.texte, en: e.texte };
  });
}

/** « 3. Ce qui est interdit » → « article-3 ». */
const ancre = (titre) => `article-${titre.split('.')[0]}`;

export function produirePage() {
  const fr = lireLicence(readFileSync(new URL('../LICENSE', import.meta.url), 'utf8'));
  const en = lireLicence(readFileSync(new URL('../LICENSE.en.md', import.meta.url), 'utf8'));
  const morceaux = apparier(fr, en);
  const l = [];
  l.push('# Produit par scripts/licence-site.mjs depuis LICENSE et LICENSE.en.md :');
  l.push('# ne pas modifier à la main. Pour changer la licence, modifier ces deux fichiers,');
  l.push('# puis relancer « npm run site:licence ».');
  l.push('');
  l.push('page "licence" a l\'adresse "/licence" :');
  l.push('    apercu :');
  l.push(`        description ${deuxLangues('La Licence Humalis en entier : ce que tu peux faire librement avec Humalis, ce qui demande un accord écrit, et ce qui t’appartient.', 'The full Humalis License: what you may do freely with Humalis, what needs written permission, and what belongs to you.')}`);
  l.push('    bloc avec style "page-intro" :');
  l.push(`        titre ${deuxLangues(fr.titre, en.titre.replace(/\s*\(English translation\)$/, ''))}`);
  l.push(`        texte ${deuxLangues(fr.preambule, en.preambule)}`);
  l.push('    grille avec colonnes 3 et style "page-section legal-resume" et animation montee au defilement et en cascade :');
  for (const [tfr, ten, pfr, pen] of [
    ['Libre', 'Free', 'Utiliser Humalis, le modifier, et créer, vendre ou héberger tes applications : sans rien demander.', 'Use Humalis, change it, and create, sell or host your apps: without asking anyone.'],
    ['Avec un accord écrit', 'With written permission', 'Vendre Humalis lui-même, ou le proposer à d’autres comme service payant.', 'Sell Humalis itself, or offer it to others as a paid service.'],
    ['Contact', 'Contact', 'Toute demande d’autorisation : contact@humalis.dev.', 'Any permission request: contact@humalis.dev.'],
  ]) {
    l.push('        bloc avec style "legal-point" et effet leve :');
    l.push(`            soustitre ${deuxLangues(tfr, ten)}`);
    l.push(`            texte ${deuxLangues(pfr, pen)}`);
  }
  l.push('    colonne avec style "page-section licence-texte" :');
  let liste = null;
  for (const m of morceaux) {
    if (m.sorte === 'article') {
      liste = null;
      l.push(`        soustitre ${deuxLangues(m.fr, m.en)} avec ancre "${ancre(m.fr)}"`);
    } else if (m.sorte === 'paragraphe') {
      liste = null;
      l.push(`        texte ${deuxLangues(m.fr, m.en)}`);
    } else if (m.sorte === 'puce' || m.sorte === 'lettre') {
      const style = m.sorte === 'lettre' ? 'licence-lettres' : 'licence-puces';
      if (liste !== style) {
        l.push(`        bloc avec style "${style}" :`);
        l.push('            liste :');
        liste = style;
      }
      l.push(`                texte ${deuxLangues(m.fr, m.en)}`);
    } else {
      // Une sous-puce se range sous la puce ou la lettre qui la précède, en retrait.
      l.push(`                texte ${deuxLangues(`– ${m.fr}`, `– ${m.en}`)} avec style "licence-sous"`);
    }
  }
  l.push(`        lien ${deuxLangues('Le fichier de la licence sur GitHub ↗', 'The license file on GitHub ↗')} vers "https://github.com/emch04/humalis/blob/main/LICENSE" avec nouvel onglet`);
  return `${l.join('\n')}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(process.argv[1], 'file://'))) {
  const page = produirePage();
  const chemin = `${racine}${SORTIE}`;
  if (process.argv.includes('--verifier')) {
    let actuelle = '';
    try {
      actuelle = readFileSync(chemin, 'utf8');
    } catch {}
    if (actuelle !== page) {
      console.error(`${SORTIE} n’est plus à jour : lancez « npm run site:licence ».`);
      process.exit(1);
    }
    console.log(`${SORTIE} : à jour.`);
  } else {
    writeFileSync(chemin, page);
    console.log(`${SORTIE} : écrite.`);
  }
}
