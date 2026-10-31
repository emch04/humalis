// Transforme le guide (docs/guide.md et docs/guide.en.md) en pages Humalis
// pour le site public : site-public/pages/documentation.humalis. Un chapitre « ## N. … »
// devient une sous-page de « documentation », avec ses deux langues :
// « si langue est anglais : » (le guide anglais) / « sinon : » (le guide français).
//
// Le guide reste la seule source : on le modifie, puis on relance
//   npm run site:doc
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const racine = fileURLToPath(new URL('..', import.meta.url));
const lire = (chemin) => readFileSync(racine + chemin, 'utf8');

/** Les chapitres « ## N. Titre » d'un guide, avec leurs lignes. */
function chapitres(texte) {
  const resultat = [];
  let courant = null;
  for (const ligne of texte.split('\n')) {
    const titre = /^## (?:(\d+)\. )?(.+)$/.exec(ligne);
    if (titre) {
      courant = { numero: titre[1] ? Number(titre[1]) : null, titre: titre[2].trim(), lignes: [] };
      resultat.push(courant);
    } else if (courant) courant.lignes.push(ligne);
  }
  return resultat.filter((c) => c.numero !== null || /keywords at a glance/i.test(c.titre));
}

/** Un texte Humalis entre guillemets : \" pour un guillemet. */
const guillemets = (texte) => `"${texte.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/**
 * Le Markdown d'une phrase en texte Humalis : `code` reste entre accents graves,
 * **gras** → {accent "…"}, [texte](lien) → texte. Les accolades du texte
 * ordinaire (qui liraient une variable) sont écrites comme du code : `{`.
 */
function phrase(markdown) {
  const morceaux = [];
  let reste = markdown.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  const motif = /`([^`]+)`|\*\*([^*]+)\*\*/;
  for (;;) {
    const trouve = motif.exec(reste);
    if (!trouve) break;
    morceaux.push(texteSimple(reste.slice(0, trouve.index)));
    // Le code entre accents graves est recopié tel quel ; le contenu d'un {accent "…"}, jusqu'au premier "}.
    if (trouve[1] !== undefined) morceaux.push(`\`${trouve[1]}\``);
    else morceaux.push(`{accent "${trouve[2]}"}`);
    reste = reste.slice(trouve.index + trouve[0].length);
  }
  morceaux.push(texteSimple(reste));
  return `"${morceaux.join('')}"`;
}

/** Un morceau de texte sans mise en forme : guillemets échappés, accolades montrées comme du code. */
const texteSimple = (texte) =>
  texte
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[{}]/g, (accolade) => `\`${accolade}\``);

/** Les cellules d'une ligne de tableau Markdown. */
const cellules = (ligne) =>
  ligne
    .trim()
    .replace(/^\||\|$/g, '')
    .split(/(?<!\\)\|/)
    .map((c) => c.trim().replace(/\\\|/g, '|'));

/** Les lignes Humalis d'un chapitre, décalées de `retrait` espaces. */
function corps(lignes, retrait) {
  const sortie = [];
  const ecrire = (ligne) => sortie.push(' '.repeat(retrait) + ligne);
  let i = 0;
  let paragraphe = [];
  const finirParagraphe = () => {
    if (paragraphe.length) ecrire(`texte ${phrase(paragraphe.join(' '))}`);
    paragraphe = [];
  };
  while (i < lignes.length) {
    const ligne = lignes[i];
    if (/^```/.test(ligne)) {
      finirParagraphe();
      const langage = ligne.slice(3).trim().split(/\s+/)[0];
      const nom = langage === 'humalis' ? 'humalis' : langage === 'sh' || langage === 'bash' ? 'terminal' : langage ? 'texte' : '';
      ecrire(nom ? `code ${nom} :` : 'code :');
      i++;
      while (i < lignes.length && !/^```/.test(lignes[i])) {
        sortie.push(lignes[i] === '' ? '' : ' '.repeat(retrait + 4) + lignes[i]);
        i++;
      }
      i++;
      continue;
    }
    if (/^### /.test(ligne)) {
      finirParagraphe();
      ecrire(`soustitre ${phrase(ligne.slice(4).trim())}`);
    } else if (/^\|/.test(ligne)) {
      finirParagraphe();
      const entete = cellules(ligne);
      i += 2;
      const rangees = [];
      while (i < lignes.length && /^\|/.test(lignes[i])) rangees.push(cellules(lignes[i++]));
      ecrire(`tableau ${guillemets(entete.filter(Boolean).join(', ') || 'Tableau')} :`);
      ecrire(`    colonnes ${entete.map((c) => phrase(c || ' ')).join(', ')}`);
      for (const r of rangees) ecrire(`    rangee ${r.map((c) => phrase(c || ' ')).join(', ')}`);
      continue;
    } else if (/^\s*(- |\d+\. )/.test(ligne)) {
      finirParagraphe();
      const numerotee = /^\s*\d+\. /.test(ligne);
      ecrire(numerotee ? 'liste numerotee :' : 'liste :');
      while (i < lignes.length && /\S/.test(lignes[i]) && !/^```|^#|^\|/.test(lignes[i])) {
        const element = [lignes[i].replace(/^\s*(- |\d+\. )/, '')];
        i++;
        while (i < lignes.length && /^\s{2,}\S/.test(lignes[i]) && !/^\s*(- |\d+\. )/.test(lignes[i])) element.push(lignes[i++].trim());
        ecrire(`    texte ${phrase(element.join(' '))}`);
      }
      continue;
    } else if (/^---\s*$/.test(ligne) || ligne.trim() === '') {
      finirParagraphe();
    } else {
      paragraphe.push(ligne.trim());
    }
    i++;
  }
  finirParagraphe();
  return sortie;
}

/** La description d'un chapitre (aperçu de partage) : son premier paragraphe, en texte simple. */
function description(lignes) {
  const debut = lignes.findIndex((l) => /^[\p{L}*`]/u.test(l.trim()) && !/^(- |\d+\. |\||#)/.test(l.trim()));
  if (debut < 0) return '';
  // Le premier paragraphe, et les suivants tant que la phrase est trop courte pour un aperçu.
  const paragraphe = [];
  for (let i = debut; i < lignes.length && (lignes[i].trim() !== '' || paragraphe.join(' ').length < 60); i++) {
    if (/^```/.test(lignes[i])) while (++i < lignes.length && !/^```/.test(lignes[i]));
    else if (lignes[i].trim() !== '' && !/^(- |\d+\. |\||#|---)/.test(lignes[i].trim())) paragraphe.push(lignes[i].trim());
  }
  let texte = paragraphe.join(' ').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[`*{}]/g, '');
  if (texte.length > 160) texte = texte.slice(0, 157).replace(/\s+\S*$/, '') + '…';
  return texte;
}

/** La description d'un chapitre, précédée de son titre quand elle est trop courte pour un aperçu. */
const apercu = (lignes, titre, deuxPoints) => {
  const texte = description(lignes);
  return texte.length >= 60 ? texte : texte ? `${titre}${deuxPoints}${texte}` : `${titre}.`;
};

/** « 4. Les éléments » → « Les éléments ». */
const sansNumero = (titre) => titre.replace(/^\d+\. /, '');

/** Une adresse lisible : « 4. Les éléments » → « elements ». */
const adresse = (titre) =>
  titre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^(les?|la|l')\s*/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const fr = chapitres(lire('docs/guide.md'));
const en = chapitres(lire('docs/guide.en.md'));
const pages = en.map((chapitreEn, index) => {
  const chapitreFr = fr[index] ?? { numero: null, titre: 'Les mots-clés de Humalis en anglais', lignes: ['Cette page présente les mots-clés français de Humalis, avec leur sens, aux personnes qui lisent le guide en anglais.'] };
  const numero = chapitreEn.numero ?? index + 1;
  return {
    nom: `documentation_${numero}`,
    adresse: `/documentation/${adresse(chapitreFr.titre)}`,
    titreFr: chapitreFr.numero ? `${numero}. ${chapitreFr.titre}` : chapitreFr.titre,
    titreEn: chapitreEn.numero ? `${numero}. ${chapitreEn.titre}` : chapitreEn.titre,
    fr: chapitreFr.lignes,
    en: chapitreEn.lignes,
  };
});

const sortie = [
  '# Produit par scripts/doc-site.mjs depuis docs/guide.md et docs/guide.en.md :',
  '# ne pas modifier à la main. Pour changer la documentation, modifier le guide,',
  '# puis lancer « npm run site:doc ».',
  '',
  'page "documentation" a l\'adresse "/documentation" sans pied :',
  '    apercu :',
  '        description "Le guide complet de Humalis : de l’installation au serveur, chaque construction du langage avec un exemple vérifié." en anglais "The complete Humalis guide: from installation to the server, every construct of the language with a checked example."',
  '    ligne avec style "doc" et hauteur ecran :',
  '        menu vertical avec style "doc-sommaire" et defilement interne :',
  ...pages.map((p) => `            lien ${guillemets(p.titreFr)} en anglais ${guillemets(p.titreEn)} vers ${guillemets(p.nom)}`),
  '        bloc avec style "doc-contenu" :',
  '            sous page',
  '',
  'page "documentation_sommaire" dans "documentation" adresse "/documentation" :',
  '    titre "Documentation de Humalis" en anglais "Humalis documentation"',
  '    texte "Le guide complet du langage, du premier titre jusqu’au serveur. Chaque exemple est vérifié par le compilateur : s’il est écrit ici, il marche." en anglais "The complete guide to the language, from the first title to the server. Every example is checked by the compiler: if it is written here, it works."',
  // La liste numérote déjà : les titres y sont écrits sans leur numéro.
  '    liste numerotee :',
  ...pages.map((p) => `        lien ${guillemets(sansNumero(p.titreFr))} en anglais ${guillemets(sansNumero(p.titreEn))} vers ${guillemets(p.nom)}`),
];
pages.forEach((p, index) => {
  const precedente = pages[index - 1];
  const suivante = pages[index + 1];
  sortie.push(
    '',
    `page ${guillemets(p.nom)} dans "documentation" adresse ${guillemets(p.adresse)} :`,
    '    apercu :',
    `        description ${guillemets(apercu(p.fr, `Guide de Humalis, ${p.titreFr}`, ' : '))} en anglais ${guillemets(apercu(p.en, `Humalis guide, ${p.titreEn}`, ': '))}`,
    `    titre ${guillemets(p.titreFr)} en anglais ${guillemets(p.titreEn)}`,
    '    si langue est anglais :',
    ...corps(p.en, 8),
    '    sinon :',
    ...corps(p.fr, 8),
    '    ligne avec style "doc-suite" :',
    ...(precedente ? [`        lien ${guillemets('← ' + precedente.titreFr)} en anglais ${guillemets('← ' + precedente.titreEn)} vers ${guillemets(precedente.nom)}`] : []),
    ...(suivante ? [`        lien ${guillemets(suivante.titreFr + ' →')} en anglais ${guillemets(suivante.titreEn + ' →')} vers ${guillemets(suivante.nom)}`] : []),
  );
});
writeFileSync(racine + 'site-public/pages/documentation.humalis', sortie.join('\n') + '\n');
console.log(`site-public/pages/documentation.humalis : ${pages.length} chapitres.`);
