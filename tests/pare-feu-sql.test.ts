import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';
import { MOTIF_SQL_DU_PACK, MOTIFS_SQL, MOTIFS_SQL_CODE } from '../src/cibles/serveur/pare-feu.js';

// Les motifs de @astratra/security 1.5.0 (src/waf.js), recopiés pour l'essai.
const PACK = [
  /(\b(union|select|insert|update|delete|drop|alter|create)\b.*\b(from|into|table|database)\b)/gi,
  /(\b(or|and)\b\s+\d+\s*=\s*\d+)/gi,
  /(--|#|\/\*|\*\/|;--)/g,
  /(\.\.\/(\.\.\/){2,})/g,
  /(\/etc\/passwd|\/proc\/self|\/dev\/null)/gi,
  /(<script[\s>]|javascript:|on(error|load|click|mouseover)\s*=)/gi,
  /(\$\{.*\}|\$\(.*\))/g,
  /(\bexec\b|\beval\b|\bFunction\b)\s*\(/gi,
];

// Comme le pack : le chemin, la requête et le corps lus d'un seul tenant.
const bloque = (motifs: RegExp[], corps: unknown, chemin = '/api/avis') => {
  const cibles = [chemin, JSON.stringify({}), JSON.stringify(corps)].join(' ');
  return motifs.some((m) => {
    m.lastIndex = 0;
    return m.test(cibles);
  });
};

const AVANT = PACK.filter((m) => !m.source.includes('--'));
const APRES = [...PACK.filter((m) => !m.source.includes('--') && !m.source.includes(MOTIF_SQL_DU_PACK)), ...MOTIFS_SQL];

const PHRASES = [
  { texte: 'Please select a size from the list' },
  { texte: "I'll select one from the menu" },
  { texte: 'Delete from my cart the red shoes, then update the table into a database' },
  { titre: 'Select', texte: 'from Paris' },
  { texte: "Rock 'n' roll; select your favourite from the list" },
  { texte: 'Créer une table ; mise à jour de la base' },
];

const INJECTIONS = [
  { texte: "' UNION SELECT password FROM users" },
  { texte: '1 UNION ALL SELECT null, version()' },
  { texte: "'; DROP TABLE users" },
  { texte: "admin'; DELETE FROM comptes WHERE 1=1" },
  { texte: '1; drop table produits' },
  { texte: "' AND (SELECT COUNT(*) FROM users) > 0" },
  { texte: "'||(select password from users)||'" },
  { texte: "x' or sleep(5)" },
  { texte: "' or '1'='1" },
  { texte: "1' or 1=1" },
  { texte: 'UNION/**/SELECT motdepasse' },
  { texte: "'; UPDATE comptes SET role = 'admin'" },
];

describe('le pare-feu du serveur produit et le SQL', () => {
  it('avant : une phrase anglaise avec « select … from » était refusée', () => {
    expect(bloque(AVANT, PHRASES[0])).toBe(true);
  });

  it('une phrase ordinaire passe, même en anglais, même en deux champs', () => {
    for (const phrase of PHRASES) expect(bloque(APRES, phrase), JSON.stringify(phrase)).toBe(false);
  });

  it('les injections restent refusées', () => {
    for (const injection of INJECTIONS) expect(bloque(APRES, injection), JSON.stringify(injection)).toBe(true);
    expect(bloque(APRES, {}, "/api/avis/1%27%20union%20select%20motdepasse")).toBe(true);
    // Les autres motifs du pack restent.
    expect(bloque(APRES, { texte: '<script>alert(1)</script>' })).toBe(true);
    expect(bloque(APRES, { texte: 'a or 1=1' })).toBe(true);
  });

  it('le serveur produit écrit ces motifs, en JavaScript valide', () => {
    const source = 'serveur "s" :\n    donnee avis :\n        texte : texte\n    route "avis" :\n        tout le monde peut creer avis\n        seul admin peut lire avis\n';
    const serveur = genererProjetServeur(compiler(source).application!.serveurs[0], { nom: 'b', source: 'b.humalis' } as never).get('src/serveur.ts')!;
    expect(serveur).toContain(`const MOTIFS_SQL: RegExp[] = ${MOTIFS_SQL_CODE};`);
    expect(serveur).toContain("!motif.source.includes('union|select|insert')), ...MOTIFS_SQL]");
    const relus = new Function(`return ${MOTIFS_SQL_CODE};`)() as RegExp[];
    expect(relus.map(String)).toEqual(MOTIFS_SQL.map(String));
  });
});
