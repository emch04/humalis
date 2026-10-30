import boutiqueServeur from '../../../exemples/boutique-serveur.humalis?raw';
import { compiler } from '../../../src/compilateur';
import { genererProjetServeur, MARQUE_SERVEUR, VERSIONS_SERVEUR } from '../../../src/cibles/serveur/projet';

/**
 * Le projet serveur que le compilateur produit pour
 * `exemples/boutique-serveur.humalis`, calculé par `genererProjetServeur`
 * (le vrai générateur) : les extraits affichés sur la page « Le serveur »
 * ne peuvent donc pas mentir.
 */
const { application } = compiler(boutiqueServeur);
if (!application || application.serveurs.length === 0) throw new Error('exemples/boutique-serveur.humalis ne compile plus');

export const FICHIERS_SERVEUR: ReadonlyMap<string, string> = genererProjetServeur(application.serveurs[0], {
  nom: 'boutique',
  source: 'boutique-serveur.humalis',
});

export const CHEMINS_SERVEUR: readonly string[] = [...FICHIERS_SERVEUR.keys()].sort();

export const MARQUE_PROJET_SERVEUR = MARQUE_SERVEUR;

export const VERSIONS_PACKS: Readonly<Record<string, string>> = {
  '@astratra/saas-kit': VERSIONS_SERVEUR.saasKit,
  '@astratra/security': VERSIONS_SERVEUR.security,
  '@astratra/store-postgres': VERSIONS_SERVEUR.storePostgres,
};

/** `src/donnees.ts` : les types et les schémas de champs. */
export const DONNEES_SERVEUR: string = FICHIERS_SERVEUR.get('src/donnees.ts') ?? '';

/** `.env.exemple` : les variables à remplir. */
export const ENV_EXEMPLE_SERVEUR: string = FICHIERS_SERVEUR.get('.env.exemple') ?? '';

/**
 * Le morceau de `src/serveur.ts` qui produit la route « avis », abrégé : une règle
 * de chaque sorte (connecté, personne, seul admin). Seuls les corps sont coupés.
 */
export const ROUTE_AVIS_SERVEUR: string = (() => {
  const code = FICHIERS_SERVEUR.get('src/serveur.ts') ?? '';
  const debut = code.indexOf('// « avis »');
  const finMarque = "app.use('/api/avis', routeAvis);";
  const fin = code.indexOf(finMarque);
  if (debut < 0 || fin < 0) return '';
  const ligneDebut = code.lastIndexOf('\n', debut) + 1;
  const lignes = code
    .slice(ligneDebut, fin + finMarque.length)
    .split('\n')
    .map((l) => l.replace(/^ {6}/, ''));
  // Abrégé : on garde le commentaire, le routeur et la ligne de chaque verbe (avec ses gardes) ; le corps est coupé.
  return lignes
    .flatMap((l) => (/^routeAvis\.\w+\(/.test(l) ? [l, '  // …', '});'] : /^(\/\/|const routeAvis|app\.use)/.test(l) ? [l] : []))
    .join('\n');
})();

/** Les premières vérifications de `tests/regles.test.ts`, pour la route « produits ». */
export const TESTS_REGLES_SERVEUR: string = (() => {
  const code = FICHIERS_SERVEUR.get('tests/regles.test.ts') ?? '';
  const debut = code.indexOf("    it('lire : visiteur");
  const fin = code.indexOf("    it('modifier :");
  if (debut < 0 || fin < 0) return '';
  return code.slice(debut, fin).replace(/^ {4}/gm, '').trimEnd();
})();
