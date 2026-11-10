/**
 * La machine Humalis, sans rien du disque ni du réseau : elle reçoit le texte du programme, le compile
 * en mémoire, joue son serveur en mémoire et répond aux requêtes HTTP de la page. La commande
 * `humalis lancer` la branche sur un vrai port ; le bac à sable du site la branche sur une page.
 * À chaque nouveau texte : l'application change, les données et les comptes restent, et la page
 * est rechargée (elle garde l'état de ses variables) seulement si ce qu'elle affiche a changé.
 */
import { extraitDeCode } from '../outils/extrait.js';
import { AIDE_REPERES } from '../cibles/commun/reperes.js';
import type { Diagnostic } from '../analyse/erreurs.js';
import type { Lecteur } from '../fichiers.js';
import { compilerPourLaMachine, type Programme, type Ressources } from './noyau.js';
import { SiteVirtuel, crochetPossible, typeDe } from './site.js';
import { CLIENT_MACHINE_JS, CLIENT_SESSION_JS } from './client.js';
import { PANNEAU_HTML } from './panneau.js';
import { ServeurMemoire, type Requete, type Reponse } from './serveur/serveur.js';
import { motDePasseDEssai } from './serveur/comptes.js';

export interface OptionsMachine {
  /** L'adresse où la machine est servie (pour les liens des e-mails captés). */
  adresse: () => string;
  principal?: string;
  lire?: Lecteur;
  ressources?: Ressources;
  /** Le texte d'un autre fichier du projet, pour montrer le code d'une erreur. */
  sourceDe?: (fichier: string) => string | undefined;
  journal?: (message: string) => void;
}

/** Une réponse prête à écrire : le corps est déjà du texte ou des octets. */
export interface ReponseHttp {
  statut: number;
  entetes: Record<string, string | string[]>;
  corps?: string | Uint8Array;
  direct?: Reponse['direct'];
}

export type EvenementMachine = { type: 'recharger' } | { type: 'erreurs'; texte: string } | { type: 'ok' };

export interface ResultatChargement {
  ok: boolean;
  diagnostics: Diagnostic[];
  /** Vrai si la page doit être rechargée (ce qu'elle affiche a changé). */
  recharge: boolean;
  /** Ce que la machine a remarqué et que l'auteur doit savoir (état non gardé, durée…). */
  notes: string[];
}

const TETE = '<script src="/__machine/client.js"></script>\n    <script type="importmap">{"imports":{"@astratra/client":"/__machine/astratra-client.js"}}</script>';

export class Machine {
  programme?: Programme;
  serveur?: ServeurMemoire;
  /** Les erreurs du dernier essai, prêtes à afficher ; vide si tout va bien. */
  erreurs = '';
  private site?: SiteVirtuel;
  private empreinte = '';
  private abonnes = new Set<(evenement: EvenementMachine) => void>();
  private chargement: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: OptionsMachine) {}

  abonner(ecoute: (evenement: EvenementMachine) => void): () => void {
    this.abonnes.add(ecoute);
    return () => this.abonnes.delete(ecoute);
  }
  private emettre(evenement: EvenementMachine): void {
    for (const a of this.abonnes) a(evenement);
  }

  /** Les fichiers lus (autres fichiers Humalis, styles, images) que le rechargement doit surveiller. */
  fichiersLus(): { projet: string[]; ressources: string[] } {
    return { projet: this.programme?.fichiersProjet ?? [], ressources: this.programme?.ressourcesLues ?? [] };
  }

  /** Compile et remplace l'application. Deux chargements ne se chevauchent jamais. */
  charger(source: string): Promise<ResultatChargement> {
    const suite = this.chargement.then(() => this.chargerVraiment(source));
    this.chargement = suite.catch(() => undefined);
    return suite;
  }

  private async chargerVraiment(source: string): Promise<ResultatChargement> {
    const debut = Date.now();
    const resultat = compilerPourLaMachine({ source, principal: this.options.principal, lire: this.options.lire, ressources: this.options.ressources, adresse: this.options.adresse() });
    if (!resultat.ok) {
      this.erreurs = this.formater(resultat.diagnostics, resultat.fichiersProjet, source);
      this.emettre({ type: 'erreurs', texte: this.erreurs });
      return { ok: false, diagnostics: resultat.diagnostics, recharge: false, notes: [] };
    }
    const { programme } = resultat;
    const notes: string[] = [];
    const avant = this.serveur;
    let serveur: ServeurMemoire | undefined;
    if (programme.application.serveurs[0]) {
      serveur = new ServeurMemoire(programme.application.serveurs[0], { adresse: this.options.adresse(), chemins: programme.chemins, journal: this.options.journal });
      if (avant) serveur.reprendre(avant);
      await serveur.demarrer();
    }
    avant?.arreter();
    this.serveur = serveur;
    if (programme.fichiers.size > 0 && !crochetPossible(programme.fichiers)) notes.push("le moteur a changé : l'état des variables n'est pas gardé d'un rechargement à l'autre.");
    const nouvelle = JSON.stringify([...programme.fichiers]);
    const change = nouvelle !== this.empreinte || this.erreurs !== '';
    this.empreinte = nouvelle;
    this.programme = programme;
    this.site = new SiteVirtuel(programme.fichiers, programme.chemins, TETE);
    const avaitDesErreurs = this.erreurs !== '';
    this.erreurs = '';
    this.emettre({ type: 'ok' });
    if (change) this.emettre({ type: 'recharger' });
    notes.push(`compilé en ${Date.now() - debut} ms`);
    return { ok: true, diagnostics: programme.avertissements, recharge: change || avaitDesErreurs, notes };
  }

  /** « Erreur, pages/panier.humalis, ligne 6 : message » puis le code en cause. */
  formater(diagnostics: Diagnostic[], fichiers: string[], sourcePrincipale: string): string {
    return diagnostics.filter((d) => d.gravite === 'erreur').map((d) => {
      const ou = d.fichier === undefined ? '' : `${d.fichier}, `;
      const texte = d.fichier === undefined ? sourcePrincipale : this.options.sourceDe?.(d.fichier);
      const extrait = texte === undefined ? undefined : extraitDeCode(texte, d.ligne, d.message);
      return `Erreur, ${ou}ligne ${d.ligne} : ${d.message}${extrait ? `\n${extrait}` : ''}`;
    }).join('\n\n') || fichiers.join('\n');
  }

  // ─── Les requêtes ─────────────────────────────────────────────────────────

  async traiter(requete: Requete): Promise<ReponseHttp> {
    if (requete.chemin === '/__machine' || requete.chemin.startsWith('/__machine/')) return this.panneau(requete);
    if (this.serveur && (requete.chemin.startsWith('/auth/') || requete.chemin.startsWith('/api/'))) return versHttp(await this.serveur.traiter(requete));
    if (requete.methode !== 'GET' && requete.methode !== 'HEAD') return json(405, { erreur: 'cette page ne répond qu\'aux lectures' });
    if (!this.site) return html(200, pageDErreur(this.erreurs));
    const reponse = this.site.repondre(requete.chemin);
    return { statut: reponse.statut, entetes: { 'content-type': reponse.type, 'cache-control': 'no-store' }, corps: reponse.corps };
  }

  private async panneau(requete: Requete): Promise<ReponseHttp> {
    const { chemin, methode } = requete;
    if (methode === 'GET') {
      if (chemin === '/__machine') return html(200, PANNEAU_HTML);
      if (chemin === '/__machine/client.js') return script(`${CLIENT_MACHINE_JS}\n${AIDE_REPERES}`);
      if (chemin === '/__machine/astratra-client.js') return script(CLIENT_SESSION_JS);
      if (chemin === '/__machine/etat.json') {
        const etat = this.serveur?.etat() ?? { donnees: [], comptes: [], boite: [], limites: [], taches: [], paiements: [] };
        const comptesDEssai = Object.fromEntries((this.serveur?.comptesDEssai ?? []).map((c) => [c.email, c.motDePasse]));
        return json(200, { ...etat, comptesDEssai });
      }
      if (chemin === '/__machine/evenements') {
        return {
          statut: 200,
          entetes: { 'content-type': 'text/event-stream', 'cache-control': 'no-store' },
          direct: (envoyer) => {
            envoyer(': ouvert\n\n');
            if (this.erreurs) envoyer(`data: ${JSON.stringify({ type: 'erreurs', texte: this.erreurs })}\n\n`);
            const fin = this.abonner((e) => envoyer(`data: ${JSON.stringify(e)}\n\n`));
            const battement = setInterval(() => envoyer(': présent\n\n'), 20_000);
            (battement as { unref?: () => void }).unref?.();
            return () => { clearInterval(battement); fin(); };
          },
        };
      }
      return json(404, { erreur: 'introuvable' });
    }
    // Les actions du panneau : un en-tête que seule cette page ajoute, pour qu'un autre site ne puisse pas les lancer.
    if (requete.entetes['x-humalis-machine'] !== '1') return json(403, { erreur: 'action refusée' });
    const corps = (requete.corps && typeof requete.corps === 'object' ? requete.corps : {}) as Record<string, unknown>;
    if (methode === 'POST' && chemin === '/__machine/boite/vider') { this.serveur?.boite.splice(0); return json(200, { ok: true }); }
    if (methode === 'POST' && chemin === '/__machine/comptes') {
      if (!this.serveur) return json(400, { erreur: "ce programme n'a pas de serveur" });
      const email = typeof corps.email === 'string' ? corps.email.trim() : '';
      const role = typeof corps.role === 'string' ? corps.role.trim() : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || role === '') return json(400, { erreur: 'une adresse e-mail et un rôle sont nécessaires' });
      if (this.serveur.comptes.parEmail(email)) return json(400, { erreur: 'cette adresse a déjà un compte' });
      const motDePasse = motDePasseDEssai();
      const champs = typeof corps.groupe === 'string' && corps.groupe !== '' ? Object.fromEntries(this.serveur.champsDeGroupe().map((c) => [c, corps.groupe])) : {};
      await this.serveur.creerCompteDEssai(email, role, motDePasse, champs);
      this.serveur.comptesDEssai.push({ email: email.toLowerCase(), role, motDePasse });
      return json(200, { ok: true, motDePasse });
    }
    if (methode === 'POST' && chemin.startsWith('/__machine/taches/')) return json(200, (await this.serveur?.lancerTache(decodeURIComponent(chemin.slice('/__machine/taches/'.length)))) ?? { ok: false, erreur: "ce programme n'a pas de serveur" });
    if (methode === 'POST' && chemin === '/__machine/paye') return json(200, (await this.serveur?.marquerPaye(String(corps.route ?? ''), String(corps.id ?? ''))) ?? { ok: false, erreur: "ce programme n'a pas de serveur" });
    return json(404, { erreur: 'introuvable' });
  }
}

function versHttp(reponse: Reponse): ReponseHttp {
  return { statut: reponse.statut, entetes: reponse.entetes, ...(reponse.json !== undefined ? { corps: JSON.stringify(reponse.json) } : {}), ...(reponse.direct ? { direct: reponse.direct } : {}) };
}
const json = (statut: number, corps: unknown): ReponseHttp => ({ statut, entetes: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, corps: JSON.stringify(corps) });
const html = (statut: number, corps: string): ReponseHttp => ({ statut, entetes: { 'content-type': typeDe('x.html'), 'cache-control': 'no-store' }, corps });
const script = (corps: string): ReponseHttp => ({ statut: 200, entetes: { 'content-type': typeDe('x.js'), 'cache-control': 'no-store' }, corps });

/** Tant que le programme n'a jamais compilé : une page qui montre les erreurs et se recharge dès qu'elles partent. */
function pageDErreur(erreurs: string): string {
  const echappe = erreurs.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Humalis : erreurs</title><script src="/__machine/client.js"></script></head><body style="font:14px system-ui;margin:0;background:#fafaf9;color:#1c1917"><main style="padding:5rem 1.5rem"><h1>Le programme a des erreurs</h1><p>Corrigez-les et enregistrez : cette page se recharge toute seule.</p><pre style="white-space:pre-wrap">${echappe}</pre></main></body></html>`;
}
