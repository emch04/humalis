/**
 * Ce que demandent les composants React recopiés dans le projet : leurs
 * paquets (three, gsap…), lus dans leurs imports, et le chargement différé
 * de ceux qui tirent une bibliothèque 3D, trop lourde pour partir avec la page.
 */

/** Versions essayées ensemble ; un paquet absent de cette liste part en `latest`. */
export const VERSIONS_PAQUETS_REACT: Record<string, string> = {
  three: '0.187.0',
  '@react-three/fiber': '9.8.2',
  '@react-three/drei': '10.7.9',
  '@react-three/postprocessing': '3.2.2',
  postprocessing: '6.39.6',
  gsap: '3.15.0',
  lenis: '1.3.27',
};
const VERSION_TYPES_THREE = '0.187.0';

/** Déjà fournis par le projet produit, ou propres à Node. */
const DEJA_LA = new Set(['react', 'react-dom', 'react-router']);

/** `three`, `@react-three/fiber/x` → le nom du paquet ; undefined pour un chemin relatif ou un module de Node. */
function nomDuPaquet(specificateur: string): string | undefined {
  if (specificateur.startsWith('.') || specificateur.startsWith('/') || specificateur.startsWith('node:')) return undefined;
  const parties = specificateur.split('/');
  return specificateur.startsWith('@') ? parties.slice(0, 2).join('/') : parties[0];
}

/** Les paquets importés par un fichier JavaScript ou TypeScript. */
export function paquetsImportes(code: string): string[] {
  const motifs = [
    /^\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]/gm,
    /^\s*import\s*['"]([^'"]+)['"]/gm,
    /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  const trouves = new Set<string>();
  for (const motif of motifs) {
    for (const m of code.matchAll(motif)) {
      const nom = nomDuPaquet(m[1]);
      if (nom && !DEJA_LA.has(nom)) trouves.add(nom);
    }
  }
  return [...trouves].sort();
}

/** Ce qu'il faut ajouter au package.json pour ces composants. */
export function dependancesDesComposantsReact(codes: string[]): { dependances: Record<string, string>; dependancesDev: Record<string, string> } {
  const dependances: Record<string, string> = {};
  const dependancesDev: Record<string, string> = {};
  for (const nom of codes.flatMap(paquetsImportes)) dependances[nom] = VERSIONS_PAQUETS_REACT[nom] ?? 'latest';
  if (dependances.three) dependancesDev['@types/three'] = VERSION_TYPES_THREE;
  return { dependances, dependancesDev };
}

export const utiliseLa3D = (code: string): boolean => paquetsImportes(code).some((p) => p === 'three' || p.startsWith('@react-three/'));

/** Un composant qui charge le vrai à part : le texte de la page s'affiche sans attendre la 3D. */
export function enveloppeDifferee(module: string): string {
  return `// Produit par Humalis : ce composant utilise une bibliothèque 3D, chargée à part.
import { lazy, Suspense, type ComponentType } from 'react';

type Proprietes = Record<string, unknown>;
const Composant = lazy(() => import('./${module}') as unknown as Promise<{ default: ComponentType<Proprietes> }>);

export default function ComposantDiffere(props: Proprietes) {
  return (
    <Suspense fallback={null}>
      <Composant {...props} />
    </Suspense>
  );
}
`;
}
