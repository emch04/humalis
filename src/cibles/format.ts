/**
 * Le format français des nombres et des dates (décision F1) : « {p.prix} »
 * s'affiche « 28 000 », « {r.jour} » « 7 novembre 2026 ». Les mêmes
 * fonctions servent au compilateur (le HTML de départ du site statique) et
 * aux projets produits, où elles sont recopiées : le texte écrit d'avance
 * et celui du navigateur sont identiques.
 */

/** Les mots des devises (« {prix en FC} », « valeur montant en euros ») et leur code. */
export const DEVISES: Record<string, 'FC' | 'EUR' | 'USD'> = {
  fc: 'FC',
  franc: 'FC',
  francs: 'FC',
  euro: 'EUR',
  euros: 'EUR',
  dollar: 'USD',
  dollars: 'USD',
};

/** 28000 → « 28 000 », 3.5 → « 3,5 » ; rien pour une valeur absente. */
export function formaterNombre(valeur: number | null | undefined): string {
  return typeof valeur === 'number' ? valeur.toLocaleString('fr-FR') : '';
}

/** « 2026-11-07 » → « 7 novembre 2026 » ; un texte qui n'est pas une date reste tel quel. */
export function formaterDate(valeur: string | null | undefined): string {
  if (!valeur) return '';
  // Le jour seul, à minuit sur l'appareil : pas de décalage de fuseau horaire.
  const date = new Date(`${valeur.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? valeur : date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** 15000, « FC » → « 15 000 FC » ; 12.5, « EUR » → « 12,50 € » ; 12.5, « USD » → « 12,50 $ ». */
export function formaterArgent(valeur: number | null | undefined, devise: 'FC' | 'EUR' | 'USD'): string {
  if (typeof valeur !== 'number') return '';
  if (devise === 'EUR') return valeur.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  if (devise === 'USD') return `${valeur.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`;
  return `${valeur.toLocaleString('fr-FR')} FC`;
}

/** 1572864 octets, « Mo » → « 1,5 Mo » ; en anglais « 1.5 MB ». Rien pour une valeur absente. */
export function formaterTaille(octets: number | null | undefined, unite: 'Ko' | 'Mo', langue = 'fr'): string {
  if (typeof octets !== 'number') return '';
  const valeur = unite === 'Mo' ? octets / 1048576 : octets / 1024;
  const texte = valeur.toLocaleString(langue === 'en' ? 'en-US' : 'fr-FR', { maximumFractionDigits: 1 });
  return `${texte} ${langue === 'en' ? (unite === 'Mo' ? 'MB' : 'KB') : unite}`;
}

/** 1, « article » → « 1 article » ; 3 → « 3 articles » ; 2, « journal » → « 2 journaux ». */
export function accorder(nombre: number | null | undefined, mot: string): string {
  if (typeof nombre !== 'number') return '';
  // En français, le pluriel commence à 2.
  if (Math.abs(nombre) < 2) return `${nombre.toLocaleString('fr-FR')} ${mot}`;
  const pluriel = /[sxz]$/.test(mot) ? mot : /al$/.test(mot) ? `${mot.slice(0, -2)}aux` : /(eau|au|eu)$/.test(mot) ? `${mot}x` : `${mot}s`;
  return `${nombre.toLocaleString('fr-FR')} ${pluriel}`;
}

/** La date du jour sur l'appareil, « 2026-10-30 » (sans décalage de fuseau horaire). */
export function dateDuJour(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** L'instant présent, « 2026-10-30T14:05:00.000Z » : pour dire ensuite « il y a 2 heures ». */
export function maintenant(): string {
  return new Date().toISOString();
}

/** « 2026-10-30 » plus 3 jours → « 2026-11-02 » ; un mois de trop court garde son dernier jour. */
export function decalerDate(valeur: string | null | undefined, nombre: number, unite: 'jours' | 'semaines' | 'mois'): string {
  if (!valeur) return '';
  const d = new Date(`${valeur.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  if (unite === 'mois') {
    const jour = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + nombre);
    d.setDate(Math.min(jour, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  } else d.setDate(d.getDate() + nombre * (unite === 'semaines' ? 7 : 1));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Le nombre de jours de la première date à la seconde (négatif si elle est avant). */
export function joursEntre(debut: string | null | undefined, fin: string | null | undefined): number {
  if (!debut || !fin) return 0;
  const jour = (v: string) => Date.UTC(Number(v.slice(0, 4)), Number(v.slice(5, 7)) - 1, Number(v.slice(8, 10)));
  return Math.round((jour(fin) - jour(debut)) / 86400000);
}

/** « il y a 3 jours », « il y a 2 heures », « à l’instant » ; rien pour une valeur absente. */
export function formaterDepuis(valeur: string | null | undefined): string {
  if (!valeur) return '';
  const ecart = Date.now() - new Date(valeur.length === 10 ? `${valeur}T00:00:00` : valeur).getTime();
  if (Number.isNaN(ecart)) return '';
  const minutes = Math.floor(ecart / 60000);
  const dire = (n: number, mot: string) => `il y a ${n} ${mot}${n > 1 && !mot.endsWith('s') ? 's' : ''}`;
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return dire(minutes, 'minute');
  if (minutes < 1440) return dire(Math.floor(minutes / 60), 'heure');
  if (minutes < 43200) return dire(Math.floor(minutes / 1440), 'jour');
  if (minutes < 525600) return dire(Math.floor(minutes / 43200), 'mois');
  return dire(Math.floor(minutes / 525600), 'an');
}

/** Les fonctions de format, en TypeScript, pour humalis/outils.ts (web, mobile, desktop). */
export const FORMAT_TS = `/** 28000 → « 28 000 », 3.5 → « 3,5 » ; rien pour une valeur absente. */
export function formaterNombre(valeur: number | null | undefined): string {
  return typeof valeur === 'number' ? valeur.toLocaleString('fr-FR') : '';
}

/** « 2026-11-07 » → « 7 novembre 2026 » ; un texte qui n'est pas une date reste tel quel. */
export function formaterDate(valeur: string | null | undefined): string {
  if (!valeur) return '';
  // Le jour seul, à minuit sur l'appareil : pas de décalage de fuseau horaire.
  const date = new Date(\`\${valeur.slice(0, 10)}T00:00:00\`);
  return Number.isNaN(date.getTime()) ? valeur : date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** 15000, « FC » → « 15 000 FC » ; 12.5, « EUR » → « 12,50 € » ; 12.5, « USD » → « 12,50 $ ». */
export function formaterArgent(valeur: number | null | undefined, devise: 'FC' | 'EUR' | 'USD'): string {
  if (typeof valeur !== 'number') return '';
  if (devise === 'EUR') return valeur.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  if (devise === 'USD') return \`\${valeur.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $\`;
  return \`\${valeur.toLocaleString('fr-FR')} FC\`;
}

/** 1, « article » → « 1 article » ; 3 → « 3 articles » ; 2, « journal » → « 2 journaux ». */
export function accorder(nombre: number | null | undefined, mot: string): string {
  if (typeof nombre !== 'number') return '';
  // En français, le pluriel commence à 2.
  if (Math.abs(nombre) < 2) return \`\${nombre.toLocaleString('fr-FR')} \${mot}\`;
  const pluriel = /[sxz]$/.test(mot) ? mot : /al$/.test(mot) ? \`\${mot.slice(0, -2)}aux\` : /(eau|au|eu)$/.test(mot) ? \`\${mot}x\` : \`\${mot}s\`;
  return \`\${nombre.toLocaleString('fr-FR')} \${pluriel}\`;
}
`;

/** Les fonctions de format, en JavaScript, pour humalis/humalis.js (site statique). */
export const FORMAT_JS = `  /** 28000 → « 28 000 », 3.5 → « 3,5 » ; rien pour une valeur absente. */
  function formaterNombre(valeur) {
    return typeof valeur === 'number' ? valeur.toLocaleString('fr-FR') : '';
  }

  /** « 2026-11-07 » → « 7 novembre 2026 » ; un texte qui n'est pas une date reste tel quel. */
  function formaterDate(valeur) {
    if (!valeur) return '';
    // Le jour seul, à minuit sur l'appareil : pas de décalage de fuseau horaire.
    const date = new Date(\`\${valeur.slice(0, 10)}T00:00:00\`);
    return Number.isNaN(date.getTime()) ? valeur : date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  /** 15000, « FC » → « 15 000 FC » ; 12.5, « EUR » → « 12,50 € » ; 12.5, « USD » → « 12,50 $ ». */
  function formaterArgent(valeur, devise) {
    if (typeof valeur !== 'number') return '';
    if (devise === 'EUR') return valeur.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
    if (devise === 'USD') return \`\${valeur.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $\`;
    return \`\${valeur.toLocaleString('fr-FR')} FC\`;
  }

  /** 1, « article » → « 1 article » ; 3 → « 3 articles » ; 2, « journal » → « 2 journaux ». */
  function accorder(nombre, mot) {
    if (typeof nombre !== 'number') return '';
    // En français, le pluriel commence à 2.
    if (Math.abs(nombre) < 2) return \`\${nombre.toLocaleString('fr-FR')} \${mot}\`;
    const pluriel = /[sxz]$/.test(mot) ? mot : /al$/.test(mot) ? \`\${mot.slice(0, -2)}aux\` : /(eau|au|eu)$/.test(mot) ? \`\${mot}x\` : \`\${mot}s\`;
    return \`\${nombre.toLocaleString('fr-FR')} \${pluriel}\`;
  }
`;

/*
 * Les mêmes fonctions pour un site de plusieurs langues (plan
 * 2026-10-30-qualite-publication, T9) : un dernier paramètre `langue`
 * (« fr » par défaut). En anglais : « 1,234.5 », « €1,234.50 », « $12.50 »,
 * « 7 November 2026 », « 1 item », « 0 items ». Écrites seulement si le
 * programme déclare des langues : les autres projets gardent les fonctions
 * ci-dessus, octet pour octet.
 */

/** Les fonctions de format avec la langue, en TypeScript, pour humalis/outils.ts (web, mobile, desktop). */
export const FORMAT_TS_LANGUES = `/** Les réglages régionaux de chaque langue. */
const REGIONS: Record<string, { nombre: string; date: string }> = { fr: { nombre: 'fr-FR', date: 'fr-FR' }, en: { nombre: 'en-US', date: 'en-GB' } };
const region = (langue: string) => REGIONS[langue] ?? REGIONS.fr;

/** 28000 → « 28 000 » (en anglais : « 28,000 ») ; rien pour une valeur absente. */
export function formaterNombre(valeur: number | null | undefined, langue = 'fr'): string {
  return typeof valeur === 'number' ? valeur.toLocaleString(region(langue).nombre) : '';
}

/** « 2026-11-07 » → « 7 novembre 2026 » (en anglais : « 7 November 2026 ») ; un texte qui n'est pas une date reste tel quel. */
export function formaterDate(valeur: string | null | undefined, langue = 'fr'): string {
  if (!valeur) return '';
  // Le jour seul, à minuit sur l'appareil : pas de décalage de fuseau horaire.
  const date = new Date(\`\${valeur.slice(0, 10)}T00:00:00\`);
  return Number.isNaN(date.getTime()) ? valeur : date.toLocaleDateString(region(langue).date, { day: 'numeric', month: 'long', year: 'numeric' });
}

/** 15000, « FC » → « 15 000 FC » ; 12.5, « EUR » → « 12,50 € » (en anglais : « €12.50 ») ; 12.5, « USD » → « 12,50 $ » (« $12.50 »). */
export function formaterArgent(valeur: number | null | undefined, devise: 'FC' | 'EUR' | 'USD', langue = 'fr'): string {
  if (typeof valeur !== 'number') return '';
  if (langue === 'en') {
    if (devise === 'FC') return \`\${valeur.toLocaleString('en-US')} FC\`;
    return valeur.toLocaleString('en-US', { style: 'currency', currency: devise === 'EUR' ? 'EUR' : 'USD' });
  }
  if (devise === 'EUR') return valeur.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  if (devise === 'USD') return \`\${valeur.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $\`;
  return \`\${valeur.toLocaleString('fr-FR')} FC\`;
}

/** 1, « article » → « 1 article » ; 3 → « 3 articles » ; en anglais, 0 et 2 « items », 1 « item ». */
export function accorder(nombre: number | null | undefined, mot: string, langue = 'fr'): string {
  if (typeof nombre !== 'number') return '';
  if (langue === 'en') {
    const pluriel = /(s|x|z|ch|sh)$/.test(mot) ? \`\${mot}es\` : /[^aeiou]y$/.test(mot) ? \`\${mot.slice(0, -1)}ies\` : \`\${mot}s\`;
    return \`\${nombre.toLocaleString('en-US')} \${nombre === 1 ? mot : pluriel}\`;
  }
  // En français, le pluriel commence à 2.
  if (Math.abs(nombre) < 2) return \`\${nombre.toLocaleString('fr-FR')} \${mot}\`;
  const pluriel = /[sxz]$/.test(mot) ? mot : /al$/.test(mot) ? \`\${mot.slice(0, -2)}aux\` : /(eau|au|eu)$/.test(mot) ? \`\${mot}x\` : \`\${mot}s\`;
  return \`\${nombre.toLocaleString('fr-FR')} \${pluriel}\`;
}
`;

/** Les mêmes fonctions en JavaScript, pour humalis/humalis.js (site statique de plusieurs langues), décalées de deux espaces. */
export const FORMAT_JS_LANGUES = FORMAT_TS_LANGUES.replace(/^export /gm, '')
  .replace(': Record<string, { nombre: string; date: string }>', '')
  .replace('(langue: string)', '(langue)')
  .replace("(valeur: number | null | undefined, langue = 'fr'): string", "(valeur, langue = 'fr')")
  .replace("(valeur: string | null | undefined, langue = 'fr'): string", "(valeur, langue = 'fr')")
  .replace("(valeur: number | null | undefined, devise: 'FC' | 'EUR' | 'USD', langue = 'fr'): string", "(valeur, devise, langue = 'fr')")
  .replace("(nombre: number | null | undefined, mot: string, langue = 'fr'): string", "(nombre, mot, langue = 'fr')")
  .replace(/^(?=.)/gm, '  ');

/** « {photo.taille en Mo} » : écrit dans humalis/outils.ts seulement si une page s'en sert. */
export const TAILLE_TS = `/** 1572864 octets, « Mo » → « 1,5 Mo » ; en anglais « 1.5 MB ». Rien pour une valeur absente. */
export function formaterTaille(octets: number | null | undefined, unite: 'Ko' | 'Mo', langue = 'fr'): string {
  if (typeof octets !== 'number') return '';
  const valeur = unite === 'Mo' ? octets / 1048576 : octets / 1024;
  const texte = valeur.toLocaleString(langue === 'en' ? 'en-US' : 'fr-FR', { maximumFractionDigits: 1 });
  return \`\${texte} \${langue === 'en' ? (unite === 'Mo' ? 'MB' : 'KB') : unite}\`;
}
`;

/** La même fonction en JavaScript, pour humalis/humalis.js (site statique), décalée de deux espaces. */
export const TAILLE_JS = TAILLE_TS.replace(/^export /gm, '')
  .replace(': number | null | undefined', '')
  .replace(": 'Ko' | 'Mo'", '')
  .replace('): string {', ') {')
  .replace(/^/gm, '  ');

/** Les dates (« aujourd'hui », « plus 3 jours », « {x depuis} ») : écrites dans humalis/outils.ts seulement si une page s'en sert. */
export const DATES_TS = `/** La date du jour sur l'appareil, « 2026-10-30 » (sans décalage de fuseau horaire). */
export function dateDuJour(): string {
  const d = new Date();
  return \`\${d.getFullYear()}-\${String(d.getMonth() + 1).padStart(2, '0')}-\${String(d.getDate()).padStart(2, '0')}\`;
}

/** L'instant présent, « 2026-10-30T14:05:00.000Z » : pour dire ensuite « il y a 2 heures ». */
export function maintenant(): string {
  return new Date().toISOString();
}

/** « 2026-10-30 » plus 3 jours → « 2026-11-02 » ; un mois de trop court garde son dernier jour. */
export function decalerDate(valeur: string | null | undefined, nombre: number, unite: 'jours' | 'semaines' | 'mois'): string {
  if (!valeur) return '';
  const d = new Date(\`\${valeur.slice(0, 10)}T00:00:00\`);
  if (Number.isNaN(d.getTime())) return '';
  if (unite === 'mois') {
    const jour = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + nombre);
    d.setDate(Math.min(jour, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  } else d.setDate(d.getDate() + nombre * (unite === 'semaines' ? 7 : 1));
  return \`\${d.getFullYear()}-\${String(d.getMonth() + 1).padStart(2, '0')}-\${String(d.getDate()).padStart(2, '0')}\`;
}

/** Le nombre de jours de la première date à la seconde (négatif si elle est avant). */
export function joursEntre(debut: string | null | undefined, fin: string | null | undefined): number {
  if (!debut || !fin) return 0;
  const jour = (v: string) => Date.UTC(Number(v.slice(0, 4)), Number(v.slice(5, 7)) - 1, Number(v.slice(8, 10)));
  return Math.round((jour(fin) - jour(debut)) / 86400000);
}

/** « il y a 3 jours », « il y a 2 heures », « à l’instant » ; rien pour une valeur absente. */
export function formaterDepuis(valeur: string | null | undefined): string {
  if (!valeur) return '';
  const ecart = Date.now() - new Date(valeur.length === 10 ? \`\${valeur}T00:00:00\` : valeur).getTime();
  if (Number.isNaN(ecart)) return '';
  const minutes = Math.floor(ecart / 60000);
  const dire = (n: number, mot: string) => \`il y a \${n} \${mot}\${n > 1 && !mot.endsWith('s') ? 's' : ''}\`;
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return dire(minutes, 'minute');
  if (minutes < 1440) return dire(Math.floor(minutes / 60), 'heure');
  if (minutes < 43200) return dire(Math.floor(minutes / 1440), 'jour');
  if (minutes < 525600) return dire(Math.floor(minutes / 43200), 'mois');
  return dire(Math.floor(minutes / 525600), 'an');
}
`;

/** Les mêmes fonctions en JavaScript, pour humalis/humalis.js (site statique), décalées de deux espaces. */
export const DATES_JS = DATES_TS.replace(/^export /gm, '')
  .replace(/\((valeur|debut|fin)(: string \| null \| undefined)/g, '($1')
  .replace(/, (fin|nombre|unite)(: [^,)]+)/g, ', $1')
  .replace(/\(v: string\)/g, '(v)')
  .replace(/\(n: number, mot: string\)/g, '(n, mot)')
  .replace(/\): (string|number) \{/g, ') {')
  .replace(/^/gm, '  ');
