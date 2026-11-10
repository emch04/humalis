/**
 * Les styles écrits à la main dans la langue de chaque plateforme (« utiliser style "./apple.swift" sur apple »,
 * « … "./android.kt" sur android », « … "./windows.xaml" sur windows ») : la porte de sortie quand le style
 * Humalis ou le CSS traduit ne suffit pas. L'extension du fichier donne sa langue.
 */
export type LangueStyle = 'css' | 'swift' | 'kotlin' | 'xaml';

export function langueDuStyle(chemin: string): LangueStyle {
  const extension = /\.([a-z]+)$/i.exec(chemin)?.[1]?.toLowerCase();
  return extension === 'swift' ? 'swift' : extension === 'kt' ? 'kotlin' : extension === 'xaml' ? 'xaml' : 'css';
}

/** Les plateformes qui lisent chaque langue de style native, et son nom pour les messages. */
export const PLATEFORMES_DU_STYLE: Record<Exclude<LangueStyle, 'css'>, { plateformes: string[]; nom: string }> = {
  swift: { plateformes: ['apple', 'ios', 'macos'], nom: 'Swift' },
  kotlin: { plateformes: ['android'], nom: 'Kotlin' },
  xaml: { plateformes: ['windows'], nom: 'XAML' },
};

/** Le nom d'un style en majuscules collées (« bouton-principal » → BoutonPrincipal), pour Swift et Kotlin. */
export function nomStyleNatif(classe: string): string {
  return classe
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((m) => m[0]!.toUpperCase() + m.slice(1))
    .join('');
}

/** Le code sans ses commentaires (pour ne pas y trouver un faux style). */
export function sansCommentairesNatifs(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
}

/** Swift : les « struct StyleCarte: ViewModifier » du fichier, par nom (Carte). */
export function stylesSwiftDu(contenu: string): string[] {
  return [...sansCommentairesNatifs(contenu).matchAll(/\bstruct\s+Style(\w+)\s*:[^{]*\bViewModifier\b/g)].map((m) => m[1]!);
}

/** XAML : les clés des « <Style x:Key="carte" …> » d'un ResourceDictionary. */
export function stylesXamlDu(contenu: string): string[] {
  return [...sansCommentairesNatifs(contenu).matchAll(/<Style\b[^>]*\bx:Key\s*=\s*"([^"]+)"/g)].map((m) => m[1]!);
}

/** Kotlin : les « fun Modifier.carte(): Modifier » du fichier, par nom (Carte). */
export function stylesKotlinDu(contenu: string): string[] {
  return [...sansCommentairesNatifs(contenu).matchAll(/\bfun\s+Modifier\.(\w+)\s*\(\s*\)/g)].map((m) => nomStyleNatif(m[1]!));
}

/**
 * Pour vérifier les noms des pages : les styles d'un fichier natif. Un nom XAML est la classe elle-même ;
 * un nom Swift ou Kotlin est écrit « natif:Carte », comparé à la classe par estStyleDefini.
 */
export function nomsDesStylesNatifs(langue: Exclude<LangueStyle, 'css'>, contenu: string): string[] {
  if (langue === 'xaml') return stylesXamlDu(contenu);
  return (langue === 'swift' ? stylesSwiftDu(contenu) : stylesKotlinDu(contenu)).map((n) => `natif:${n}`);
}

/** Vrai si la classe est définie : dans un CSS, un style Humalis, ou un fichier de style natif. */
export function estStyleDefini(definies: Set<string>, classe: string): boolean {
  return definies.has(classe) || definies.has(`natif:${nomStyleNatif(classe)}`);
}
