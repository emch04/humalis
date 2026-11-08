/**
 * « seul gerant peut faire … » et « tous les jours a 7 h : » : le code produit.
 * Une action tourne dans une transaction : un « refuser » ou une panne annule tout ce
 * qu'elle a écrit. Les e-mails et notifications partent seulement après la validation.
 */
import type { FiltreServeurRI, InstructionServeurRI, ServeurRI, TestServeurRI, TypeChamp, ValeurServeurRI } from '../../ri/types.js';
import { simplifier } from '../../analyse/elements.js';
import { camel, pascal } from '../web/noms.js';
import { aCompleter } from './regles.js';
import { gardeAction } from './separation.js';

type Route = ServeurRI['routes'][number];
const chaine = (t: string) => JSON.stringify(t);
const fiche = (nom: string) => `f_${camel(nom)}`;

export const avecPaiements = (serveur: ServeurRI) => serveur.routes.some((r) => r.apresPaiement !== undefined);
export const avecLogique = (serveur: ServeurRI) => serveur.routes.some((r) => r.apresPaiement !== undefined || r.resumes?.length) || Boolean(serveur.taches?.length) || Boolean(serveur.documents?.length) || serveur.routes.some((r) => r.actions?.length);
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
    case 'local': return `l_${camel(v.nom)}`;
    case 'utilisateur': return `moi[${chaine(camel(v.champ))}]`;
    case 'texte': return v.parties.map((p) => ('texte' in p ? chaine(p.texte) : `enTexte(${valeur(p.valeur)})`)).join(' + ') || "''";
    case 'calcul': return `(Number(${valeur(v.gauche)}) ${v.operateur} Number(${valeur(v.droite)}))`;
  }
}

const COMPARAISONS = { superieur: '>', inferieur: '<' } as const;

/** La lecture filtrée : les égalités sont faites par la base, le reste ensuite. L'identifiant n'est pas dans le JSON de la base. */
function lecture(source: string, donnee: string, filtres: FiltreServeurRI[], egalEnPlus: string[]): string {
  const parBase = filtres.filter((f) => f.operateur === 'egal' && f.champ !== 'id');
  const apres = filtres.filter((f) => !parBase.includes(f));
  const egal = [...parBase.map((f) => `${chaine(camel(f.champ))}: ${valeur(f.valeur)}`), ...egalEnPlus];
  const base = `(await ${source}.${camel(donnee)}.lister({ egal: { ${egal.join(', ')} } as Record<string, string | number | boolean> }))`;
  if (apres.length === 0) return base;
  const conditions = apres.map((f) => {
    const a = `ligne[${chaine(f.champ === 'id' ? 'id' : camel(f.champ))}]`;
    const b = valeur(f.valeur);
    return f.operateur === 'egal' ? `${a} === ${b}` : f.operateur === 'different' ? `${a} !== ${b}` : `Number(${a}) ${COMPARAISONS[f.operateur]} Number(${b})`;
  });
  return `${base}.filter((ligne) => ${conditions.join(' && ')})`;
}

const schemaDe = (type: TypeChamp): string => (type.genre === 'texte' && type.image ? "'image'" : type.genre === 'liste' ? `{ liste: ${schemaDe(type.de)} }` : `'${type.genre}'`);

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

/** La ligne qui prépare l'envoi : les textes sont lus tout de suite, l'envoi part après la transaction. */
function destinataires(i: Extract<InstructionServeurRI, { type: 'notification' }>): string {
  if (i.a.genre === 'compte') return `const compte = enTexte(${valeur(i.a.valeur)}); const notifier = (n: typeof envoi) => notifications.aUnCompte(compte, n);`;
  const groupe = i.a.groupe ? `{ champ: ${chaine(camel(i.a.groupe.champ))}, valeur: ${fiche(i.a.groupe.fiche)}[${chaine(camel(i.a.groupe.champ))}] }` : 'undefined';
  return `const groupe = ${groupe}; const notifier = (n: typeof envoi) => notifications.aDesRoles(${JSON.stringify(i.a.roles)}, n, groupe);`;
}

/** Après une création : la fiche créée, puis les notifications ; un échec n'annule pas la création. */
export function codeNotificationsCreation(route: Route): string {
  const nom = fiche(route.donnee);
  return (route.notifications ?? [])
    .map((n) => `          {
            const ${nom} = cree as Record<string, unknown>;
            const envoi = { titre: ${valeur(n.titre)}, texte: ${valeur(n.texte)} };
            ${destinataires(n)}
            void notifier(envoi).catch((erreur: unknown) => console.error('Une notification n\\'est pas partie :', erreur instanceof Error ? erreur.message : erreur));
          }`)
    .join('\n');
}

export const avecNotifications = (serveur: ServeurRI) => Boolean(serveur.activeNotifications) || serveur.routes.some((r) => r.notifications?.length) || employe(serveur, (i) => i.type === 'notification');

/** Les routes des appareils, dans extendRoutes. */
export const ROUTES_APPAREILS = `      const routeAppareils = express.Router();
      routeAppareils.get('/cle', (_req, res) => {
        res.json({ cle: process.env.HUMALIS_VAPID_PUBLIQUE ?? null });
      });
      routeAppareils.post('/', ...acces.connecte, csrfMiddleware, notifications.inscrire);
      app.use('/auth/appareils', routeAppareils);
`;

/** src/humalis/notifications.ts */
export const NOTIFICATIONS = String.raw`import { createPrivateKey, sign } from 'node:crypto';
import { connect } from 'node:http2';
import type { UsersStore } from '@astratra/saas-kit';
import type { RequestHandler } from 'express';
import webpush from 'web-push';
import type { Enregistrement, Stockage } from './stockage.js';

/**
 * Produit par Humalis : les notifications web (VAPID) et Apple (APNs). Les clés viennent de
 * l'environnement ; sans elles, rien ne part et le serveur le dit dans son journal.
 */
export interface Notification {
  titre: string;
  texte: string;
}

/** Une adresse d'abonnement ne peut viser que les services de notification connus : sinon, n'importe qui ferait appeler n'importe quelle adresse au serveur. */
const HOTES_CONNUS = ['fcm.googleapis.com', 'web.push.apple.com', 'push.services.mozilla.com', 'notify.windows.com'];
const permis = (adresse: string) => {
  try {
    const url = new URL(adresse);
    const hotes = [...HOTES_CONNUS, ...(process.env.HUMALIS_PUSH_HOTES ?? '').split(',').filter(Boolean)];
    return url.protocol === 'https:' && hotes.some((h) => url.hostname === h || url.hostname.endsWith('.' + h));
  } catch {
    return false;
  }
};

const JETON = /^[0-9a-fA-F]{32,200}$/;

let jetonApple: { valeur: string; depuis: number } | undefined;
function jetonAPNs(): string | null {
  const { HUMALIS_APNS_CLE: cle, HUMALIS_APNS_CLE_ID: id, HUMALIS_APNS_EQUIPE: equipe } = process.env;
  if (!cle || !id || !equipe) return null;
  const maintenant = Math.floor(Date.now() / 1000);
  // Apple refuse un jeton renouvelé trop souvent : il sert cinquante minutes.
  if (jetonApple && maintenant - jetonApple.depuis < 3000) return jetonApple.valeur;
  const base = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const corps = base({ alg: 'ES256', kid: id }) + '.' + base({ iss: equipe, iat: maintenant });
  const signature = sign('sha256', Buffer.from(corps), { key: createPrivateKey(cle.replace(/\\n/g, '\n')), dsaEncoding: 'ieee-p1363' }).toString('base64url');
  jetonApple = { valeur: corps + '.' + signature, depuis: maintenant };
  return jetonApple.valeur;
}

function envoyerApple(jeton: string, n: Notification): Promise<number> {
  return new Promise((ok, echec) => {
    const autorisation = jetonAPNs();
    const sujet = process.env.HUMALIS_APNS_SUJET;
    if (!autorisation || !sujet) {
      console.warn('Notification Apple non envoyée : HUMALIS_APNS_CLE, HUMALIS_APNS_CLE_ID, HUMALIS_APNS_EQUIPE et HUMALIS_APNS_SUJET ne sont pas réglées.');
      ok(0);
      return;
    }
    const client = connect('https://' + (process.env.HUMALIS_APNS_HOTE ?? 'api.push.apple.com'));
    client.on('error', echec);
    const requete = client.request({ ':method': 'POST', ':path': '/3/device/' + jeton, authorization: 'bearer ' + autorisation, 'apns-topic': sujet, 'apns-push-type': 'alert', 'content-type': 'application/json' });
    let statut = 0;
    requete.on('response', (entetes) => { statut = Number(entetes[':status']); });
    requete.on('error', echec);
    requete.on('end', () => { client.close(); ok(statut); });
    requete.resume();
    requete.end(JSON.stringify({ aps: { alert: { title: n.titre, body: n.texte } } }));
  });
}

export function creerNotifications({ usersStore, appareils }: { usersStore: UsersStore; appareils: Stockage }) {
  const envoyerA = async (appareil: Enregistrement, n: Notification): Promise<void> => {
    try {
      if (appareil.genre === 'apple') {
        const statut = await envoyerApple(String(appareil.cle), n);
        if (statut === 410 || statut === 400) await appareils.supprimer(appareil.id);
        return;
      }
      const { HUMALIS_VAPID_PUBLIQUE: publique, HUMALIS_VAPID_PRIVEE: privee, HUMALIS_VAPID_SUJET: sujet } = process.env;
      if (!publique || !privee || !sujet) {
        console.warn('Notification web non envoyée : HUMALIS_VAPID_PUBLIQUE, HUMALIS_VAPID_PRIVEE et HUMALIS_VAPID_SUJET ne sont pas réglées.');
        return;
      }
      await webpush.sendNotification(appareil.abonnement as webpush.PushSubscription, JSON.stringify(n), { vapidDetails: { subject: sujet, publicKey: publique, privateKey: privee }, TTL: 86400 });
    } catch (erreur) {
      // L'appareil s'est désabonné : on l'oublie.
      const statut = (erreur as { statusCode?: number }).statusCode;
      if (statut === 404 || statut === 410) await appareils.supprimer(appareil.id);
      else console.error('Une notification n\'est pas partie :', erreur instanceof Error ? erreur.message : erreur);
    }
  };

  const aUnCompte = async (compte: string, n: Notification): Promise<void> => {
    await Promise.all((await appareils.lister({ egal: { compte } })).map((a) => envoyerA(a, n)));
  };

  return {
    aUnCompte,
    /** Tous les comptes de ces rôles ; avec un groupe, seulement ceux de ce groupe. */
    async aDesRoles(roles: string[], n: Notification, groupe?: { champ: string; valeur: unknown }): Promise<void> {
      for (const role of roles) {
        const comptes = await usersStore.list({ role, limit: 1000 });
        const vises = groupe ? comptes.filter((c) => (c as Record<string, unknown>)[groupe.champ] === groupe.valeur) : comptes;
        await Promise.all(vises.map((c) => aUnCompte(String(c.id), n)));
      }
    },

    /** POST /auth/appareils : { web: abonnement } ou { apple: jeton }. Un appareil n'appartient qu'à un compte. */
    inscrire: (async (req, res, next) => {
      try {
        const compte = String((req as unknown as { user: { id: unknown } }).user.id);
        const corps = (req.body ?? {}) as { web?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }; apple?: unknown };
        let fiche: Record<string, unknown>;
        if (typeof corps.apple === 'string' && JETON.test(corps.apple)) {
          fiche = { genre: 'apple', cle: corps.apple };
        } else if (corps.web && typeof corps.web.endpoint === 'string' && permis(corps.web.endpoint) && typeof corps.web.keys?.p256dh === 'string' && typeof corps.web.keys?.auth === 'string') {
          fiche = { genre: 'web', cle: corps.web.endpoint, abonnement: { endpoint: corps.web.endpoint, keys: { p256dh: corps.web.keys.p256dh, auth: corps.web.keys.auth } } };
        } else {
          res.status(400).json({ erreur: "cet appareil n'est pas valable" });
          return;
        }
        for (const ancien of await appareils.lister({ egal: { cle: fiche.cle as string } })) await appareils.supprimer(ancien.id);
        await appareils.creer({ ...fiche, compte });
        res.status(201).json({ inscrit: true });
      } catch (erreur) {
        next(erreur);
      }
    }) as RequestHandler,
  };
}
`;

/** public/humalis/notifications.js */
export const TRAVAILLEUR_NOTIFICATIONS = `self.addEventListener('push', (evenement) => {
  const message = evenement.data ? evenement.data.json() : {};
  evenement.waitUntil(self.registration.showNotification(message.titre || '', { body: message.texte || '' }));
});
self.addEventListener('notificationclick', (evenement) => {
  evenement.notification.close();
  evenement.waitUntil(self.clients.openWindow('/'));
});
`;

class Ecriture {
  constructor(private readonly serveur: ServeurRI, private readonly groupeImpose?: { champ: string; variable: string }) {}

  private groupeDe(donnee: string, variable: string): string {
    const par = this.serveur.donnees.find((d) => d.nom === donnee)?.par;
    return par ? `, ${variable}[${chaine(camel(par))}]` : '';
  }

  /** Une action sur une fiche séparée ne parcourt que son groupe. */
  private egalDuGroupe(donnee: string): string[] {
    const par = this.serveur.donnees.find((d) => d.nom === donnee)?.par;
    return par && this.groupeImpose?.champ === par ? [`${chaine(camel(par))}: ${this.groupeImpose.variable}[${chaine(camel(par))}]`] : [] as string[];
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
      case 'pourChaque':
        return `${r}for (const ${fiche(i.variable)} of ${lecture('s', i.donnee, i.filtres, this.egalDuGroupe(i.donnee))}) {\n${this.lignes(i.corps, r + '  ')}\n${r}}`;
      case 'calcul':
        return `${r}const l_${camel(i.nom)} = agreger(${chaine(i.operation)}, ${lecture('s', i.donnee, i.filtres, this.egalDuGroupe(i.donnee))}${i.champ !== undefined ? `, ${chaine(camel(i.champ))}` : ''});`;
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
        return `${r}{\n${r}  const envoi = { titre: ${valeur(i.titre)}, texte: ${valeur(i.texte)} };\n${r}  ${destinataires(i)}\n${r}  travail.apres.push(() => notifier(envoi));\n${r}}`;
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
` : ''}${action.parametres?.length ? `          const entrees = verifierEnvoi({ ${action.parametres.map((p) => `${chaine(camel(p.nom))}: ${schemaDe(p.type)}`).join(', ')} } as const, req.body, true);
          if ('erreur' in entrees) {
            res.status(400).json({ erreur: entrees.erreur });
            return;
          }
${action.parametres.map((p) => `          const l_${camel(p.nom)} = entrees.valeur[${chaine(camel(p.nom))}];`).join('\n')}
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

/** Les résumés d'une route : GET /<nom>, avant « /:id ». */
export function codeResumes(route: Route, variable: string, separee: boolean): string {
  return (route.resumes ?? [])
    .map((resume) => `      ${variable}.get('/${slug(resume.nom)}', lecturePrivee, ${gardeAction(resume.qui)}, async (req, res, next) => {
        try {
${separee ? `          const portee = porteeDe(moiDe(req), separation${variable}, undefined);
          if (!portee) {
            res.status(403).json({ erreur: REFUS_FICHES });
            return;
          }
` : ''}          const lignes = ${lecture('stockages', route.donnee, resume.filtres, separee ? ['...portee.egal'] : [])};
          res.json(resumer(lignes, ${JSON.stringify(resume.calculs.map((c) => ({ nom: camel(c.nom), operation: c.operation, ...(c.champ !== undefined ? { champ: camel(c.champ) } : {}) })))}${resume.regroupePar !== undefined ? `, ${chaine(camel(resume.regroupePar))}` : ''}));
        } catch (erreur) {
          next(erreur);
        }
      });
`)
    .join('');
}

const libelleColonne = (nom: string) => (nom.charAt(0).toUpperCase() + nom.slice(1)).replace(/_/g, ' ');

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
          const fichier = await creerDocument(${chaine(document.nom)}, [${document.lignes.map((l) => {
            if (l.genre !== 'tableau') return `{ genre: '${l.genre}' as const, texte: ${valeur(l.valeur)} }`;
            const par = serveur.donnees.find((d) => d.nom === l.donnee)?.par;
            const groupe = l.groupeDe !== undefined && par !== undefined ? [`${chaine(camel(par))}: ${fiche(l.groupeDe)}[${chaine(camel(par))}]`] : [];
            const cellules = l.colonnes.map((c) => `ligne[${chaine(c === 'id' ? 'id' : camel(c))}]`).join(', ');
            return `{ genre: 'tableau' as const, colonnes: ${JSON.stringify(l.colonnes.map(libelleColonne))}, rangees: ${lecture('stockages', l.donnee, l.filtres, groupe)}.map((ligne) => [${cellules}]) }`;
          }).join(', ')}]);
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

type LigneDocument = { genre: 'titre' | 'texte'; texte: string } | { genre: 'tableau'; colonnes: string[]; rangees: unknown[][] };

const enClair = (valeur: unknown) => (typeof valeur === 'number' ? espaces(valeur.toLocaleString('fr-FR')) : espaces(enTexte(valeur)));

/** Un tableau simple : colonnes égales, une nouvelle page si la rangée ne tient plus. */
function dessinerTableau(doc: PDFKit.PDFDocument, colonnes: string[], rangees: unknown[][]): void {
  const gauche = doc.page.margins.left;
  const largeur = (doc.page.width - gauche - doc.page.margins.right) / Math.max(colonnes.length, 1);
  const dessiner = (cellules: string[], gras: boolean) => {
    doc.font(gras ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
    const hauteur = Math.max(...cellules.map((c) => doc.heightOfString(c, { width: largeur - 8 }))) + 8;
    if (doc.y + hauteur > doc.page.height - doc.page.margins.bottom) doc.addPage();
    const haut = doc.y;
    cellules.forEach((c, i) => doc.text(c, gauche + i * largeur + 4, haut + 4, { width: largeur - 8 }));
    doc.moveTo(gauche, haut + hauteur).lineTo(gauche + largeur * colonnes.length, haut + hauteur).strokeColor('#cccccc').stroke();
    doc.x = gauche;
    doc.y = haut + hauteur;
  };
  dessiner(colonnes, true);
  for (const rangee of rangees) dessiner(rangee.map(enClair), false);
  doc.moveDown(0.5);
}

export function creerDocument(nom: string, lignes: LigneDocument[]): Promise<Buffer> {
  return new Promise((resoudre, rejeter) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: espaces(enTexte(nom)) } });
    const morceaux: Buffer[] = [];
    doc.on('data', (morceau: Buffer) => morceaux.push(morceau));
    doc.on('end', () => resoudre(Buffer.concat(morceaux)));
    doc.on('error', rejeter);
    for (const ligne of lignes) {
      if (ligne.genre === 'tableau') {
        dessinerTableau(doc, ligne.colonnes, ligne.rangees);
        continue;
      }
      doc.font(ligne.genre === 'titre' ? 'Helvetica-Bold' : 'Helvetica').fontSize(ligne.genre === 'titre' ? 20 : 12).text(espaces(ligne.texte));
      doc.moveDown(ligne.genre === 'titre' ? 1 : 0.5);
    }
    doc.end();
  });
}
`;

const CENTS = (champ: string) => `Math.round(Number(fiche[${chaine(camel(champ))}]) * 100)`;

/** POST /payer/<champ>/:id : le montant vient de la fiche, jamais de la page. */
export function codePaiements(route: Route, variable: string, garde: string, voir: string, separee: boolean, donnee: string): string {
  return (route.payables ?? [])
    .map((champ) => `      ${variable}.post('/payer/${slug(champ)}/:id', ${garde}, csrfMiddleware, async (req, res, next) => {
        try {
${voir}          const fiche = ${separee ? 'visible' : `await stockages.${donnee}.trouver(String(req.params.id))`};
          if (!fiche) {
            res.status(404).json({ erreur: introuvable('${route.donnee}') });
            return;
          }
          if (fiche.paye === true) {
            res.status(409).json({ erreur: 'déjà payé' });
            return;
          }
          const resultat = await paiements.creer({ donnee: ${chaine(route.donnee)}, champ: ${chaine(champ)}, id: fiche.id, centimes: ${CENTS(champ)}, retour: (req.body as { retour?: unknown } | undefined)?.retour });
          if ('erreur' in resultat) res.status(resultat.statut).json({ erreur: resultat.erreur });
          else res.json(resultat);
        } catch (erreur) {
          next(erreur);
        }
      });
`)
    .join('');
}

/** Ce que fait un paiement confirmé, donnée par donnée. Le webhook rejoué ne refait rien : « paye » est lu sous verrou. */
export function codeSurPaiement(serveur: ServeurRI): string {
  const lignes = serveur.routes.filter((r) => r.apresPaiement).map((route) => {
    const nom = fiche(route.donnee);
    const donnee = serveur.donnees.find((d) => d.nom === route.donnee)!;
    return `        ${chaine(route.donnee)}: async (travail, s, id, champ, montant) => {
          const ${nom} = await s.${camel(route.donnee)}.trouver(id, true);
          if (!${nom} || ${nom}.paye === true) return;
          if (Math.round(Number(${nom}[champ]) * 100) !== montant) {
            console.error('Paiement ignoré : le montant ne correspond plus à la fiche', id);
            return;
          }
          Object.assign(${nom}, await s.${camel(route.donnee)}.modifier(id, { paye: true }));
          noter(travail, ${chaine(route.donnee)}${donnee.par ? `, ${nom}[${chaine(camel(donnee.par))}]` : ''});
${new Ecriture(serveur, undefined).lignes(route.apresPaiement!, '          ')}
        },`;
  });
  return `      surPaiement = {
${lignes.join('\n')}
      };
`;
}

/** src/humalis/paiements.ts */
export const PAIEMENTS = String.raw`import express, { type RequestHandler } from 'express';
import Stripe from 'stripe';

/**
 * Produit par Humalis : les paiements par Stripe Checkout. La page ne donne jamais de montant, et
 * rien n'est marqué payé sans un webhook dont la signature est vérifiée.
 */
export type SurPaiement<T, S> = Record<string, (travail: T, s: S, id: string, champ: string, montant: number) => Promise<void>>;

const client = () => {
  const cle = process.env.STRIPE_CLE_SECRETE;
  if (!cle) return null;
  const hote = process.env.HUMALIS_STRIPE_HOTE;
  return new Stripe(cle, hote ? { host: hote.split(':')[0], port: Number(hote.split(':')[1]), protocol: 'http' } : {});
};

const adresseDuSite = () => {
  const adresse = (process.env.HUMALIS_ADRESSE_SITE ?? '').trim().replace(/\/+$/, '');
  return /^https:\/\/[^/]|^http:\/\/localhost(:\d+)?$/.test(adresse) ? adresse : null;
};

export function creerPaiements<T, S>({ surConfirme }: { surConfirme: (donnee: string, id: string, champ: string, montant: number) => Promise<void> }) {
  return {
    async creer({ donnee, champ, id, centimes, retour }: { donnee: string; champ: string; id: string; centimes: number; retour: unknown }): Promise<{ url: string } | { erreur: string; statut: number }> {
      const stripe = client();
      const site = adresseDuSite();
      if (!stripe || !site) return { erreur: "les paiements ne sont pas réglés sur ce serveur (STRIPE_CLE_SECRETE, HUMALIS_ADRESSE_SITE)", statut: 503 };
      if (!Number.isInteger(centimes) || centimes <= 0) return { erreur: 'ce montant ne peut pas être payé', statut: 400 };
      // Seulement un chemin de ce site : un lien de retour ne doit jamais mener ailleurs.
      const chemin = typeof retour === 'string' && /^\/(?!\/)/.test(retour) ? retour : '/';
      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [{ quantity: 1, price_data: { currency: process.env.HUMALIS_PAIEMENT_DEVISE ?? 'eur', unit_amount: centimes, product_data: { name: donnee } } }],
        success_url: site + chemin,
        cancel_url: site + chemin,
        metadata: { donnee, id, champ },
      });
      return session.url ? { url: session.url } : { erreur: "le paiement n'a pas pu commencer", statut: 502 };
    },

    /** Stripe rappelle ici. Le corps brut est nécessaire pour vérifier la signature. */
    webhook: [
      express.raw({ type: '*/*', limit: '1mb' }),
      (async (req, res) => {
        const stripe = client();
        const secret = process.env.STRIPE_SECRET_WEBHOOK;
        if (!stripe || !secret) {
          res.status(503).end();
          return;
        }
        let evenement: Stripe.Event;
        try {
          evenement = stripe.webhooks.constructEvent(req.body as Buffer, String(req.headers['stripe-signature']), secret);
        } catch {
          res.status(400).json({ erreur: 'signature invalide' });
          return;
        }
        if (evenement.type === 'checkout.session.completed') {
          const session = evenement.data.object;
          const { donnee, id, champ } = session.metadata ?? {};
          if (session.payment_status === 'paid' && donnee && id && champ && typeof session.amount_total === 'number') {
            try {
              await surConfirme(donnee, id, champ, session.amount_total);
            } catch (erreur) {
              // Une erreur ici : Stripe rappellera, et rien n'a été écrit.
              console.error('Un paiement n\'a pas été enregistré :', erreur instanceof Error ? erreur.message : erreur);
              res.status(500).end();
              return;
            }
          }
        }
        res.json({ recu: true });
      }) as RequestHandler,
    ] as RequestHandler[],
  };
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
/** « somme de … », « nombre de … » : une liste vide donne 0. */
export function agreger(operation: string, lignes: Record<string, unknown>[], champ?: string): number {
  if (operation === 'nombre') return lignes.length;
  const valeurs = lignes.map((l) => Number(l[champ as string])).filter(Number.isFinite);
  if (valeurs.length === 0) return 0;
  if (operation === 'minimum') return Math.min(...valeurs);
  if (operation === 'maximum') return Math.max(...valeurs);
  const somme = valeurs.reduce((a, b) => a + b, 0);
  return operation === 'moyenne' ? somme / valeurs.length : somme;
}

/** Un résumé : une fiche de calculs, ou une par valeur du champ « regroupe par ». */
export function resumer(lignes: Record<string, unknown>[], calculs: { nom: string; operation: string; champ?: string }[], regroupePar?: string): unknown {
  const calculer = (groupe: Record<string, unknown>[]) => Object.fromEntries(calculs.map((c) => [c.nom, agreger(c.operation, groupe, c.champ)]));
  if (regroupePar === undefined) return calculer(lignes);
  const groupes = new Map<unknown, Record<string, unknown>[]>();
  for (const ligne of lignes) groupes.set(ligne[regroupePar], [...(groupes.get(ligne[regroupePar]) ?? []), ligne]);
  return [...groupes].map(([valeur, groupe]) => ({ [regroupePar]: valeur, ...calculer(groupe) }));
}

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
