/**
 * Les vues C# écrites à la main (« utiliser composant "Carte" sur windows "./natif/Carte.cs" ») :
 * une classe WPF (un UserControl, ou tout autre élément), créée avec les propriétés de la page
 * passées par leur nom à son constructeur, comme une vue Swift sur la cible Apple.
 */
import { normaliser } from '../../lexer/motsCles.js';

export type GenreParametre = 'texte' | 'nombre' | 'entier' | 'booleen' | 'autre';

export interface VueNatifCs {
  /** Le nom complet de la classe, depuis la racine (« global::MesVues.Carte »). */
  classe: string;
  parametres: { nom: string; genre: GenreParametre; facultatif: boolean }[];
}

const GENRES: Record<string, GenreParametre> = {
  string: 'texte',
  'string?': 'texte',
  double: 'nombre',
  float: 'nombre',
  decimal: 'nombre',
  int: 'entier',
  long: 'entier',
  bool: 'booleen',
};

/** Le code sans ses commentaires ni le contenu de ses chaînes (pour ne pas y trouver une fausse classe). */
function sansCommentaires(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/@?"(?:[^"\\\n]|\\.)*"/g, '""');
}

/**
 * Lit la classe « nom » du fichier : son espace de noms et les paramètres de son constructeur public.
 * Rend une phrase d'erreur si la classe est introuvable ou si son constructeur ne se lit pas.
 */
export function lireVueNatifCs(nom: string, contenu: string): VueNatifCs | string {
  const code = sansCommentaires(contenu);
  if (!new RegExp(`\\bclass\\s+${nom}\\b`).test(code)) return `la classe « ${nom} » est introuvable : le fichier doit déclarer « public class ${nom} : UserControl » (ou un autre élément WPF).`;
  const espace = /\bnamespace\s+([\w.]+)\s*[;{]/.exec(code)?.[1];
  const constructeurs = [...code.matchAll(new RegExp(`\\bpublic\\s+${nom}\\s*\\(([^)]*)\\)`, 'g'))];
  if (constructeurs.length > 1) return `la classe « ${nom} » a plusieurs constructeurs publics : gardez-en un seul, celui que la page appelle.`;
  const parametres: VueNatifCs['parametres'] = [];
  const liste = constructeurs[0]?.[1]?.trim() ?? '';
  if (liste !== '') {
    for (const morceau of liste.split(',')) {
      const m = /^\s*([\w.<>?[\]]+)\s+(\w+)\s*(=\s*[^,]+)?$/.exec(morceau);
      if (!m) return `le paramètre « ${morceau.trim()} » du constructeur de « ${nom} » ne se lit pas : écrivez « string titre », « double prix » ou « bool actif ».`;
      parametres.push({ nom: m[2]!, genre: GENRES[m[1]!] ?? 'autre', facultatif: m[3] !== undefined });
    }
  }
  return { classe: `global::${espace ? `${espace}.` : ''}${nom}`, parametres };
}

/** Le paramètre du constructeur qui reçoit la propriété « nom » de la page (sans accent ni majuscule). */
export function parametreDe(vue: VueNatifCs, nom: string): VueNatifCs['parametres'][number] | undefined {
  const cherche = normaliser(nom).replace(/[^a-z0-9]/g, '');
  return vue.parametres.find((p) => p.nom.toLowerCase() === cherche);
}

/** La valeur Humalis (un object?) convertie au type que le constructeur attend. */
export function convertir(code: string, genre: GenreParametre): string {
  switch (genre) {
    case 'texte':
      return `V.T(${code})`;
    case 'nombre':
      return `V.N(${code})`;
    case 'entier':
      return `(int)V.N(${code})`;
    case 'booleen':
      return `V.B(${code})`;
    default:
      return code;
  }
}
