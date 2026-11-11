/**
 * « noter panier et total » : écrire des valeurs pendant le développement,
 * avec la ligne Humalis (« [boutique.humalis:12] panier = [2 éléments] ;
 * total = 42,5 »). Rien en production, sur toutes les cibles :
 *
 * - web et bureau (moteur) : `import.meta.env.DEV`, que Vite remplace par
 *   faux à la construction (l'appel disparaît du site construit) ; la
 *   console du navigateur, et l'inspecteur de `humalis developper` ;
 * - serveur : le terminal, sauf si NODE_ENV vaut production ;
 * - Apple : `#if DEBUG` (console de Xcode) ;
 * - Android : seulement si l'application est débogable (Logcat) ;
 * - Windows : `[Conditional("DEBUG")]` (fenêtre Sortie de Visual Studio).
 *
 * Le lieu (« boutique.humalis:12 ») n'est connu qu'à l'écriture du projet :
 * les générateurs écrivent `@humalis-lieu:<ligne fusionnée>`, que
 * appliquerLignesHumalis remplace (voir cibles/lignes-humalis.ts).
 */

/** Le repère du lieu d'une note, remplacé à l'écriture du projet. */
export const lieuNote = (ligne: number | undefined): string => `@humalis-lieu:${ligne ?? 0}`;

/** Le JavaScript commun (navigateur et Node) : la mise en forme d'une valeur. */
export const APERCU_NOTE_JS = `function apercuNote(valeur, profondeur = 0) {
  if (valeur === null || valeur === undefined) return 'rien';
  if (typeof valeur === 'boolean') return valeur ? 'vrai' : 'faux';
  if (typeof valeur === 'number') return Number.isFinite(valeur) ? valeur.toLocaleString('fr-FR', { maximumFractionDigits: 6 }).replace(/\\u202f/g, ' ') : String(valeur);
  if (typeof valeur === 'string') return JSON.stringify(valeur);
  if (Array.isArray(valeur)) {
    if (profondeur > 0) return '[' + valeur.length + (valeur.length > 1 ? ' éléments]' : ' élément]');
    const debut = valeur.slice(0, 5).map((v) => apercuNote(v, profondeur + 1)).join(', ');
    return '[' + debut + (valeur.length > 5 ? ', … (' + valeur.length + ' éléments)' : '') + ']';
  }
  if (typeof valeur === 'object') {
    if (profondeur > 1) return '{…}';
    const champs = Object.entries(valeur);
    return '{ ' + champs.slice(0, 8).map(([nom, v]) => nom + ': ' + apercuNote(v, profondeur + 1)).join(', ') + (champs.length > 8 ? ', …' : '') + ' }';
  }
  return String(valeur);
}

/** « [boutique.humalis:12] panier = [2 éléments] ; total = 42,5 ». */
function texteNote(lieu, valeurs) {
  return (lieu ? '[' + lieu + '] ' : '') + valeurs.map(([libelle, valeur, titre]) => (titre ? String(valeur) : libelle + ' = ' + apercuNote(valeur))).join(' ; ');
}
`;

/** Le navigateur : la console (objets dépliables), et l'événement que l'inspecteur écoute. */
export const NOTER_NAVIGATEUR_JS = `
${APERCU_NOTE_JS}
/** « noter … » : seulement pendant le développement (l'appel est retiré du site construit). */
function noter(lieu, valeurs) {
  const objets = valeurs.filter(([, valeur, titre]) => !titre && valeur !== null && typeof valeur === 'object');
  console.log('%c' + (lieu ? '[' + lieu + ']' : '[Humalis]') + '%c ' + texteNote('', valeurs), 'color:#0b6e4f;font-weight:bold', '', ...objets.map(([, valeur]) => valeur));
  let copie = valeurs;
  try { copie = JSON.parse(JSON.stringify(valeurs)); } catch { /* Une valeur qui ne se copie pas reste telle quelle. */ }
  window.dispatchEvent(new CustomEvent('humalis:note', { detail: { lieu, valeurs: copie.map(([libelle, valeur, titre]) => ({ libelle, valeur, titre: Boolean(titre) })), date: Date.now() } }));
}
`;

/** Apple : la console de Xcode, en Debug seulement ; en Release, l'appel et ses valeurs disparaissent (@autoclosure). */
export const NOTES_SWIFT = `

/** « noter … » : la console de Xcode pendant le développement ; rien en Release. */
enum HumalisNotes {
    static func noter(_ lieu: String, _ valeurs: @autoclosure () -> [(String, Any?, Bool)]) {
        #if DEBUG
        let texte = valeurs().map { $0.2 ? apercu($0.1, guillemets: false) : "\\($0.0) = \\(apercu($0.1))" }.joined(separator: " ; ")
        print(lieu.isEmpty ? texte : "[\\(lieu)] \\(texte)")
        #endif
    }

    static func apercu(_ valeur: Any?, guillemets: Bool = true) -> String {
        guard let valeur else { return "rien" }
        if let texte = valeur as? String { return guillemets ? "\\"\\(texte)\\"" : texte }
        if let vrai = valeur as? Bool { return vrai ? "vrai" : "faux" }
        if let nombre = valeur as? Double { return formaterNombre(nombre) }
        if let liste = valeur as? [Any] {
            let debut = liste.prefix(5).map { apercu($0) }.joined(separator: ", ")
            return "[\\(debut)\\(liste.count > 5 ? ", … (\\(liste.count) éléments)" : "")]"
        }
        if let affichable = valeur as? AffichableHumalis { return affichable.enTexteHumalis }
        return String(describing: valeur)
    }
}
`;

/** Le serveur : le terminal, jamais en production. */
export const NOTER_SERVEUR_TS = `
${APERCU_NOTE_JS.replace('function apercuNote(valeur, profondeur = 0) {', 'function apercuNote(valeur: unknown, profondeur = 0): string {').replace('function texteNote(lieu, valeurs) {', 'function texteNote(lieu: string, valeurs: [string, unknown, boolean?][]): string {').replace('const champs = Object.entries(valeur);', 'const champs = Object.entries(valeur as Record<string, unknown>);')}
/** « noter … » : le terminal du serveur, sauf en production (NODE_ENV=production). */
export function noter(lieu: string, valeurs: [string, unknown, boolean?][]): void {
  if (process.env.NODE_ENV === 'production') return;
  console.log(texteNote(lieu, valeurs));
}
`;
