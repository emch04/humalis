/**
 * Grammaire tree-sitter de Humalis, pour la coloration dans Zed, Helix,
 * Neovim et Emacs (les erreurs, le survol, la complétion… viennent du
 * serveur de langage, « humalis editeur --stdio »).
 *
 * Elle lit le fichier mot par mot, sans construire l'arbre des blocs : une
 * coloration qui ne casse jamais, même au milieu d'une ligne en cours
 * d'écriture. Les mots viennent de mots.json, tiré du vocabulaire du
 * compilateur (scripts/generer-mots.mjs) : ils ne sont jamais écrits ici.
 *
 * Comme le compilateur, elle accepte chaque mot avec ou sans accents et
 * dans n'importe quelle casse (« Égal », « egal », « EGAL »).
 */
const mots = require('./mots.json');

/** Chaque lettre, dans les deux casses et avec ses accents. */
const LETTRES = {
  a: 'aàâäAÀÂÄ',
  c: 'cçCÇ',
  e: 'eéèêëEÉÈÊË',
  i: 'iîïIÎÏ',
  o: 'oôöOÔÖ',
  u: 'uùûüUÙÛÜ',
};

function motSouple(mot) {
  return [...mot]
    .map((lettre) => {
      const variantes = LETTRES[lettre] ?? (lettre.toLowerCase() !== lettre.toUpperCase() ? lettre.toLowerCase() + lettre.toUpperCase() : '');
      return variantes ? `[${variantes}]` : lettre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('');
}

/**
 * Un mot de la liste. Pas de priorité : tree-sitter garde le jeton le plus
 * long (« simple » est un nom, pas « si » suivi de « mple ») et, à longueur
 * égale, la règle écrite la première (« si » est un mot réservé, pas un nom).
 */
const motsDe = (liste) => token(new RegExp([...liste].sort((a, b) => b.length - a.length).map(motSouple).join('|')));

module.exports = grammar({
  name: 'humalis',

  extras: () => [/[ \t\r\f\uFEFF]/],

  rules: {
    source_file: ($) => repeat($._element),

    _element: ($) =>
      choice(
        $.commentaire,
        $.chaine,
        $.nombre,
        $.constante,
        $.mot_reserve,
        $.mot_contextuel,
        $.nom,
        $.ponctuation,
        $.operateur,
        $._fin_de_ligne,
      ),

    _fin_de_ligne: () => /\n/,

    commentaire: () => token(seq('#', /[^\n]*/)),

    // Une chaîne finit au guillemet, ou à la fin de la ligne si on l'écrit encore.
    chaine: ($) =>
      seq(
        '"',
        repeat(choice($.contenu, $.interpolation, $.code_en_ligne, $.echappement)),
        choice('"', $._fin_de_ligne),
      ),
    contenu: () => token.immediate(prec(1, /[^"\\{`\n]+/)),
    echappement: () => token.immediate(/\\["\\]?/),
    // `titre "Bonjour"` : le code d'une phrase, recopié tel quel.
    code_en_ligne: () => token.immediate(/`[^`\n]*`/),
    // {nom}, {total en euros}, {code "…"} : une valeur insérée dans le texte.
    interpolation: () => token.immediate(/\{[^}\n]*\}?/),

    nombre: () => /[0-9]+(\.[0-9]+)?/,
    constante: () => motsDe(mots.constantes),
    mot_reserve: () => motsDe(mots.reserves),
    mot_contextuel: () => motsDe(mots.contextuels),
    nom: () => /[\p{L}_][\p{L}\p{N}_]*/u,
    ponctuation: () => choice(':', ',', '.', '(', ')', '[', ']', '{', '}', "'", '’'),
    operateur: () => choice('=', '+', '-', '*', '/', '<', '>', '%', '!', '?', '&', '|', ';', '@', '$', '^', '~', '\\', '`'),
  },
});
