/**
 * Un projet à plusieurs services (décidé avec le mainteneur le 17 novembre 2026) : plusieurs blocs « serveur », dans un
 * fichier ou dans plusieurs. Un seul serveur : rien de ce qui suit ne s'applique, et rien ne change.
 *
 * - chaque service a un nom à lui ; chaque route et chaque donnée appartiennent à un seul service (le relais
 *   « entree » envoie /api/<route> au service qui l'a, et les pages lisent les données sans dire de quel service) ;
 * - un seul service garde les comptes ; les autres écrivent « comptes du serveur "…" » et reconnaissent ses jetons ;
 * - ce qui touche aux comptes (connexion, inscription, rôles, double authentification, temps réel…) s'écrit dans le
 *   service des comptes ;
 * - « le serveur "x" peut … » nomme un autre service du projet, et une action ou une donnée de la route.
 */
import type { InstructionServeur, Serveur } from '../parser/ast.js';
import type { Diagnostic } from './erreurs.js';
import { simplifier } from './elements.js';
import { proposerNom } from './suggestions.js';

const adresse = (a: string) => a.replace(/^\/+|\/+$/g, '');

/** Le projet est « en services » dès qu'un serveur écrit « comptes du serveur "…" ». */
export const enServices = (serveurs: Serveur[]): boolean => serveurs.length > 1 && serveurs.some((s) => s.comptesDu !== undefined);

/** Le service qui garde les comptes : le seul sans « comptes du serveur ». */
export const serviceDesComptes = (serveurs: Serveur[]): Serveur | undefined => (serveurs.length < 2 ? serveurs[0] : serveurs.filter((s) => !s.comptesDu).length === 1 ? serveurs.find((s) => !s.comptesDu) : undefined);

export function analyserServices(serveurs: Serveur[], diagnostics: Diagnostic[]): void {
  const erreur = (message: string, ligne: number) => diagnostics.push({ gravite: 'erreur', message, ligne });
  const avertissement = (message: string, ligne: number) => diagnostics.push({ gravite: 'avertissement', message, ligne });

  if (serveurs.length < 2) {
    for (const s of serveurs) {
      if (s.comptesDu) erreur(`« comptes du serveur "${s.comptesDu.serveur}" » : le projet n'a qu'un serveur, qui garde lui-même ses comptes. Retirez cette ligne.`, s.comptesDu.ligne);
      for (const r of s.receveurs ?? []) erreur(`« quand le serveur "${r.serveur}" signale … » : le projet n'a qu'un serveur.`, r.ligne);
      for (const route of s.routes) for (const d of route.droitsServices ?? []) erreur(`« le serveur "${d.serveur}" peut … » : le projet n'a qu'un serveur.`, d.ligne);
    }
    return;
  }

  // Un fichier d'avant les services, avec deux blocs « serveur » sans « comptes du serveur » : il compile ses pages
  // comme avant, avec un avertissement ; la cible serveur refuse de le produire.
  if (!enServices(serveurs)) {
    const premier = serveurs[0]!;
    for (const s of serveurs.slice(1)) {
      avertissement(`les serveurs « ${premier.nom} » (ligne ${premier.ligne}) et « ${s.nom} » gardent chacun leurs comptes : un seul service garde les comptes. Écrivez dans « ${s.nom} » : comptes du serveur "${premier.nom}"`, s.ligne);
    }
    return;
  }

  // Un nom par service : il nomme son dossier, ses variables d'environnement et ses messages.
  const noms = new Map<string, Serveur>();
  for (const s of serveurs) {
    const cle = simplifier(s.nom);
    const deja = noms.get(cle);
    if (deja) erreur(`le serveur « ${s.nom} » est déjà déclaré (ligne ${deja.ligne}) : chaque service a son nom.`, s.ligne);
    else noms.set(cle, s);
  }

  // Une route et une donnée appartiennent à un seul service.
  const routes = new Map<string, Serveur>();
  const donnees = new Map<string, Serveur>();
  for (const s of serveurs) {
    for (const route of s.routes) {
      if (route.interne) continue;
      const deja = routes.get(adresse(route.adresse));
      if (deja && deja !== s) erreur(`la route « ${route.adresse} » est déjà celle du serveur « ${deja.nom} » : une adresse appartient à un seul service. Donnez-lui un autre nom, par exemple « ${adresse(route.adresse)}-${simplifier(s.nom).replace(/_/g, '-')} ».`, route.ligne);
      else routes.set(adresse(route.adresse), s);
    }
    for (const d of s.donnees) {
      if (d.comptes) continue;
      const deja = donnees.get(d.nom);
      if (deja && deja !== s) erreur(`la donnée « ${d.nom} » est déjà celle du serveur « ${deja.nom} » : une donnée appartient à un seul service. Lisez-la depuis l'autre service (envoyer requete vers "…" du serveur "${deja.nom}" …), ou donnez-lui un autre nom.`, d.ligne);
      else donnees.set(d.nom, s);
    }
  }

  // Les comptes : un seul service les garde.
  const gardiens = serveurs.filter((s) => !s.comptesDu);
  if (gardiens.length === 0) erreur(`chaque serveur écrit « comptes du serveur … » : l'un d'eux doit garder les comptes. Retirez cette ligne du serveur qui les garde.`, serveurs[0]!.ligne);
  if (gardiens.length > 1) {
    for (const s of gardiens.slice(1)) {
      erreur(`les serveurs « ${gardiens[0]!.nom} » et « ${s.nom} » gardent chacun leurs comptes : un seul service garde les comptes. Écrivez dans « ${s.nom} » : comptes du serveur "${gardiens[0]!.nom}"`, s.ligne);
    }
  }
  const gardien = gardiens.length === 1 ? gardiens[0] : undefined;
  // Sans service des comptes, le reste n'a pas de sens : le premier message suffit.
  for (const s of gardiens.length === 0 ? [] : serveurs) {
    if (!s.comptesDu) continue;
    const vise = serveurs.find((x) => x.nom === s.comptesDu!.serveur);
    if (!vise) erreur(`le serveur « ${s.comptesDu.serveur} » n'existe pas dans le projet. Serveurs : ${serveurs.filter((x) => x !== s).map((x) => x.nom).join(', ')}.${proposerNom(s.comptesDu.serveur, serveurs.map((x) => x.nom))}`, s.comptesDu.ligne);
    else if (vise === s) erreur(`un serveur ne prend pas ses comptes chez lui-même : nommez le service qui garde les comptes.`, s.comptesDu.ligne);
    else if (vise.comptesDu) erreur(`le serveur « ${vise.nom} » ne garde pas de comptes : il les prend chez « ${vise.comptesDu.serveur} ». Écrivez : comptes du serveur "${vise.comptesDu.serveur}"`, s.comptesDu.ligne);
    else if (gardien && vise !== gardien) erreur(`les comptes sont gardés par « ${gardien.nom} » : comptes du serveur "${gardien.nom}"`, s.comptesDu.ligne);

    // Ce qui touche aux comptes s'écrit dans le service qui les garde.
    const ici = (quoi: string, ligne: number | undefined) => {
      if (ligne !== undefined) erreur(`« ${quoi} » s'écrit dans le serveur qui garde les comptes${gardien ? ` (« ${gardien.nom} »)` : ''} : « ${s.nom} » prend les siens chez lui.`, ligne);
    };
    ici('connexion google', s.connexionGoogle);
    ici('connexion apple', s.connexionApple);
    ici("connexion par cle d'acces", s.connexionCleAcces);
    ici('double authentification', s.doubleAuthentification);
    ici('invitations', s.invitations?.ligne);
    ici('mot de passe oublie', s.motDePasseOublie?.ligne);
    ici('inscription libre', s.inscriptionLibre?.ligne);
    ici('compte :', s.champsCompte?.[0]?.ligne);
    if (s.roles?.length) ici('roles', s.ligne);
    for (const d of s.discussions ?? []) ici('discussion', d.ligne);
    for (const d of s.salles ?? []) ici('salle', d.ligne);
    for (const route of s.routes) {
      for (const regle of route.regles) {
        if (regle.donnee === 'comptes') ici('… comptes', regle.ligne);
        if (regle.soi) ici('… son compte', regle.ligne);
      }
    }
    // Les e-mails aux admins et les notifications lisent les comptes : ils partent du service qui les garde.
    const parcourir = (liste: InstructionServeur[]): void => {
      for (const i of liste) {
        if (i.type === 'EmailServeur' && i.envoi.destinataire.genre === 'admins') ici('envoyer email aux admins', i.ligne);
        if (i.type === 'NotificationServeur' || i.type === 'MiseAJourActivite') ici('envoyer notification', i.ligne);
        if (i.type === 'SiServeur') {
          parcourir(i.alors);
          parcourir(i.sinon);
        }
        if (i.type === 'PourChaqueServeur') parcourir(i.corps);
      }
    };
    for (const route of s.routes) {
      for (const action of route.actions ?? []) parcourir(action.corps);
      if (route.apresPaiement) parcourir(route.apresPaiement.corps);
      for (const n of route.apresCreation?.notifications ?? []) ici('envoyer notification', n.ligne);
      if (route.apresCreation?.envois.some((e) => e.destinataire.genre === 'admins')) ici('envoyer email aux admins', route.apresCreation.ligne);
    }
    for (const t of s.taches ?? []) parcourir(t.corps);
    for (const r of s.receveurs ?? []) parcourir(r.corps);
  }

  // « le serveur "x" peut … » : un autre service, et une action ou une donnée de cette route.
  for (const s of serveurs) {
    for (const route of s.routes) {
      for (const d of route.droitsServices ?? []) {
        const autre = serveurs.find((x) => x.nom === d.serveur);
        if (!autre) erreur(`le serveur « ${d.serveur} » n'existe pas dans le projet. Serveurs : ${serveurs.filter((x) => x !== s).map((x) => x.nom).join(', ')}.${proposerNom(d.serveur, serveurs.map((x) => x.nom))}`, d.ligne);
        else if (autre === s) erreur(`un serveur a déjà tous les droits sur ses propres données : « le serveur … peut » nomme un autre service.`, d.ligne);
        const donnee = route.regles[0]?.donnee ?? route.actions?.[0]?.donnee;
        if (donnee !== undefined && d.donnee !== donnee) erreur(`la route « ${route.adresse} » sert « ${donnee} », pas « ${d.donnee} ».`, d.ligne);
        if (d.faire !== undefined && !(route.actions ?? []).some((a) => a.nom === d.faire)) {
          const actions = (route.actions ?? []).map((a) => a.nom);
          erreur(`la route « ${route.adresse} » n'a pas d'action « ${d.faire} ». Actions : ${actions.join(', ') || 'aucune'}.${proposerNom(d.faire, actions)}`, d.ligne);
        }
      }
    }
  }

  // Un message que personne n'écoute ne part nulle part : autant le savoir.
  for (const s of serveurs) {
    const signales = new Map<string, number>();
    const parcourir = (liste: InstructionServeur[]): void => {
      for (const i of liste) {
        if (i.type === 'Signaler' && !signales.has(i.message)) signales.set(i.message, i.ligne);
        if (i.type === 'SiServeur') {
          parcourir(i.alors);
          parcourir(i.sinon);
        }
        if (i.type === 'PourChaqueServeur') parcourir(i.corps);
      }
    };
    for (const route of s.routes) {
      for (const action of route.actions ?? []) parcourir(action.corps);
      if (route.apresPaiement) parcourir(route.apresPaiement.corps);
    }
    for (const t of s.taches ?? []) parcourir(t.corps);
    for (const r of s.receveurs ?? []) parcourir(r.corps);
    for (const [message, ligne] of signales) {
      if (!serveurs.some((x) => (x.receveurs ?? []).some((r) => r.serveur === s.nom && r.message === message))) {
        avertissement(`personne n'écoute « ${message} » : écrivez dans un autre service « quand le serveur "${s.nom}" signale "${message}" avec … : ».`, ligne);
      }
    }
  }
}
