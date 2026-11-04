// Transforme l'antisèche (docs/antiseche.md) en page Humalis pour le site public :
// site-public/pages/antiseche.humalis. L'antisèche reste la seule source : on la
// modifie, puis on relance
//   npm run site:antiseche
// tests/antiseche.test.ts compile chaque formule et vérifie que la page est à jour.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const racine = fileURLToPath(new URL('..', import.meta.url));
const SORTIE = 'site-public/pages/antiseche.humalis';

/** Un texte Humalis entre guillemets : \" pour un guillemet. */
const guillemets = (texte) => `"${texte.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

const deuxLangues = (fr, en) => (fr === en ? `${guillemets(fr)} sans traduction` : `${guillemets(fr)} en anglais ${guillemets(en)}`);

/** Les sections de l'antisèche, leurs lignes et leurs blocs de code. */
function lireAntiseche(texte) {
  const sections = [];
  const lignes = texte.replace(/<!--[\s\S]*?-->/, '').split('\n');
  for (let i = 0; i < lignes.length; i++) {
    const ligne = lignes[i];
    if (ligne.startsWith('## ')) {
      const [fr, en, ancre] = ligne.slice(3).split(' | ');
      sections.push({ fr, en, ancre, entrees: [] });
    } else if (ligne.startsWith('### ')) {
      const [fr, en] = ligne.slice(4).split(' | ');
      sections.at(-1).entrees.push({ fr, en, blocs: [] });
    } else if (ligne.startsWith('```')) {
      const [genre] = ligne.slice(3).split(' ');
      const debut = i + 1;
      for (i = debut; lignes[i] !== '```'; i++);
      sections.at(-1).entrees.at(-1).blocs.push({ genre, code: lignes.slice(debut, i) });
    }
  }
  return sections;
}

function bloc({ genre, code }, marge) {
  const type = genre === 'terminal' ? 'terminal' : 'humalis';
  const corps = code.map((l) => (l === '' ? '' : `${marge}    ${l}`));
  return [`${marge}code ${type} :`, ...corps];
}

function genererPage(sections) {
  const sortie = [
    '# Généré par scripts/antiseche-site.mjs depuis docs/antiseche.md : modifier la source, pas ce fichier.',
    '',
    `page "antiseche" a l'adresse "/antiseche" :`,
    '    apercu :',
    '        titre "Antisèche Humalis" en anglais "Humalis cheat sheet"',
    '        description "Toutes les formules exactes de Humalis sur une page, et les tournures à éviter. Chaque formule est compilée à chaque version." en anglais "Every exact Humalis phrase on one page, and the wordings to avoid. Each one is compiled for every release."',
    '    bloc avec style "aide" :',
    '        titre "Antisèche" en anglais "Cheat sheet"',
    '        texte "Les formules exactes, à copier. Chaque exemple est compilé à chaque version de Humalis." en anglais "The exact phrases, ready to copy. Every example is compiled for each Humalis release."',
    '        ligne avec style "aide-sommaire" :',
    ...sections.map((s) => `            lien ${deuxLangues(s.fr, s.en)} vers "#${s.ancre}"`),
  ];
  for (const section of sections) {
    sortie.push(`        bloc avec ancre "${section.ancre}" et style "aide-section" :`);
    sortie.push(`            soustitre ${deuxLangues(section.fr, section.en)}`);
    sortie.push('            bloc avec style "aide-entrees" :');
    for (const entree of section.entrees) {
      sortie.push('                bloc avec style "aide-entree" :');
      sortie.push(`                    texte ${deuxLangues(entree.fr, entree.en)} avec style "aide-besoin"`);
      for (const b of entree.blocs) {
        if (b.genre === 'faux') sortie.push('                    texte "À éviter" en anglais "Avoid" avec style "aide-eviter"');
        else if (entree.blocs.length > 1) sortie.push('                    texte "À écrire" en anglais "Write" avec style "aide-ecrire"');
        sortie.push(...bloc(b, '                    '));
      }
    }
  }
  return sortie.join('\n') + '\n';
}

const page = genererPage(lireAntiseche(readFileSync(racine + 'docs/antiseche.md', 'utf8')));
if (process.argv.includes('--verifier')) {
  if (readFileSync(racine + SORTIE, 'utf8') !== page) {
    console.error(`${SORTIE} n'est plus à jour : npm run site:antiseche`);
    process.exit(1);
  }
} else {
  writeFileSync(racine + SORTIE, page);
  console.log(`${SORTIE} : écrite.`);
}
