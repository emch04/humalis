/**
 * L'analyse des formes d'application spéciales (widget, activité en direct, tuile, commande vocale…).
 * Ce qui s'affiche s'analyse comme une page ; ce qui agit, comme le chargement d'une page. Les valeurs
 * reçues du système (partage.texte, fichier.nom, le {produit} d'une commande vocale) y sont déclarées.
 */
import type { Instruction, Page, Programme } from '../parser/ast.js';
import { analyser } from '../lexer/lexer.js';
import { analyserSyntaxe } from '../parser/parser.js';
import type { Diagnostic } from './erreurs.js';
import { proposerNom } from './suggestions.js';
import { simplifier } from './elements.js';

/** Une déclaration écrite en Humalis (« variable partage = fiche avec texte "" … »), lue par le vrai parser. */
function declaration(ligne: string): Instruction {
  return analyserSyntaxe(analyser(`page "x" :\n    ${ligne}\n`)).pages[0]!.corps[0]!;
}

const PARTAGE = 'variable partage = fiche avec texte "" et lien "" et fichier ""';
const FICHIER = 'variable fichier = fiche avec nom "" et type "" et contenu ""';

/** Une donnée locale envoie ses champs à sa route : ils doivent y exister, avec le même type, et suffire à créer une fiche. */
function verifierChampsSynchronises(programme: Programme, d: NonNullable<Programme['formes']>['donneesLocales'][number], erreur: (message: string, ligne: number) => void): void {
  if (d.synchronisee === undefined) return;
  const adresse = d.synchronisee.replace(/^\//, '');
  for (const serveur of programme.serveurs) {
    const route = serveur.routes.find((r) => r.adresse.replace(/^\//, '') === adresse);
    const donnee = route && serveur.donnees.find((x) => x.nom === route.regles[0]?.donnee);
    if (!donnee) continue;
    const distants = new Map(donnee.champs.map((c) => [simplifier(c.nom), c]));
    for (const champ of d.champs) {
      const distant = distants.get(simplifier(champ.nom));
      if (!distant) erreur(`le champ « ${champ.nom} » de la donnée locale « ${d.nom} » n'existe pas dans la donnée « ${donnee.nom} » du serveur : la synchronisation l'y enverrait pour rien.`, d.ligne);
      else if (JSON.stringify(distant.type) !== JSON.stringify(champ.type)) erreur(`le champ « ${champ.nom} » de la donnée locale « ${d.nom} » n'a pas le même type que dans la donnée « ${donnee.nom} » du serveur.`, d.ligne);
    }
    const locaux = new Set(d.champs.map((c) => simplifier(c.nom)));
    for (const c of donnee.champs) {
      if (!c.regle && !locaux.has(simplifier(c.nom))) erreur(`la donnée locale « ${d.nom} » n'a pas le champ « ${c.nom} » de la donnée « ${donnee.nom} » du serveur : sans lui, le serveur refuserait chaque nouvelle fiche.`, d.ligne);
    }
  }
}

/**
 * Analyse chaque forme : son corps (par `analyserCommePage`), les pages qu'elle ouvre, les listes qu'elle montre,
 * et les activités nommées par « commencer activite ». Rend, pour chaque forme, la page qui la représente.
 */
export function analyserFormes(programme: Programme, analyserCommePage: (page: Page) => void, diagnostics: Diagnostic[]): Map<object, Page> {
  const pages = new Map<object, Page>();
  const formes = programme.formes;
  const erreur = (message: string, ligne: number) => diagnostics.push({ gravite: 'erreur', message, ligne });
  const nomsPages = new Set(programme.pages.map((p) => p.nom));

  const commePage = (forme: object, nom: string, corps: Instruction[], ligne: number, sorte: 'vue' | 'actions', locales: string[] = []) => {
    const avant = locales.map(declaration);
    const page: Page = {
      type: 'Page',
      nom,
      parametres: [],
      corps: sorte === 'vue' ? [...avant, ...corps] : [...avant, { type: 'Evenement', genre: 'chargement', corps, ligne }],
      ligne,
    };
    analyserCommePage(page);
    pages.set(forme, page);
  };
  const pageExiste = (page: string | undefined, ligne: number) => {
    if (page !== undefined && !nomsPages.has(page)) erreur(`la page « ${page} » n'existe pas. Pages : ${[...nomsPages].join(', ') || 'aucune'}.${proposerNom(page, nomsPages)}`, ligne);
  };
  const unique = (liste: { nom: string; ligne: number }[], quoi: string) => {
    const vus = new Map<string, number>();
    for (const x of liste) {
      const deja = vus.get(x.nom);
      if (deja !== undefined) erreur(`${quoi} « ${x.nom} » est déjà écrit ligne ${deja} : donnez-lui un autre nom.`, x.ligne);
      else vus.set(x.nom, x.ligne);
    }
  };
  // Une liste montrée hors d'une page (recherche du système, voiture) : une variable partagée ou une source.
  const listes = new Set([...programme.partages.map((p) => p.nom), ...programme.sources.map((s) => s.nom)]);
  const listeExiste = (liste: string, ligne: number) => {
    if (!listes.has(liste)) erreur(`« ${liste} » n'est ni une variable partagée ni une source : en dehors d'une page, une liste se déclare en haut du fichier (variable ${liste} = [] avec partagee), ou se lit d'une source.${proposerNom(liste, listes)}`, ligne);
  };

  if (formes) {
    unique(formes.widgets, 'le widget');
    unique(formes.activites, 'l’activité');
    unique(formes.tuiles, 'la tuile');
    unique(formes.claviers, 'le clavier');
    for (const w of formes.widgets) {
      commePage(w, `widget « ${w.nom} »`, w.corps, w.ligne, 'vue');
      pageExiste(w.vers, w.ligne);
    }
    for (const a of formes.activites) commePage(a, `activité « ${a.nom} »`, a.corps, a.ligne, 'vue');
    for (const r of formes.raccourcisIcone) pageExiste(r.page, r.ligne);
    if (formes.raccourcisIcone.length > 4) erreur('l’icône montre au plus quatre raccourcis : iPhone et Android n’en affichent pas davantage.', formes.raccourcisIcone[4]!.ligne);
    for (const c of formes.commandesVocales) {
      pageExiste(c.vers, c.ligne);
      commePage(c, `commande vocale « ${c.phrase} »`, c.corps, c.ligne, 'actions', c.parametres.map((p) => `variable ${p} = ""`));
    }
    for (const r of formes.recherches) {
      listeExiste(r.liste, r.ligne);
      pageExiste(r.vers, r.ligne);
    }
    for (const t of formes.tuiles) commePage(t, `tuile « ${t.nom} »`, t.corps, t.ligne, 'actions');
    for (const m of formes.minis) pageExiste(m.page, m.ligne);
    for (const v of formes.voitures) {
      listeExiste(v.liste, v.ligne);
      pageExiste(v.vers, v.ligne);
    }
    for (const m of formes.menusClicDroit) commePage(m, `menu clic droit « ${m.titre} »`, m.corps, m.ligne, 'actions', [FICHIER]);
    if (formes.partageRecu) commePage(formes.partageRecu, 'partage reçu', formes.partageRecu.corps, formes.partageRecu.ligne, 'actions', [PARTAGE]);
    for (const f of formes.fichiersOuverts) commePage(f, `fichier ouvert (${f.extensions.join(', ')})`, f.corps, f.ligne, 'actions', [FICHIER]);
    // « synchronisee avec "notes" » : une route du serveur qui lit et modifie cette donnée.
    const routes = new Set(programme.serveurs.flatMap((s) => s.routes.map((r) => r.adresse.replace(/^\//, ''))));
    for (const d of formes.donneesLocales) {
      if (d.synchronisee !== undefined && !routes.has(d.synchronisee.replace(/^\//, ''))) erreur(`la route « ${d.synchronisee} » n'existe pas dans le serveur : une donnée locale se synchronise avec une route qui la lit et la modifie.${proposerNom(d.synchronisee, routes)}`, d.ligne);
    }
    for (const d of formes.donneesLocales) verifierChampsSynchronises(programme, d, erreur);
    for (const b of formes.boutonsNotification) commePage(b, `bouton « ${b.bouton} » d'une notification`, b.corps, b.ligne, 'actions');
  }

  // « commencer activite "livraison" » nomme une « activite en direct "livraison" : ».
  const activites = new Set(formes?.activites.map((a) => a.nom) ?? []);
  const parcourir = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(parcourir);
    else if (v && typeof v === 'object') {
      const o = v as { type?: string; nom?: string; ligne?: number };
      if ((o.type === 'CommencerActivite' || o.type === 'TerminerActivite' || o.type === 'MiseAJourActivite') && typeof o.nom === 'string' && !activites.has(o.nom)) {
        erreur(`l'activité « ${o.nom} » n'est pas déclarée : écrivez en haut du fichier « activite en direct "${o.nom}" : », avec son titre et son texte dessous.${proposerNom(o.nom, activites)}`, o.ligne ?? 1);
      }
      Object.values(o).forEach(parcourir);
    }
  };
  parcourir([programme.pages, programme.composants, programme.serveurs, formes]);

  // « quand l'utilisateur touche "Accepter" dans une notification » répond à un bouton envoyé par le serveur.
  const boutonsEnvoyes = new Set(JSON.stringify(programme.serveurs).match(/"boutons":\[[^\]]*\]/g)?.flatMap((m) => JSON.parse(m.slice(10)) as string[]) ?? []);
  for (const b of formes?.boutonsNotification ?? []) {
    if (!boutonsEnvoyes.has(b.bouton)) diagnostics.push({ gravite: 'avertissement', message: `aucune notification du serveur n'a de bouton « ${b.bouton} » : ajoutez « et boutons "${b.bouton}" » à un « envoyer notification ».`, ligne: b.ligne });
  }
  return pages;
}
