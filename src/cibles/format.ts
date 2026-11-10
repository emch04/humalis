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

/** 15000, « FC » → « 15 000 FC » ; 12.5, « EUR » → « 12,50 € » ; 12.5, « USD » → « 12,50 $ » ; 12400, « USD » → « 12 400 $ ». */
export function formaterArgent(valeur: number | null | undefined, devise: 'FC' | 'EUR' | 'USD'): string {
  if (typeof valeur !== 'number') return '';
  if (devise === 'EUR') return valeur.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  // Un montant rond s'écrit sans centimes : « 12 400 $ », avec un espace visible dans toutes les polices.
  if (devise === 'USD') return `${valeur.toLocaleString('fr-FR', { minimumFractionDigits: Number.isInteger(valeur) ? 0 : 2, maximumFractionDigits: 2 }).replace(/\u202f/g, '\u00a0')} $`;
  return `${valeur.toLocaleString('fr-FR')} FC`;
}

/** 1572864 octets, « Mo » → « 1,5 Mo » ; en anglais « 1.5 MB ». Rien pour une valeur absente. */
export function formaterTaille(octets: number | null | undefined, unite: 'Ko' | 'Mo', langue = 'fr'): string {
  if (typeof octets !== 'number') return '';
  const valeur = unite === 'Mo' ? octets / 1048576 : octets / 1024;
  const regions: Record<string, string> = { en: 'en-US', es: 'es-ES', pt: 'pt-PT', sw: 'sw' };
  const texte = valeur.toLocaleString(regions[langue] ?? 'fr-FR', { maximumFractionDigits: 1 });
  return `${texte} ${langue === 'fr' || langue === 'ln' ? unite : unite === 'Mo' ? 'MB' : 'KB'}`;
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
  if (devise === 'USD') return \`\${valeur.toLocaleString('fr-FR', { minimumFractionDigits: Number.isInteger(valeur) ? 0 : 2, maximumFractionDigits: 2 }).replace(/\\u202f/g, '\\u00a0')} $\`;
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
    if (devise === 'USD') return \`\${valeur.toLocaleString('fr-FR', { minimumFractionDigits: Number.isInteger(valeur) ? 0 : 2, maximumFractionDigits: 2 }).replace(/\\u202f/g, '\\u00a0')} $\`;
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
export const FORMAT_TS_LANGUES = `/** Les réglages régionaux des nombres de chaque langue (le lingala suit l'usage français de Kinshasa). */
const REGIONS: Record<string, string> = { fr: 'fr-FR', en: 'en-US', es: 'es-ES', pt: 'pt-PT', sw: 'sw', ln: 'fr-FR' };
const region = (langue: string) => REGIONS[langue] ?? REGIONS.fr;

/** Les noms des mois que tous les navigateurs ne connaissent pas : ils sont écrits ici. */
const MOIS: Record<string, string[]> = {
  sw: ['Januari', 'Februari', 'Machi', 'Aprili', 'Mei', 'Juni', 'Julai', 'Agosti', 'Septemba', 'Oktoba', 'Novemba', 'Desemba'],
  ln: ['sánzá ya yambo', 'sánzá ya míbalé', 'sánzá ya mísáto', 'sánzá ya mínei', 'sánzá ya mítáno', 'sánzá ya motóbá', 'sánzá ya nsambo', 'sánzá ya mwambe', 'sánzá ya libwa', 'sánzá ya zómi', 'sánzá ya zómi na mɔ̌kɔ́', 'sánzá ya zómi na míbalé'],
};

/** 28000 → « 28 000 » (en anglais : « 28,000 ») ; rien pour une valeur absente. */
export function formaterNombre(valeur: number | null | undefined, langue = 'fr'): string {
  return typeof valeur === 'number' ? valeur.toLocaleString(region(langue)) : '';
}

/** « 2026-11-07 » → « 7 novembre 2026 » (en anglais : « 7 November 2026 ») ; un texte qui n'est pas une date reste tel quel. */
export function formaterDate(valeur: string | null | undefined, langue = 'fr'): string {
  if (!valeur) return '';
  // Le jour seul, à minuit sur l'appareil : pas de décalage de fuseau horaire.
  const date = new Date(\`\${valeur.slice(0, 10)}T00:00:00\`);
  if (Number.isNaN(date.getTime())) return valeur;
  const mois = MOIS[langue];
  if (mois) return \`\${date.getDate()} \${mois[date.getMonth()]} \${date.getFullYear()}\`;
  return date.toLocaleDateString(langue === 'en' ? 'en-GB' : region(langue), { day: 'numeric', month: 'long', year: 'numeric' });
}

/** 15000, « FC » → « 15 000 FC » ; 12.5, « EUR » → « 12,50 € » (en anglais : « €12.50 ») ; 12.5, « USD » → « 12,50 $ » (« $12.50 »). */
export function formaterArgent(valeur: number | null | undefined, devise: 'FC' | 'EUR' | 'USD', langue = 'fr'): string {
  if (typeof valeur !== 'number') return '';
  if (langue === 'fr') {
    if (devise === 'EUR') return valeur.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
    if (devise === 'USD') return \`\${valeur.toLocaleString('fr-FR', { minimumFractionDigits: Number.isInteger(valeur) ? 0 : 2, maximumFractionDigits: 2 }).replace(/\\u202f/g, '\\u00a0')} $\`;
    return \`\${valeur.toLocaleString('fr-FR')} FC\`;
  }
  if (devise === 'FC') return \`\${valeur.toLocaleString(region(langue))} FC\`;
  return valeur.toLocaleString(region(langue), { style: 'currency', currency: devise === 'EUR' ? 'EUR' : 'USD' });
}

/**
 * 1, « article » → « 1 article » ; 3 → « 3 articles » ; en anglais, 0 et 2 « items », 1 « item » ;
 * en espagnol « 2 artículos », en portugais « 2 artigos ». En swahili et en lingala, le pluriel
 * change le début du mot (« kitabu », « vitabu ») : le mot reste tel qu'écrit.
 */
export function accorder(nombre: number | null | undefined, mot: string, langue = 'fr'): string {
  if (typeof nombre !== 'number') return '';
  const ecrit = nombre.toLocaleString(region(langue));
  if (langue === 'en') {
    const pluriel = /(s|x|z|ch|sh)$/.test(mot) ? \`\${mot}es\` : /[^aeiou]y$/.test(mot) ? \`\${mot.slice(0, -1)}ies\` : \`\${mot}s\`;
    return \`\${ecrit} \${nombre === 1 ? mot : pluriel}\`;
  }
  if (langue === 'es') {
    const pluriel = /ión$/.test(mot) ? \`\${mot.slice(0, -3)}iones\` : /z$/.test(mot) ? \`\${mot.slice(0, -1)}ces\` : /[aeiouáéó]$/.test(mot) ? \`\${mot}s\` : \`\${mot}es\`;
    return \`\${ecrit} \${nombre === 1 ? mot : pluriel}\`;
  }
  if (langue === 'pt') {
    const pluriel = /ão$/.test(mot) ? \`\${mot.slice(0, -2)}ões\` : /m$/.test(mot) ? \`\${mot.slice(0, -1)}ns\` : /[rz]$/.test(mot) ? \`\${mot}es\` : /al$/.test(mot) ? \`\${mot.slice(0, -1)}is\` : /[^s]$/.test(mot) ? \`\${mot}s\` : mot;
    return \`\${ecrit} \${nombre === 1 ? mot : pluriel}\`;
  }
  if (langue === 'sw' || langue === 'ln') return \`\${ecrit} \${mot}\`;
  // En français, le pluriel commence à 2.
  if (Math.abs(nombre) < 2) return \`\${ecrit} \${mot}\`;
  const pluriel = /[sxz]$/.test(mot) ? mot : /al$/.test(mot) ? \`\${mot.slice(0, -2)}aux\` : /(eau|au|eu)$/.test(mot) ? \`\${mot}x\` : \`\${mot}s\`;
  return \`\${ecrit} \${pluriel}\`;
}
`;

/** Les mêmes fonctions en JavaScript, pour humalis/humalis.js (site statique de plusieurs langues), décalées de deux espaces. */
export const FORMAT_JS_LANGUES = FORMAT_TS_LANGUES.replace(/^export /gm, '')
  .replace(/: Record<string, string(\[\])?>/g, '')
  .replace('(langue: string)', '(langue)')
  .replace("(valeur: number | null | undefined, langue = 'fr'): string", "(valeur, langue = 'fr')")
  .replace("(valeur: string | null | undefined, langue = 'fr'): string", "(valeur, langue = 'fr')")
  .replace("(valeur: number | null | undefined, devise: 'FC' | 'EUR' | 'USD', langue = 'fr'): string", "(valeur, devise, langue = 'fr')")
  .replace("(nombre: number | null | undefined, mot: string, langue = 'fr'): string", "(nombre, mot, langue = 'fr')")
  .replace(/^(?=.)/gm, '  ');

/** Les unités d'une taille : « Mo » en français (et en lingala), « MB » ailleurs. */
const UNITES_TAILLE = "langue === 'fr' || langue === 'ln' ? unite : unite === 'Mo' ? 'MB' : 'KB'";

/** « {photo.taille en Mo} » : écrit dans humalis/outils.ts seulement si une page s'en sert. */
export const TAILLE_TS = `/** 1572864 octets, « Mo » → « 1,5 Mo » ; en anglais « 1.5 MB ». Rien pour une valeur absente. */
export function formaterTaille(octets: number | null | undefined, unite: 'Ko' | 'Mo', langue = 'fr'): string {
  if (typeof octets !== 'number') return '';
  const valeur = unite === 'Mo' ? octets / 1048576 : octets / 1024;
  const regions: Record<string, string> = { en: 'en-US', es: 'es-ES', pt: 'pt-PT', sw: 'sw' };
  const texte = valeur.toLocaleString(regions[langue] ?? 'fr-FR', { maximumFractionDigits: 1 });
  return \`\${texte} \${${UNITES_TAILLE}}\`;
}
`;

/** La même fonction en JavaScript, pour humalis/humalis.js (site statique), décalée de deux espaces. */
export const TAILLE_JS = TAILLE_TS.replace(/^export /gm, '')
  .replace(': number | null | undefined', '')
  .replace(": 'Ko' | 'Mo'", '')
  .replace(': Record<string, string>', '')
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

/**
 * « 2026-11-09 » → « lundi 9 novembre » (en anglais « Monday 9 November », en espagnol
 * « lunes, 9 de noviembre ») ; un texte qui n'est pas une date reste tel quel. Le swahili
 * et le lingala ont leurs noms écrits ici : tous les navigateurs ne les connaissent pas.
 */
export function formaterDateLongue(valeur: string | null | undefined, langue = 'fr'): string {
  if (!valeur) return '';
  const date = new Date(`${valeur.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return valeur;
  const noms: Record<string, { jours: string[]; mois: string[]; virgule: boolean }> = {
    sw: {
      jours: ['Jumapili', 'Jumatatu', 'Jumanne', 'Jumatano', 'Alhamisi', 'Ijumaa', 'Jumamosi'],
      mois: ['Januari', 'Februari', 'Machi', 'Aprili', 'Mei', 'Juni', 'Julai', 'Agosti', 'Septemba', 'Oktoba', 'Novemba', 'Desemba'],
      virgule: true,
    },
    ln: {
      jours: ['eyenga', 'mokɔlɔ mwa yambo', 'mokɔlɔ mwa míbalé', 'mokɔlɔ mwa mísáto', 'mokɔlɔ ya mínéi', 'mokɔlɔ ya mítáno', 'mpɔ́sɔ'],
      mois: ['sánzá ya yambo', 'sánzá ya míbalé', 'sánzá ya mísáto', 'sánzá ya mínei', 'sánzá ya mítáno', 'sánzá ya motóbá', 'sánzá ya nsambo', 'sánzá ya mwambe', 'sánzá ya libwa', 'sánzá ya zómi', 'sánzá ya zómi na mɔ̌kɔ́', 'sánzá ya zómi na míbalé'],
      virgule: false,
    },
  };
  const propres = noms[langue];
  if (propres) return `${propres.jours[date.getDay()]}${propres.virgule ? ',' : ''} ${date.getDate()} ${propres.mois[date.getMonth()]}`;
  const region = ({ en: 'en-GB', es: 'es-ES', pt: 'pt-PT' } as Record<string, string>)[langue] ?? 'fr-FR';
  return date.toLocaleDateString(region, { weekday: 'long', day: 'numeric', month: 'long' });
}

/**
 * Un nombre entier en lettres : 71 → « soixante et onze » ; en anglais « seventy-one », en
 * espagnol « setenta y uno », en portugais « setenta e um », en swahili « sabini na moja ».
 * Un nombre à virgule, trop grand, ou en lingala, reste en chiffres.
 */
export function formaterEnLettres(valeur: number | null | undefined, langue = 'fr'): string {
  if (typeof valeur !== 'number' || !Number.isFinite(valeur)) return '';
  const region = ({ en: 'en-US', es: 'es-ES', pt: 'pt-PT', sw: 'sw', ln: 'fr-FR' } as Record<string, string>)[langue] ?? 'fr-FR';
  const limite = langue === 'pt' ? 1e9 : 1e12;
  if (!Number.isInteger(valeur) || Math.abs(valeur) >= limite || !['fr', 'en', 'es', 'pt', 'sw'].includes(langue)) return valeur.toLocaleString(region);
  const n = Math.abs(valeur);
  const moins = ({ fr: 'moins ', en: 'minus ', es: 'menos ', pt: 'menos ', sw: 'hasi ' } as Record<string, string>)[langue];
  const signe = valeur < 0 ? moins : '';
  // Les nombres de 0 à 999 999 999 999, découpés par mille : [milliards, millions, milliers, reste].
  const groupes = [Math.floor(n / 1e9), Math.floor(n / 1e6) % 1000, Math.floor(n / 1000) % 1000, n % 1000];
  if (langue === 'en') {
    const U = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const T = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
    const deux = (x: number) => (x < 20 ? U[x] : T[Math.floor(x / 10)] + (x % 10 ? `-${U[x % 10]}` : ''));
    const trois = (x: number) => [Math.floor(x / 100) ? `${U[Math.floor(x / 100)]} hundred` : '', x % 100 ? deux(x % 100) : ''].filter(Boolean).join(' ');
    if (n === 0) return U[0];
    const echelles = [' billion', ' million', ' thousand', ''];
    return signe + groupes.map((g, i) => (g ? trois(g) + echelles[i] : '')).filter(Boolean).join(' ');
  }
  if (langue === 'es') {
    const U = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
    const T = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
    const C = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
    const deux = (x: number) => (x < 30 ? U[x] : T[Math.floor(x / 10)] + (x % 10 ? ` y ${U[x % 10]}` : ''));
    const trois = (x: number) => (x === 100 ? 'cien' : [C[Math.floor(x / 100)], x % 100 ? deux(x % 100) : ''].filter(Boolean).join(' '));
    // Devant « mil » et « millones », « uno » s'écrit « un » (« veintiún mil »).
    const court = (mots: string) => mots.replace(/veintiuno$/, 'veintiún').replace(/uno$/, 'un');
    const sousLeMillion = (x: number, devant: boolean) => {
      const m = Math.floor(x / 1000), r = x % 1000;
      return [m ? (m === 1 ? 'mil' : `${court(trois(m))} mil`) : '', r ? (devant ? court(trois(r)) : trois(r)) : ''].filter(Boolean).join(' ');
    };
    if (n === 0) return U[0];
    const millones = Math.floor(n / 1e6), reste = n % 1e6;
    return signe + [millones ? (millones === 1 ? 'un millón' : `${sousLeMillion(millones, true)} millones`) : '', reste ? sousLeMillion(reste, false) : ''].filter(Boolean).join(' ');
  }
  if (langue === 'pt') {
    const U = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezasseis', 'dezassete', 'dezoito', 'dezanove'];
    const T = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
    const C = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
    const deux = (x: number) => (x < 20 ? U[x] : T[Math.floor(x / 10)] + (x % 10 ? ` e ${U[x % 10]}` : ''));
    const trois = (x: number) => (x === 100 ? 'cem' : [C[Math.floor(x / 100)], x % 100 ? deux(x % 100) : ''].filter(Boolean).join(' e '));
    if (n === 0) return U[0];
    const [, milhoes, milhares, unidades] = groupes;
    const mots = [
      { valeur: milhoes, texte: milhoes === 1 ? 'um milhão' : `${trois(milhoes)} milhões` },
      { valeur: milhares, texte: milhares === 1 ? 'mil' : `${trois(milhares)} mil` },
      { valeur: unidades, texte: trois(unidades) },
    ].filter((m) => m.valeur > 0);
    // « e » devant le dernier groupe s'il est plus petit que cent, ou un nombre rond de centaines : « mil e cem ».
    return signe + mots.map((m, i) => (i === 0 ? '' : i === mots.length - 1 && (m.valeur < 100 || m.valeur % 100 === 0) ? ' e ' : ' ') + m.texte).join('');
  }
  if (langue === 'sw') {
    const U = ['sifuri', 'moja', 'mbili', 'tatu', 'nne', 'tano', 'sita', 'saba', 'nane', 'tisa'];
    const T = ['', 'kumi', 'ishirini', 'thelathini', 'arobaini', 'hamsini', 'sitini', 'sabini', 'themanini', 'tisini'];
    const deux = (x: number) => (x < 10 ? U[x] : T[Math.floor(x / 10)] + (x % 10 ? ` na ${U[x % 10]}` : ''));
    const trois = (x: number) => [Math.floor(x / 100) ? `mia ${U[Math.floor(x / 100)]}` : '', x % 100 ? deux(x % 100) : ''].filter(Boolean).join(' na ');
    if (n === 0) return U[0];
    // Le nom de l'échelle vient d'abord : « elfu mbili » (deux mille), « milioni tatu ».
    const echelles = ['bilioni ', 'milioni ', 'elfu ', ''];
    return signe + groupes.map((g, i) => (g ? echelles[i] + trois(g) : '')).filter(Boolean).join(' na ');
  }
  const U = ['zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
  const D = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];
  const dizaines = (x = 0): string => {
    if (x < 20) return U[x];
    const d = Math.floor(x / 10), u = x % 10;
    if (d === 7 || d === 9) return D[d] + (x === 71 ? ' et ' : '-') + U[x - (d - 1) * 10];
    if (u === 0) return d === 8 ? 'quatre-vingts' : D[d];
    if (u === 1 && d !== 8) return `${D[d]} et un`;
    return `${D[d]}-${U[u]}`;
  };
  // « final » : devant « mille », ni « cents » ni « quatre-vingts » ne prennent de s.
  const centaines = (x = 0, final = false): string => {
    const c = Math.floor(x / 100), r = x % 100;
    const fin = r === 0 ? '' : final ? dizaines(r) : dizaines(r).replace(/quatre-vingts$/, 'quatre-vingt');
    if (c === 0) return fin;
    const tete = c === 1 ? 'cent' : `${U[c]} cent${r === 0 && final ? 's' : ''}`;
    return fin ? `${tete} ${fin}` : tete;
  };
  if (n === 0) return U[0];
  const [milliards, millions, milliers, reste] = groupes;
  const mots: string[] = [];
  if (milliards) mots.push(`${centaines(milliards, true)} milliard${milliards > 1 ? 's' : ''}`);
  if (millions) mots.push(`${centaines(millions, true)} million${millions > 1 ? 's' : ''}`);
  if (milliers) mots.push(milliers === 1 ? 'mille' : `${centaines(milliers, false)} mille`);
  if (reste) mots.push(centaines(reste, true));
  return `${signe}${mots.join(' ')}`;
}

/** « lundi 9 novembre » → « Lundi 9 novembre ». */
export function avecMajuscule(texte: string | null | undefined, langue = 'fr'): string {
  if (!texte) return '';
  return texte.charAt(0).toLocaleUpperCase(langue) + texte.slice(1);
}

/** « Direction générale » → « DG » : la première lettre des deux premiers mots. */
export function initialesDe(texte: string | null | undefined, langue = 'fr'): string {
  return String(texte ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m.charAt(0)).join('').toLocaleUpperCase(langue);
}

/** Ces quatre fonctions, recopiées telles quelles dans les projets produits ; la langue est facultative (le français). */
const FORMES_TEXTE = { formaterDateLongue, formaterEnLettres, avecMajuscule, initialesDe };
export const NOMS_FORMES_TEXTE = Object.keys(FORMES_TEXTE);
export const FORMES_TEXTE_TS = Object.entries(FORMES_TEXTE).map(([nom, f]) => `export const ${nom}: (valeur: any, langue?: string) => string = ${f.toString()};`).join('\n') + '\n';
export const FORMES_TEXTE_JS = Object.entries(FORMES_TEXTE).map(([nom, f]) => `  const ${nom} = ${f.toString()};`).join('\n') + '\n';
