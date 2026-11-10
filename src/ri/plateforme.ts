/**
 * Un même programme, un design par plateforme. Le compilateur vérifie tout, puis ne garde pour
 * chaque cible que ce qui la concerne : « utiliser style "…" sur apple » (ou « sur windows »), « et sur apple style "…" »,
 * « sur application : », « sur site : ».
 */
import type { Application } from './types.js';

const VISEES: Record<string, string[]> = {
  apple: ['application', 'apple', 'ios', 'macos'],
  mobile: ['application'],
  desktop: ['application'],
  windows: ['application', 'windows'],
  web: ['site'],
  statique: ['site'],
  serveur: [],
};

const MARQUE = /^(apple|ios|macos|windows|site|application):(.+)$/;
/** iOS et macOS partagent un projet Xcode : ce qui leur est propre reste écrit, sous « #if os(…) ». */
const DANS_LE_PROJET = new Set(['ios', 'macos']);

/** Le nom d'un style sans sa plateforme, pour vérifier qu'il existe. */
export const sansPlateforme = (classe: string): string => MARQUE.exec(classe)?.[2] ?? classe;

export function pourLaCible(application: Application, cible: string): Application {
  const visees = VISEES[cible] ?? [];
  // Un identifiant n'est unique que dans son écran : ce qui est retiré d'une page ne dit rien de l'en-tête ni des autres pages.
  let retires = new Set<string>();
  const noter = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(noter);
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o.id === 'string') retires.add(o.id);
      Object.values(o).forEach(noter);
    }
  };
  // Un événement d'un élément retiré n'a plus d'élément à écouter.
  const nettoyer = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(nettoyer);
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (Array.isArray(o.gestionnaires)) o.gestionnaires = (o.gestionnaires as { cibles: string[] }[]).filter((g) => g.cibles.length === 0 || !g.cibles.every((c) => retires.has(c)));
      Object.values(o).forEach(nettoyer);
    }
  };
  const adapter = (v: unknown): unknown => {
    if (Array.isArray(v)) {
      return v.flatMap((n) => {
        const plateforme = n && typeof n === 'object' ? (n as { plateforme?: string }).plateforme : undefined;
        if (plateforme === undefined) return [adapter(n)];
        const voulues = plateforme.split('+').filter((p) => visees.includes(p));
        if (voulues.length === 0) {
          noter(n);
          return [];
        }
        // Une seule plateforme du projet Xcode reste écrite sous « #if os(…) » ; sinon, le bloc vaut partout ici.
        if (voulues.length === 1 && DANS_LE_PROJET.has(voulues[0])) return [adapter({ ...(n as object), plateforme: voulues[0] })];
        return adapter((n as { corps: unknown[] }).corps) as unknown[];
      });
    }
    if (!v || typeof v !== 'object') return v;
    const champs = () => Object.fromEntries(
      Object.entries(v).map(([cle, valeur]) => {
        if (cle === 'classes' && Array.isArray(valeur)) {
          return [cle, (valeur as string[]).flatMap((c) => {
            const lue = MARQUE.exec(c);
            if (!lue) return [c];
            if (!visees.includes(lue[1])) return [];
            return DANS_LE_PROJET.has(lue[1]) ? [c] : [lue[2]];
          })];
        }
        if (cible === 'mobile' && cle === 'options' && Array.isArray(valeur)) return [cle, (valeur as { nom: string; valeur: string }[]).filter((o) => !(o.nom === 'fond' && o.valeur === 'translucide'))];
        return [cle, adapter(valeur)];
      }),
    );
    // Une page, un composant, l'en-tête ou le pied : les seuls objets qui ont une vue et leurs événements.
    if (!('vue' in v && 'gestionnaires' in v)) return champs();
    const autour = retires;
    retires = new Set();
    const ecran = champs();
    if (retires.size > 0) nettoyer(ecran);
    retires = autour;
    return ecran;
  };
  // Les fichiers de style n'ont pas de nœud : « plateforme » n'y marque pas un bloc à déplier.
  const fichiersStyle = application.fichiersStyle.filter((f) => f.plateforme === undefined || visees.includes(f.plateforme));
  const adaptee = adapter({ ...application, fichiersStyle: [] }) as Application;
  adaptee.fichiersStyle = fichiersStyle;
  // Une barre latérale est propre au Mac ; ailleurs elle prend la place de l'en-tête si le projet n'en a pas.
  if (cible !== 'apple' && adaptee.disposition?.barre) {
    const { barre, ...reste } = adaptee.disposition;
    adaptee.disposition = reste.entete ? reste : { ...reste, entete: { ...barre, classes: ['humalis-barre-laterale', ...barre.classes] } };
    if (!adaptee.disposition.entete && !adaptee.disposition.pied) delete adaptee.disposition;
  }
  return adaptee;
}
