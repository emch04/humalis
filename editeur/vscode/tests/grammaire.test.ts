import { describe, it, expect } from 'vitest';
import { colorier, jetonDe, porteeDe } from './aide-grammaire.js';

const RESERVE = 'keyword.control.humalis';
const CONTEXTUEL = 'support.function.humalis';

async function portee(source: string, mot: string): Promise<string | undefined> {
  const [ligne] = await colorier(source);
  return porteeDe(jetonDe(ligne, mot));
}

describe('grammaire : mots réservés', () => {
  it.each(['page', 'si', 'sinon', 'quand', 'variable', 'pour', 'dans', 'par', 'composant', 'serveur', 'non', 'rien'])(
    '%s est un mot réservé',
    async (mot) => {
      expect(await portee(`${mot} x`, mot)).toBe(RESERVE);
    },
  );
});

describe('grammaire : mots contextuels', () => {
  it.each(['bouton', 'texte', 'titre', 'afficher', 'rediriger', 'chaque'])(
    '%s est un mot contextuel',
    async (mot) => {
      expect(await portee(`${mot} x`, mot)).toBe(CONTEXTUEL);
    },
  );
});

describe('grammaire : accents et accords', () => {
  it.each([
    ['egal', CONTEXTUEL],
    ['égal', CONTEXTUEL],
    ['égale', CONTEXTUEL],
    ['inferieur', CONTEXTUEL],
    ['inférieur', CONTEXTUEL],
    ['inférieure', CONTEXTUEL],
    ['superieure', CONTEXTUEL],
    ['supérieur', CONTEXTUEL],
    ['requete', CONTEXTUEL],
    ['requête', CONTEXTUEL],
    ['Égal', CONTEXTUEL],
  ])('%s est colorié comme le mot-clé', async (mot, attendu) => {
    expect(await portee(`si x est ${mot} a 0`, mot)).toBe(attendu);
  });
});

describe('grammaire : valeurs', () => {
  it('vrai et faux sont des constantes', async () => {
    expect(await portee('variable a = vrai', 'vrai')).toBe('constant.language.humalis');
    expect(await portee('variable a = faux', 'faux')).toBe('constant.language.humalis');
  });

  it('un nombre est un nombre', async () => {
    expect(await portee('variable a = 42', '42')).toBe('constant.numeric.humalis');
  });

  it('un mot hors vocabulaire n\'est pas colorié', async () => {
    expect(await portee('texte bonjour', 'bonjour')).toBeUndefined();
  });

  it('un mot contenant un mot-clé n\'est pas colorié', async () => {
    expect(await portee('texte email_valide', 'email_valide')).toBeUndefined();
    expect(await portee('texte pagination', 'pagination')).toBeUndefined();
  });
});

describe('grammaire : chaînes et interpolation', () => {
  it('colorie une chaîne', async () => {
    const [ligne] = await colorier('texte "Bonjour"');
    expect(ligne.some((j) => porteeDe(j)?.startsWith('string.quoted.double.humalis'))).toBe(true);
  });

  it('colorie la variable dans {nom}', async () => {
    const [ligne] = await colorier('texte "Bonjour {nom}"');
    expect(porteeDe(jetonDe(ligne, 'nom'))).toBe('variable.other.humalis');
    expect(jetonDe(ligne, 'Bonjour ').portees).toContain('string.quoted.double.humalis');
  });

  it('un mot-clé dans une chaîne reste du texte', async () => {
    const [ligne] = await colorier('texte "page si bouton"');
    const dansChaine = ligne.filter((j) => j.portees.includes('string.quoted.double.humalis'));
    expect(dansChaine.length).toBeGreaterThan(0);
    expect(dansChaine.some((j) => porteeDe(j) === RESERVE || porteeDe(j) === CONTEXTUEL)).toBe(false);
  });
});

describe('grammaire : commentaires', () => {
  it('colorie un commentaire jusqu\'à la fin de la ligne', async () => {
    const [ligne] = await colorier('texte "a" # page si bouton');
    const commentaire = ligne.find((j) => j.texte.startsWith('#'));
    expect(commentaire && porteeDe(commentaire)).toBe('comment.line.number-sign.humalis');
    expect(commentaire!.texte).toBe('# page si bouton');
  });

  it('un # dans une chaîne n\'est pas un commentaire', async () => {
    const [ligne] = await colorier('texte "numéro #3"');
    expect(ligne.some((j) => porteeDe(j) === 'comment.line.number-sign.humalis')).toBe(false);
  });
});

describe('grammaire : ponctuation', () => {
  it('les deux-points ont leur portée', async () => {
    expect(await portee('page "a" :', ':')).toBe('punctuation.separator.humalis');
  });
});

describe('grammaire : bloc style (CSS)', () => {
  it('colorie le contenu du bloc comme du CSS, pas comme du Humalis', async () => {
    const lignes = await colorier('style :\n    #menu .titre { color: red; }\npage "a" :\n    titre "A"');
    const css = lignes[1];
    expect(css.every((j) => j.portees.includes('source.css.embedded.humalis'))).toBe(true);
    expect(css.some((j) => porteeDe(j) === 'comment.line.number-sign.humalis')).toBe(false);
    expect(lignes[2].some((j) => j.portees.includes('source.css.embedded.humalis'))).toBe(false);
  });
});

describe('grammaire : guillemets dans un texte', () => {
  it('\\" reste dans le texte et ne le ferme pas', async () => {
    const [ligne] = await colorier('titre "Le mot \\"page\\" ici"');
    expect(porteeDe(jetonDe(ligne, '\\"'))).toBe('constant.character.escape.humalis');
    expect(porteeDe(jetonDe(ligne, ' ici'))).toBe('string.quoted.double.humalis');
  });
});

describe('grammaire : un texte qui finit par deux antislashs', () => {
  it('se ferme bien sur son guillemet', async () => {
    const [ligne] = await colorier('texte "a\\\\" bouton');
    expect(porteeDe(jetonDe(ligne, 'bouton'))).not.toBe('string.quoted.double.humalis');
  });
});
