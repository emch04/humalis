/**
 * « donnee commande par boutique : », « donnee message par compte : » et
 * « client peut lire facture si … » : qui voit quelle fiche. Tout est vérifié sur
 * le serveur, avec le compte relu à chaque requête. Un admin voit tout.
 */
import type { ConditionRegleRI, ServeurRI } from '../../ri/types.js';
import { camel } from '../web/noms.js';

type Route = ServeurRI['routes'][number];
type Donnee = ServeurRI['donnees'][number];
export type ActionSeparee = 'lire' | 'creer' | 'modifier' | 'supprimer';

export const conditionsDe = (route: Route, action: ActionSeparee) => route.conditions?.[action] ?? [];
export const estSeparee = (donnee: Donnee, route: Route) => donnee.par !== undefined || Object.values(route.conditions ?? {}).some((c) => c.length > 0);

export const gardeAction = (qui: string) => `...acces.${qui.startsWith('role:') ? `roles(${JSON.stringify(qui.slice(5).split(','))})` : qui === 'admin' ? 'seulAdmin' : qui === 'tout_le_monde' ? 'toutLeMonde' : 'connecte'}`;

/** Vrai si le serveur doit relire le compte à chaque requête. */
export function compteRelu(serveur: ServeurRI): boolean {
  const droitsComptes = Object.values(serveur.routeComptes?.droits ?? {});
  return Boolean(serveur.changeDeRole) || Boolean(serveur.changeDeCompte) || droitsComptes.some((d) => d?.startsWith('role:')) || serveur.routes.some((r) => estSeparee(serveur.donnees.find((d) => d.nom === r.donnee)!, r));
}

/** Les champs de groupe que porte un compte : « par boutique » oui, « par compte » non. */
export const champsDeGroupe = (serveur: ServeurRI): string[] => [...new Set(serveur.donnees.flatMap((d) => (d.par && d.par !== 'compte' ? [camel(d.par)] : [])))];

const operande = (o: ConditionRegleRI['gauche']): string =>
  o.genre === 'valeur' ? JSON.stringify(o.valeur) : `${o.genre === 'fiche' ? 'fiche' : 'moi'}[${JSON.stringify(camel(o.champ))}]`;

const testDe = (c: ConditionRegleRI): string =>
  c.dans
    ? `(fiche, moi) => { const liste = ${operande(c.droite)}; return Array.isArray(liste) && liste.includes(${operande(c.gauche)}); }`
    : `(fiche, moi) => ${operande(c.gauche)} !== undefined && ${operande(c.gauche)} === ${operande(c.droite)}`;

const rolesDe = (qui: string): string => (qui.startsWith('role:') ? JSON.stringify(qui.slice(5).split(',')) : `'${qui}'`);

/** Les réglages d'une route séparée, écrits une fois au-dessus de ses gestionnaires. */
export function constantesSeparation(variable: string, donnee: Donnee, route: Route): string {
  const separation = donnee.par ? `{ champ: ${JSON.stringify(camel(donnee.par))}, parCompte: ${donnee.par === 'compte'} }` : 'null';
  const regles = (['lire', 'creer', 'modifier', 'supprimer'] as const).map((action) => {
    const conditions = conditionsDe(route, action);
    if (conditions.length === 0) return `${action}: undefined`;
    const libre = route.droits[action];
    const lignes = [...(libre ? [`{ roles: ${rolesDe(libre)} }`] : []), ...conditions.map((c) => `{ roles: ${rolesDe(c.qui)}, test: ${testDe(c)} }`)];
    return `${action}: [${lignes.join(', ')}] as RegleAcces[]`;
  });
  return `      const separation${variable}: Separation | null = ${separation};
      const regles${variable} = { ${regles.join(', ')} };
`;
}

/** Le début d'un gestionnaire : ce que cette personne peut atteindre, ou un refus. */
export function codePortee(variable: string, action: ActionSeparee): string {
  return `          const portee = porteeDe(moiDe(req), separation${variable}, regles${variable}.${action});
          if (!portee) {
            res.status(403).json({ erreur: REFUS_FICHES });
            return;
          }
`;
}

/** Une fiche hors de portée est « introuvable » : on ne révèle pas qu'elle existe ailleurs. */
export function codeFicheVisible(variable: string, donnee: string, nomDonnee: string, action: ActionSeparee, champGroupe?: string): string {
  return `${codePortee(variable, action)}          const visible = await stockages.${donnee}.trouver(req.params.id);
          if (!visible || !dansPortee(visible, portee)) {
            sansCache(res).status(404).json({ erreur: introuvable('${nomDonnee}') });
            return;
          }
${action !== 'lire' && champGroupe !== undefined ? `          res.locals.groupeDirect = visible[${JSON.stringify(camel(champGroupe))}];\n` : ''}`;
}

const qui = (droit: string | null | undefined) => (droit?.startsWith('role:') ? droit.slice(5).split(',')[0] : 'utilisateur');

/** Les vérifications produites pour une route séparée : le visiteur, l'admin, et deux groupes qui ne se voient pas. */
export function testsSeparee(serveur: ServeurRI, route: Route, donnee: Donnee, adresse: string, exemple: string, envoi: string): string {
  const stockage = `stockages.${camel(route.donnee)}`;
  const avec = (jeton: string) => `.set('authorization', \`Bearer \${${jeton}}\`)`;
  const tests: string[] = [];
  const conditions = (['lire', 'creer', 'modifier', 'supprimer'] as const).some((a) => conditionsDe(route, a).length > 0);
  if (route.droits.lire !== 'tout_le_monde') tests.push(`    it('un visiteur ne lit rien', async () => {
      await request(app).get('${adresse}').expect(${route.droits.lire === null && !conditionsDe(route, 'lire').length ? 403 : 401});
    });`);
  if (route.droits.lire !== null || conditionsDe(route, 'lire').length > 0) tests.push(`    it('un admin voit tout', async () => {
      await ${stockage}.creer(${exemple});
      const reponse = await request(app).get('${adresse}')${avec('jetonAdmin')}.expect(200);
      expect(reponse.body.length).toBeGreaterThan(0);
    });`);
  if (donnee.par !== undefined && !conditions && route.droits.lire !== null && route.droits.lire !== 'tout_le_monde') {
    const champ = camel(donnee.par);
    const role = qui(route.droits.lire);
    const parCompte = donnee.par === 'compte';
    tests.push(`    it('deux ${donnee.par} différents ne se voient pas', async () => {
      const a = await nouveauCompte('${role}'${parCompte ? '' : `, { ${JSON.stringify(champ)}: 'groupe-a' }`});
      const b = await nouveauCompte('${role}'${parCompte ? '' : `, { ${JSON.stringify(champ)}: 'groupe-b' }`});
      const deA = await ${stockage}.creer({ ...${exemple}, ${JSON.stringify(champ)}: ${parCompte ? 'a.id' : "'groupe-a'"} });
      const deB = await ${stockage}.creer({ ...${exemple}, ${JSON.stringify(champ)}: ${parCompte ? 'b.id' : "'groupe-b'"} });
      const liste = await request(app).get('${adresse}').set('authorization', \`Bearer \${a.jeton}\`).expect(200);
      expect(liste.body.map((f: { id: string }) => f.id)).toContain(deA.id);
      expect(liste.body.map((f: { id: string }) => f.id)).not.toContain(deB.id);
      await request(app).get(\`${adresse}/\${deB.id}\`).set('authorization', \`Bearer \${a.jeton}\`).expect(404);
      const forcee = await request(app).get('${adresse}?${champ}=${parCompte ? "' + b.id + '" : 'groupe-b'}').set('authorization', \`Bearer \${a.jeton}\`).expect(200);
      expect(forcee.body.map((f: { id: string }) => f.id)).not.toContain(deB.id);
${route.droits.creer && route.droits.creer !== 'tout_le_monde' ? `      const cree = await request(app).post('${adresse}').set('authorization', \`Bearer \${${qui(route.droits.creer) === role ? 'a' : '(await nouveauCompte(' + `'${qui(route.droits.creer)}'` + (parCompte ? '' : `, { ${JSON.stringify(champ)}: 'groupe-a' }`) + '))'}.jeton}\`).send(${envoi});
      expect(cree.status).toBe(201);
      expect(cree.body.${champ}).toBe(${parCompte && qui(route.droits.creer) !== role ? 'cree.body.' + champ : parCompte ? 'a.id' : "'groupe-a'"});` : ''}
    });`);
  }
  return `  describe('route « ${route.adresse} », séparée', () => {
${tests.join('\n\n')}
  });`;
}

/** src/humalis/separation.ts */
export const SEPARATION = String.raw`import type { Request } from 'express';
import type { Enregistrement, Filtres, Stockage } from './stockage.js';

/** Produit par Humalis : qui voit quelle fiche. Un admin voit tout ; ailleurs, rien n'est visible sans règle. */
export type Moi = Record<string, unknown> & { id: string; role: string };
type Fiche = Record<string, unknown>;

export interface RegleAcces {
  roles: string[] | 'connecte' | 'admin' | 'tout_le_monde';
  test?: (fiche: Fiche, moi: Moi) => boolean;
}
export interface Separation {
  champ: string;
  parCompte: boolean;
}
export interface Portee {
  egal: Record<string, string>;
  test?: (fiche: Fiche) => boolean;
}

export const REFUS_FICHES = "vous n'avez pas accès à ces fiches";
export const moiDe = (req: Request): Moi | undefined => (req as unknown as { user?: Moi }).user;

const concerne = (regle: RegleAcces, moi: Moi) => regle.roles === 'connecte' || regle.roles === 'tout_le_monde' || (Array.isArray(regle.roles) && regle.roles.includes(moi.role));

/** Ce que cette personne peut atteindre ; null : rien du tout. Sans personne, la route est publique. */
export function porteeDe(moi: Moi | undefined, separation: Separation | null, regles: RegleAcces[] | undefined): Portee | null {
  if (!moi || moi.role === 'admin') return { egal: {} };
  const egal: Record<string, string> = {};
  if (separation) {
    const valeur = separation.parCompte ? moi.id : moi[separation.champ];
    if (typeof valeur !== 'string' || valeur === '') return null;
    egal[separation.champ] = valeur;
  }
  if (!regles) return { egal };
  const permises = regles.filter((regle) => concerne(regle, moi));
  if (permises.length === 0) return null;
  if (permises.some((regle) => !regle.test)) return { egal };
  return { egal, test: (fiche) => permises.some((regle) => regle.test!(fiche, moi)) };
}

export const dansPortee = (fiche: Fiche, portee: Portee) => Object.entries(portee.egal).every(([champ, valeur]) => fiche[champ] === valeur) && (!portee.test || portee.test(fiche));

/** La liste vue par cette personne : ses groupes d'abord, dans la base ; les conditions ensuite, avant la tranche demandée. */
export async function listerDans(stockage: Stockage, filtres: Filtres, portee: Portee): Promise<Enregistrement[]> {
  const base: Filtres = { ...filtres, egal: { ...filtres.egal, ...portee.egal } };
  if (!portee.test) return stockage.lister(base);
  const { limite, depuis, ...sansTranche } = base;
  const vues = (await stockage.lister(sansTranche)).filter(portee.test);
  const debut = depuis ?? 0;
  return limite === undefined ? vues.slice(debut) : vues.slice(debut, debut + limite);
}

/** Le groupe d'une fiche créée : celui de la personne. Seul un admin, qui n'en a pas forcément, peut le préciser. */
export function groupeACreer(req: Request, portee: Portee, separation: Separation): { valeur: string } | { erreur: string } {
  const impose = portee.egal[separation.champ];
  if (impose !== undefined) return { valeur: impose };
  const moi = moiDe(req)!;
  if (separation.parCompte) return { valeur: moi.id };
  const corps = (req.body ?? {}) as Record<string, unknown>;
  const demande = corps[separation.champ] ?? moi[separation.champ];
  delete corps[separation.champ];
  return typeof demande === 'string' && demande !== '' ? { valeur: demande } : { erreur: 'précisez « ' + separation.champ + ' »' };
}
`;
