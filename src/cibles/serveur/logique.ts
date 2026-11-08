/**
 * « seul gerant peut faire … » et « tous les jours a 7 h : » : le code produit.
 * Une action tourne dans une transaction : un « refuser » ou une panne annule tout ce
 * qu'elle a écrit. Les e-mails et notifications partent seulement après la validation.
 */
import type { InstructionServeurRI, ServeurRI, TestServeurRI, ValeurServeurRI } from '../../ri/types.js';
import { simplifier } from '../../analyse/elements.js';
import { camel, pascal } from '../web/noms.js';
import { aCompleter } from './regles.js';
import { gardeAction } from './separation.js';

type Route = ServeurRI['routes'][number];
const chaine = (t: string) => JSON.stringify(t);
const fiche = (nom: string) => `f_${camel(nom)}`;

export const avecLogique = (serveur: ServeurRI) => Boolean(serveur.taches?.length) || Boolean(serveur.documents?.length) || serveur.routes.some((r) => r.actions?.length);
const parcourir = (liste: InstructionServeurRI[], voir: (i: InstructionServeurRI) => void): void => {
  for (const i of liste) {
    voir(i);
    if (i.type === 'si') { parcourir(i.alors, voir); parcourir(i.sinon, voir); }
    if (i.type === 'pourChaque') parcourir(i.corps, voir);
  }
};
export function employe(serveur: ServeurRI, voir: (i: InstructionServeurRI) => boolean): boolean {
  let trouve = false;
  const blocs = [...(serveur.taches ?? []).map((t) => t.corps), ...serveur.routes.flatMap((r) => (r.actions ?? []).map((a) => a.corps))];
  for (const bloc of blocs) parcourir(bloc, (i) => { trouve ||= voir(i); });
  return trouve;
}

function valeur(v: ValeurServeurRI): string {
  switch (v.genre) {
    case 'valeur': return JSON.stringify(v.valeur);
    case 'aujourdhui': return 'new Date().toISOString().slice(0, 10)';
    case 'champ': return `${fiche(v.fiche)}[${chaine(v.champ === 'id' ? 'id' : camel(v.champ))}]`;
    case 'utilisateur': return `moi[${chaine(camel(v.champ))}]`;
    case 'texte': return v.parties.map((p) => ('texte' in p ? chaine(p.texte) : `enTexte(${valeur(p.valeur)})`)).join(' + ') || "''";
    case 'calcul': return `(Number(${valeur(v.gauche)}) ${v.operateur} Number(${valeur(v.droite)}))`;
  }
}

function test(t: TestServeurRI): string {
  if (t.genre === 'combinaison') return `(${test(t.gauche)} ${t.operateur === 'et' ? '&&' : '||'} ${test(t.droite)})`;
  const a = valeur(t.gauche);
  const b = t.droite ? valeur(t.droite) : 'undefined';
  const brut: Record<string, string> = {
    egal: `${a} === ${b}`,
    different: `${a} !== ${b}`,
    inferieur: `Number(${a}) < Number(${b})`,
    superieur: `Number(${a}) > Number(${b})`,
    inferieurOuEgal: `Number(${a}) <= Number(${b})`,
    superieurOuEgal: `Number(${a}) >= Number(${b})`,
    vide: `estVide(${a})`,
    vrai: `${a} === true`,
    faux: `${a} === false`,
    rien: `(${a} === undefined || ${a} === null)`,
    contient: `contient(${a}, ${b})`,
    commencePar: `enTexte(${a}).startsWith(enTexte(${b}))`,
    finitPar: `enTexte(${a}).endsWith(enTexte(${b}))`,
    dans: `contient(${b}, ${a})`,
  };
  return t.negation ? `!(${brut[t.operateur]})` : `(${brut[t.operateur]})`;
}

class Ecriture {
  constructor(private readonly serveur: ServeurRI, private readonly groupeImpose?: { champ: string; variable: string }) {}

  private groupeDe(donnee: string, variable: string): string {
    const par = this.serveur.donnees.find((d) => d.nom === donnee)?.par;
    return par ? `, ${variable}[${chaine(camel(par))}]` : '';
  }

  lignes(liste: InstructionServeurRI[], retrait: string): string {
    return liste.map((i) => this.instruction(i, retrait)).join('\n');
  }

  private instruction(i: InstructionServeurRI, r: string): string {
    switch (i.type) {
      case 'si': {
        const sinon = i.sinon.length ? ` else {\n${this.lignes(i.sinon, r + '  ')}\n${r}}` : '';
        return `${r}if (${test(i.test)}) {\n${this.lignes(i.alors, r + '  ')}\n${r}}${sinon}`;
      }
      case 'pourChaque': {
        const par = this.serveur.donnees.find((d) => d.nom === i.donnee)?.par;
        const egal = [...(i.filtre ? [`${chaine(camel(i.filtre.champ))}: ${valeur(i.filtre.valeur) } as string`] : []), ...(par && this.groupeImpose?.champ === par ? [`${chaine(camel(par))}: ${this.groupeImpose.variable}[${chaine(camel(par))}] as string`] : [])];
        return `${r}for (const ${fiche(i.variable)} of await s.${camel(i.donnee)}.lister({ egal: { ${egal.join(', ')} } })) {\n${this.lignes(i.corps, r + '  ')}\n${r}}`;
      }
      case 'changer':
        return `${r}Object.assign(${fiche(i.fiche)}, await s.${camel(i.donnee)}.modifier(${fiche(i.fiche)}.id, { ${chaine(camel(i.champ))}: ${valeur(i.valeur)} }));\n${r}noter(travail, ${chaine(i.donnee)}${this.groupeDe(i.donnee, fiche(i.fiche))});`;
      case 'supprimer':
        return `${r}await s.${camel(i.donnee)}.supprimer(${fiche(i.fiche)}.id);\n${r}noter(travail, ${chaine(i.donnee)}${this.groupeDe(i.donnee, fiche(i.fiche))});`;
      case 'refuser':
        return `${r}throw new Refus(enTexte(${valeur(i.message)}));`;
      case 'creer': {
        const liee = this.serveur.donnees.find((d) => d.nom === i.donnee)!;
        const groupe = liee.par && i.groupeDe ? [`${chaine(camel(liee.par))}: ${fiche(i.groupeDe)}[${chaine(camel(liee.par))}]`] : [];
        const valeurs = `{ ${[...i.valeurs.map((v) => `${chaine(camel(v.champ))}: ${valeur(v.valeur)}`), ...groupe].join(', ')} }`;
        const noterCree = `noter(travail, ${chaine(i.donnee)}${liee.par ? `, (${valeurs} as Record<string, unknown>)[${chaine(camel(liee.par))}]` : ''});`;
        if (!aCompleter(liee)) return `${r}await s.${camel(i.donnee)}.creer(${valeurs});\n${r}${noterCree}`;
        return `${r}{\n${r}  const complete = await completer${pascal(i.donnee)}(${valeurs});\n${r}  if ('erreur' in complete) throw new Refus(complete.erreur);\n${r}  await s.${camel(i.donnee)}.creer(complete.valeur);\n${r}  ${noterCree}\n${r}}`;
      }
      case 'email': {
        const a = i.a.genre === 'admins' ? 'await adressesDesAdmins()' : `enTexte(${valeur(i.a.valeur)})`;
        return `${r}{\n${r}  const envoi = { sujet: ${valeur(i.sujet)}, texte: ${valeur(i.texte)} };\n${r}  travail.apres.push(async () => { await emails.envoyer({ a: ${a}, ...envoi }); });\n${r}}`;
      }
      case 'notification': {
        const appel = i.a.genre === 'roles' ? `notifications.aDesRoles(${JSON.stringify(i.a.roles)}, envoi)` : `notifications.aUnCompte(enTexte(${valeur(i.a.valeur)}), envoi)`;
        return `${r}{\n${r}  const envoi = { titre: ${valeur(i.titre)}, texte: ${valeur(i.texte)} };\n${r}  travail.apres.push(() => ${appel});\n${r}}`;
      }
    }
  }
}

const slug = (nom: string) => simplifier(nom).replace(/_/g, '-');

/** Les routes des actions d'une route : PATCH /faire/<action>/:id, le même chemin qu'une modification côté page. */
export function codeActions(serveur: ServeurRI, route: Route, variable: string): string {
  const donnee = serveur.donnees.find((d) => d.nom === route.donnee)!;
  const nomFiche = fiche(route.donnee);
  const groupe = donnee.par ? { champ: donnee.par, variable: nomFiche } : undefined;
  return (route.actions ?? [])
    .map((action) => `      // « ${action.nom} » : tout ou rien, dans une transaction.
      ${variable}.patch('/faire/${slug(action.nom)}/:id', ${gardeAction(action.qui)}, csrfMiddleware, async (req, res, next) => {
        try {
          const moi = (req as unknown as { user: Record<string, unknown> }).user;
          void moi;
${donnee.par ? `          const portee = porteeDe(moiDe(req), separation${variable}, undefined);
          if (!portee) {
            res.status(403).json({ erreur: REFUS_FICHES });
            return;
          }
` : ''}          const travail = nouveauTravail();
          const resultat = await transaction(async (s) => {
            const ${nomFiche} = await s.${camel(route.donnee)}.trouver(String(req.params.id), true);
            if (!${nomFiche}${donnee.par ? ` || !dansPortee(${nomFiche}, portee)` : ''}) return null;
${new Ecriture(serveur, groupe).lignes(action.corps, '            ')}
            return ${nomFiche};
          });
          if (!resultat) {
            res.status(404).json({ erreur: introuvable('${route.donnee}') });
            return;
          }
          terminer(travail${serveur.routes.some((r) => r.direct) ? ', direct.annonce' : ''});
          res.json(resultat);
        } catch (erreur) {
          if (erreur instanceof Refus) res.status(400).json({ erreur: erreur.message });
          else next(erreur);
        }
      });
`)
    .join('');
}

/** Les documents d'une route : GET /documents/<nom>/:id/bon, avec les droits de la lecture. */
export function codeDocuments(serveur: ServeurRI, route: Route, variable: string, garde: string, separee: boolean, voir: string): string {
  const nomFiche = fiche(route.donnee);
  return (serveur.documents ?? [])
    .filter((d) => d.donnee === route.donnee)
    .map((document) => `      ${variable}.get('/documents/${slug(document.nom)}/:id/bon', lecturePrivee, ${garde}, async (req, res, next) => {
        try {
${voir}          const ${nomFiche} = ${separee ? 'visible' : `await stockages.${camel(route.donnee)}.trouver(String(req.params.id))`};
          if (!${nomFiche}) {
            res.status(404).json({ erreur: introuvable('${route.donnee}') });
            return;
          }
          const fichier = await creerDocument(${chaine(document.nom)}, [${document.lignes.map((l) => `{ genre: '${l.genre}', texte: ${valeur(l.valeur)} }`).join(', ')}]);
          res.set('Content-Type', 'application/pdf');
          res.set('Content-Disposition', 'attachment; filename="${slug(document.nom)}.pdf"');
          res.send(fichier);
        } catch (erreur) {
          next(erreur);
        }
      });
`)
    .join('');
}

/** src/humalis/document.ts */
export const DOCUMENT = String.raw`import PDFDocument from 'pdfkit';
import { enTexte } from './logique.js';

/** Produit par Humalis : un document PDF écrit dans le programme. Les valeurs ne sont jamais interprétées. */
const espaces = (texte: string) => texte.replace(/[  ]/g, ' ');

export function creerDocument(nom: string, lignes: { genre: 'titre' | 'texte'; texte: string }[]): Promise<Buffer> {
  return new Promise((resoudre, rejeter) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: espaces(enTexte(nom)) } });
    const morceaux: Buffer[] = [];
    doc.on('data', (morceau: Buffer) => morceaux.push(morceau));
    doc.on('end', () => resoudre(Buffer.concat(morceaux)));
    doc.on('error', rejeter);
    for (const { genre, texte } of lignes) {
      doc.font(genre === 'titre' ? 'Helvetica-Bold' : 'Helvetica').fontSize(genre === 'titre' ? 20 : 12).text(espaces(texte));
      doc.moveDown(genre === 'titre' ? 1 : 0.5);
    }
    doc.end();
  });
}
`;

/** Les tâches : lancées seulement par demarrer.ts, jamais dans les tests. */
export function codeTaches(serveur: ServeurRI): string {
  if (!serveur.taches?.length) return '';
  const taches = serveur.taches.map((t) => `        {
          nom: ${chaine(t.nom)},
          frequence: ${JSON.stringify(t.frequence)},
          travail: async (travail, s) => {
${new Ecriture(serveur).lignes(t.corps, '            ')}
          },
        },`);
  return `      if (reclamerTache) {
        lancerTaches<typeof stockages>([
${taches.join('\n')}
        ], reclamerTache, transaction${serveur.routes.some((r) => r.direct) ? ', direct.annonce' : ''});
      }
`;
}

/** src/humalis/logique.ts */
export const LOGIQUE = String.raw`import type pg from 'pg';
import type { Stockage } from './stockage.js';

/** Produit par Humalis : ce qui s'exécute sur le serveur, en transaction, et les tâches planifiées. */
export class Refus extends Error {}

export interface Travail {
  ecrites: Map<string, Set<string>>;
  apres: (() => Promise<unknown>)[];
}
export const nouveauTravail = (): Travail => ({ ecrites: new Map(), apres: [] });

export function noter(travail: Travail, donnee: string, groupe?: unknown): void {
  const groupes = travail.ecrites.get(donnee) ?? new Set<string>();
  if (typeof groupe === 'string') groupes.add(groupe);
  travail.ecrites.set(donnee, groupes);
}

/** Une fois tout validé : on annonce, et ce qui part vers l'extérieur ne fait plus rien échouer. */
export function terminer(travail: Travail, annoncer?: (cle: string) => void): void {
  if (annoncer) {
    for (const [donnee, groupes] of travail.ecrites) {
      annoncer(donnee);
      for (const groupe of groupes) annoncer(donnee + '|' + groupe);
    }
  }
  for (const envoi of travail.apres) envoi().catch((erreur: unknown) => console.error('Un envoi du serveur a échoué :', erreur instanceof Error ? erreur.message : erreur));
}

export const enTexte = (valeur: unknown) => (valeur === null || valeur === undefined ? '' : String(valeur));
export const estVide = (valeur: unknown) => valeur === null || valeur === undefined || valeur === '' || (Array.isArray(valeur) && valeur.length === 0);
export const contient = (liste: unknown, valeur: unknown) => (Array.isArray(liste) ? liste.includes(valeur) : typeof liste === 'string' && liste.includes(enTexte(valeur)));

export type Transaction<S> = <T>(corps: (s: S) => Promise<T>) => Promise<T>;

/** Sans base : une transaction à la fois, et une photo des données pour revenir en arrière. */
export function transactionMemoire<S extends Record<string, Stockage>>(stockages: S): Transaction<S> {
  let file: Promise<unknown> = Promise.resolve();
  return <T>(corps: (s: S) => Promise<T>) => {
    const suite = file.then(async () => {
      const retours = Object.values(stockages).map((s) => s.instantane?.());
      try {
        return await corps(stockages);
      } catch (erreur) {
        for (const retour of retours) retour?.();
        throw erreur;
      }
    });
    file = suite.catch(() => undefined);
    return suite;
  };
}

export function transactionPostgres<S>(pool: pg.Pool, fabriquer: (client: pg.PoolClient) => S): Transaction<S> {
  return async <T>(corps: (s: S) => Promise<T>) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const resultat = await corps(fabriquer(client));
      await client.query('COMMIT');
      return resultat;
    } catch (erreur) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw erreur;
    } finally {
      client.release();
    }
  };
}

export type Frequence = { genre: 'heure' } | { genre: 'jour'; heure: number; minute: number } | { genre: 'semaine'; jour: number; heure: number; minute: number };
export type Reclamer = (nom: string, periode: string) => Promise<boolean>;

const deux = (n: number) => String(n).padStart(2, '0');

/** La période en cours, ou null hors de l'heure qui suit le moment prévu : un serveur qui redémarre rattrape, sans excès. */
export function periodeDe(frequence: Frequence, maintenant: Date): string | null {
  const jour = maintenant.getFullYear() + '-' + deux(maintenant.getMonth() + 1) + '-' + deux(maintenant.getDate());
  if (frequence.genre === 'heure') return jour + 'T' + deux(maintenant.getHours());
  if (frequence.genre === 'semaine' && maintenant.getDay() !== frequence.jour) return null;
  const minutes = maintenant.getHours() * 60 + maintenant.getMinutes();
  const prevu = frequence.heure * 60 + frequence.minute;
  return minutes >= prevu && minutes < prevu + 60 ? jour : null;
}

export function reclamerMemoire(): Reclamer {
  const faites = new Map<string, string>();
  return async (nom, periode) => {
    if (faites.get(nom) === periode) return false;
    faites.set(nom, periode);
    return true;
  };
}

/** Plusieurs serveurs : la base donne chaque période à un seul d'entre eux. */
export function reclamerPostgres(pool: pg.Pool): Reclamer {
  let prete: Promise<unknown> | undefined;
  return async (nom, periode) => {
    await (prete ??= pool.query('CREATE TABLE IF NOT EXISTS humalis_taches (nom TEXT PRIMARY KEY, periode TEXT NOT NULL)'));
    const { rowCount } = await pool.query('INSERT INTO humalis_taches (nom, periode) VALUES ($1, $2) ON CONFLICT (nom) DO UPDATE SET periode = EXCLUDED.periode WHERE humalis_taches.periode <> EXCLUDED.periode', [nom, periode]);
    return (rowCount ?? 0) > 0;
  };
}

export interface Tache<S> {
  nom: string;
  frequence: Frequence;
  travail: (travail: Travail, s: S) => Promise<void>;
}

export function lancerTaches<S>(taches: Tache<S>[], reclamer: Reclamer, transaction: Transaction<S>, annoncer?: (cle: string) => void): void {
  const tourner = async () => {
    for (const tache of taches) {
      try {
        const periode = periodeDe(tache.frequence, new Date());
        if (periode === null || !(await reclamer(tache.nom, periode))) continue;
        const travail = nouveauTravail();
        await transaction((s) => tache.travail(travail, s));
        terminer(travail, annoncer);
      } catch (erreur) {
        console.error('La tâche « ' + tache.nom + ' » a échoué :', erreur instanceof Error ? erreur.message : erreur);
      }
    }
  };
  void tourner();
  setInterval(() => void tourner(), 60_000).unref();
}
`;
