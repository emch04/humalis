/**
 * tests/attaques.test.ts du serveur produit : des tests négatifs, écrits par le compilateur pour le programme
 * de chaque auteur. Les tests de règles disent ce qui est permis ; ceux-ci rejouent ce qu'un attaquant essaie :
 * un champ en trop, un champ que seul le serveur écrit, une requête sans session ou avec un faux jeton, un
 * compte d'un rôle voisin, un compte d'un autre groupe.
 *
 * Chaque essai vérifie deux choses : la réponse est un refus, et la fiche n'a pas bougé. Les fiches d'essai
 * sont écrites directement dans le stockage, pour que ces tests ne dépendent d'aucune règle de création.
 */
import type { ServeurRI, TypeChamp } from '../../ri/types.js';
import { camel } from '../web/noms.js';
import { champsFiges } from './regles.js';

type Route = ServeurRI['routes'][number];
type Donnee = ServeurRI['donnees'][number];
type Action = 'lire' | 'creer' | 'modifier' | 'supprimer';
const ACTIONS: Action[] = ['lire', 'creer', 'modifier', 'supprimer'];

const chaine = (texte: string) => JSON.stringify(texte);
const apostrophe = (texte: string) => texte.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

/** Une valeur du bon type, pour une fiche d'essai. */
function exemple(type: TypeChamp): string {
  switch (type.genre) {
    case 'texte':
      return type.image ? "''" : "'exemple'";
    case 'nombre':
      return '1';
    case 'booleen':
      return 'false';
    case 'date':
      return "'2026-01-01'";
    case 'liste':
      return '[]';
    default:
      return 'null';
  }
}

/** Une autre valeur du même type : ce qu'un attaquant voudrait écrire dans un champ du serveur. */
function autreValeur(type: TypeChamp): string {
  switch (type.genre) {
    case 'nombre':
      return '999';
    case 'booleen':
      return 'true';
    case 'liste':
      return "['pirate']";
    default:
      return "'pirate'";
  }
}

/** Les rôles déclarés qui n'ont pas ce droit (quatre au plus : chaque compte d'essai se connecte une fois). */
const ROLES_ESSAYES = 4;

export function testsAttaques(serveur: ServeurRI): string {
  const stockages = serveur.donnees.map((d) => `  ${camel(d.nom)}: creerStockageMemoire(),`).join('\n');
  const roles = (serveur.roles ?? []).slice(0, ROLES_ESSAYES);
  const groupes = [...new Set(serveur.donnees.flatMap((d) => (d.par && d.par !== 'compte' ? [camel(d.par)] : [])))];
  const dans = (groupe: string) => (groupes.length > 0 ? `, { ${groupes.map((g) => `${chaine(g)}: '${groupe}'`).join(', ')} }` : '');

  const blocs = serveur.routes.map((route) => blocRoute(serveur, route, roles)).filter((bloc) => bloc !== '');
  if (blocs.length === 0) return '';

  return `// Produit par Humalis : des attaques rejouées sur le serveur « ${serveur.nom} ». Chaque essai doit être refusé, et la fiche rester intacte.
import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createHmac } from 'node:crypto';
import { createMemoryUsersStore, type UsersStore } from '@astratra/saas-kit';
import { hashPassword } from '@astratra/security';
import { creerServeur } from '../src/serveur.js';
import { creerStockageMemoire } from '../src/humalis/stockage.js';

const MOT_DE_PASSE = 'Essai-Solide-2026!';
const stockages = {
${stockages}
};
type Compte = { id: string; jeton: string };
let app: Parameters<typeof request>[0];
let admin: Compte;
/** Un compte connecté sans rôle déclaré, et un compte par rôle déclaré, dans le groupe « groupe-a » puis « groupe-b ». */
let simple: Compte;
const ici: Record<string, Compte> = {};
const ailleurs: Record<string, Compte> = {};

const base64 = (objet: unknown) => Buffer.from(JSON.stringify(objet)).toString('base64url');
const maintenant = Math.floor(Date.now() / 1000);
const charge = { id: 'user-1', email: 'admin@exemple.cd', role: 'admin', iat: maintenant, exp: maintenant + 900 };
const signe = \`\${base64({ alg: 'HS256', typ: 'JWT' })}.\${base64(charge)}\`;
/** Ce qu'envoie quelqu'un qui n'a pas de session : rien, ou un jeton qu'il a fabriqué. */
const FAUX_JETONS: [string, string][] = [
  ['sans jeton', ''],
  ['un jeton sans signature (alg none)', \`\${base64({ alg: 'none', typ: 'JWT' })}.\${base64(charge)}.\`],
  ['un jeton signé avec un autre secret', \`\${signe}.\${createHmac('sha256', 'un-autre-secret').update(signe).digest('base64url')}\`],
  ['un texte au hasard', 'abc.def.ghi'],
];
const avec = <T extends { set(nom: string, valeur: string): T }>(requete: T, jeton: string): T => (jeton ? requete.set('authorization', \`Bearer \${jeton}\`) : requete);
const refuse = (statut: number) => statut >= 400 && statut < 500;

beforeAll(async () => {
  const usersStore = createMemoryUsersStore() as UsersStore;
  const passwordHash = await hashPassword(MOT_DE_PASSE);
  app = creerServeur({ jwtSecret: 'secret-de-test-assez-long-pour-les-sessions', usersStore, stockages }) as never;
  const compte = async (email: string, role: string, groupes: Record<string, string> = {}): Promise<Compte> => {
    const cree = await usersStore.create({ email, role, passwordHash, ...groupes });
    const reponse = await request(app).post('/auth/login').send({ email, password: MOT_DE_PASSE }).expect(200);
    return { id: String(cree.id), jeton: reponse.body.data.token };
  };
  admin = await compte('admin@exemple.cd', 'admin');
  simple = await compte('simple@exemple.cd', 'utilisateur'${dans('groupe-a')});
${roles.map((role) => `  ici[${chaine(role)}] = await compte(${chaine(`${role}-a@exemple.cd`)}, ${chaine(role)}${dans('groupe-a')});\n  ailleurs[${chaine(role)}] = await compte(${chaine(`${role}-b@exemple.cd`)}, ${chaine(role)}${dans('groupe-b')});`).join('\n')}
});

describe('attaques', () => {
${blocs.join('\n\n')}
});
`;
}

function blocRoute(serveur: ServeurRI, route: Route, roles: string[]): string {
  const donnee = serveur.donnees.find((d) => d.nom === route.donnee);
  if (!donnee || route.interne) return '';
  const magasin = `stockages.${camel(donnee.nom)}`;
  const adresse = `/api/${route.adresse.replace(/^\/+/, '')}`;
  const parCompte = donnee.par === 'compte';
  const champGroupe = donnee.par ? camel(donnee.par) : undefined;
  // La fiche d'essai : dans « groupe-a », ou au compte « simple ».
  const champs = donnee.champs.filter((c) => camel(c.nom) !== champGroupe).map((c) => `${chaine(camel(c.nom))}: ${exemple(c.type)}`);
  if (champGroupe) champs.push(`${chaine(champGroupe)}: ${parCompte ? 'simple.id' : "'groupe-a'"}`);
  const fiche = `await ${magasin}.creer({ ${champs.join(', ')} })`;
  // Un admin qui crée dans une donnée séparée par groupe précise le groupe.
  const groupeAdmin = champGroupe && !parCompte ? `${chaine(champGroupe)}: 'groupe-a', ` : '';
  const conditions = Object.values(route.conditions ?? {}).some((c) => (c?.length ?? 0) > 0);
  const tests: string[] = [];

  const appel = (action: Action, jeton: string) => {
    switch (action) {
      case 'lire':
        return `avec(request(app).get('${adresse}'), ${jeton})`;
      case 'creer':
        return `avec(request(app).post('${adresse}'), ${jeton}).send({ ${groupeAdmin}essai: 1 })`;
      case 'modifier':
        return `avec(request(app).patch(\`${adresse}/\${fiche.id}\`), ${jeton}).send({})`;
      case 'supprimer':
        return `avec(request(app).delete(\`${adresse}/\${fiche.id}\`), ${jeton})`;
    }
  };

  // 1. Un champ que la donnée n'a pas : refusé, rien n'est écrit.
  if (route.droits.creer !== null) {
    tests.push(`    it('créer avec un champ en trop, ou avec « __proto__ » : refusé, rien n\\'est écrit', async () => {
      const avant = (await ${magasin}.lister()).length;
      const enTrop = await avec(request(app).post('${adresse}'), admin.jeton).send({ ${groupeAdmin}champ_inconnu_humalis: 1 });
      expect(enTrop.status).toBe(400);
      expect(String(enTrop.body.erreur)).toContain("n'existe pas");
      const prototype = await avec(request(app).post('${adresse}'), admin.jeton).set('content-type', 'application/json').send('{${champGroupe && !parCompte ? `${chaine(champGroupe)}:"groupe-a",` : ''}"__proto__":{"role":"admin"}}');
      expect(prototype.status).toBe(400);
      expect(String(prototype.body.erreur)).toContain("n'existe pas");
      const herite = await avec(request(app).post('${adresse}'), admin.jeton).send({ ${groupeAdmin}toString: 1 });
      expect(String(herite.body.erreur)).toContain("n'existe pas");
      expect((await ${magasin}.lister()).length).toBe(avant);
    });`);
  }
  if (route.droits.modifier !== null) {
    tests.push(`    it('modifier avec un champ en trop : refusé, la fiche ne change pas', async () => {
      const fiche = ${fiche};
      const reponse = await avec(request(app).patch(\`${adresse}/\${fiche.id}\`), admin.jeton).send({ champ_inconnu_humalis: 1 });
      expect(reponse.status).toBe(400);
      expect(String(reponse.body.erreur)).toContain("n'existe pas");
      expect(await ${magasin}.trouver(fiche.id)).toEqual(fiche);
    });`);
  }

  // 2. Ce que seul le serveur écrit : personne ne le change, pas même un admin.
  const figes = champsFiges(donnee, true);
  if (route.droits.modifier !== null && figes.length > 0) {
    const essais = figes.map((nom) => {
      const champ = donnee.champs.find((c) => camel(c.nom) === nom)!;
      return `      {
        const reponse = await avec(request(app).patch(\`${adresse}/\${fiche.id}\`), admin.jeton).send({ ${chaine(nom)}: ${autreValeur(champ.type)} });
        expect(reponse.status).toBe(400);
        expect(String(reponse.body.erreur)).toContain('donné par le serveur');
      }`;
    });
    tests.push(`    it('ce que seul le serveur écrit ne se modifie pas, même par un admin : ${apostrophe(figes.join(', '))}', async () => {
      const fiche = ${fiche};
${essais.join('\n')}
      expect(await ${magasin}.trouver(fiche.id)).toEqual(fiche);
    });`);
  }

  // 3. Sans session, ou avec un jeton fabriqué : jamais une réponse réussie.
  const fermees = ACTIONS.filter((action) => route.droits[action] !== 'tout_le_monde');
  if (fermees.length > 0) {
    tests.push(`    it('sans session ou avec un faux jeton : ${fermees.join(', ')} refusés', async () => {
      const fiche = ${fiche};
      const avant = (await ${magasin}.lister()).length;
      for (const [nom, jeton] of FAUX_JETONS) {
${fermees.map((action) => `        expect([401, 403], \`${action}, \${nom}\`).toContain((await ${appel(action, 'jeton')}).status);`).join('\n')}
      }
      expect(await ${magasin}.trouver(fiche.id)).toEqual(fiche);
      expect((await ${magasin}.lister()).length).toBe(avant);
    });`);
  }

  // 4. Un compte connecté qui n'a pas le bon rôle. Une règle avec « si » ou « son auteur » ouvre la porte à d'autres : on ne devine pas.
  if (!conditions) {
    const reservees = ACTIONS.filter((action) => route.droits[action] === 'admin' || route.droits[action] === null || route.droits[action]?.startsWith('role:'));
    const essais: string[] = [];
    for (const action of reservees) {
      const permis = route.droits[action]?.startsWith('role:') ? route.droits[action]!.slice(5).split(',') : [];
      const intrus = ['simple', ...roles.filter((r) => !permis.includes(r)).map((r) => `ici[${chaine(r)}]`)];
      for (const compte of intrus) essais.push(`      expect(refuse((await ${appel(action, `${compte}.jeton`)}).status), '${action} par ${apostrophe(compte)}').toBe(true);`);
    }
    if (essais.length > 0) {
      tests.push(`    it('un compte sans le bon rôle : ${reservees.join(', ')} refusés', async () => {
      const fiche = ${fiche};
      const avant = (await ${magasin}.lister()).length;
${essais.join('\n')}
      expect(await ${magasin}.trouver(fiche.id)).toEqual(fiche);
      expect((await ${magasin}.lister()).length).toBe(avant);
    });`);
    }
  }

  // 5. Une donnée séparée : un compte d'un autre groupe (ou un autre compte) ne voit ni ne touche la fiche, et personne ne la déplace.
  if (champGroupe) {
    const intrus = roles.map((r) => `${parCompte ? 'ici' : 'ailleurs'}[${chaine(r)}]`);
    const deplaceurs = ['admin', 'simple', ...roles.map((r) => `ici[${chaine(r)}]`)];
    const versAilleurs = parCompte ? 'admin.id' : "'groupe-b'";
    tests.push(`    it('séparée par ${apostrophe(donnee.par!)} : un autre ${parCompte ? 'compte' : 'groupe'} ne lit, ne modifie ni ne supprime la fiche, et personne ne la déplace', async () => {
      const fiche = ${fiche};
      for (const intrus of [${intrus.join(', ')}]) {
        expect(refuse((await avec(request(app).get(\`${adresse}/\${fiche.id}\`), intrus.jeton)).status)).toBe(true);
        const liste = await avec(request(app).get('${adresse}'), intrus.jeton);
        if (liste.status === 200) expect((liste.body as { id: string }[]).some((f) => f.id === fiche.id)).toBe(false);
        else expect(refuse(liste.status)).toBe(true);
        expect(refuse((await avec(request(app).patch(\`${adresse}/\${fiche.id}\`), intrus.jeton).send({})).status)).toBe(true);
        expect(refuse((await avec(request(app).delete(\`${adresse}/\${fiche.id}\`), intrus.jeton)).status)).toBe(true);
      }
      for (const compte of [${deplaceurs.join(', ')}]) {
        expect(refuse((await avec(request(app).patch(\`${adresse}/\${fiche.id}\`), compte.jeton).send({ ${chaine(champGroupe)}: ${versAilleurs} })).status)).toBe(true);
      }
      expect(await ${magasin}.trouver(fiche.id)).toEqual(fiche);
    });`);
  }

  // 6. Un objet là où un texte est attendu (« {"$ne": null} », la ruse des bases sans schéma).
  const texte = donnee.champs.find((c) => c.type.genre === 'texte' && !c.type.image && !c.regle && camel(c.nom) !== champGroupe);
  if (route.droits.creer !== null && texte) {
    tests.push(`    it('un objet à la place d\\'un texte : refusé, rien n\\'est écrit', async () => {
      const avant = (await ${magasin}.lister()).length;
      for (const valeur of [{ $ne: null }, ['a'], 12, true]) {
        const reponse = await avec(request(app).post('${adresse}'), admin.jeton).send({ ${groupeAdmin}${chaine(camel(texte.nom))}: valeur });
        expect(reponse.status).toBe(400);
      }
      expect((await ${magasin}.lister()).length).toBe(avant);
    });`);
  }

  if (tests.length === 0) return '';
  return `  describe('route « ${route.adresse} »', () => {
${tests.join('\n\n')}
  });`;
}
