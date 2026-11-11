/**
 * Les données sur l'appareil, le code à six chiffres et les clés d'accès sur Windows :
 * ce que le compilateur écrit dans le projet selon le programme. Le C# est dans
 * bibliotheque/donnees-comptes.ts.
 */
import type { Diagnostic } from '../../analyse/erreurs.js';
import type { Application } from '../../ri/types.js';
import { Ecrivain } from '../web/ecrivain.js';
import { CLE_ACCES_CS, COEUR_LOCAL_CS, COMPTE_SECURISE_CS, DONNEE_LOCALE_CS } from './bibliotheque/donnees-comptes.js';
import { gestionnairesArrierePlan } from './formes.js';
import { chaineCs, cleJson, nomCs } from './noms.js';
import { quatreEspaces } from './page.js';

/** La version de Microsoft.Data.Sqlite : elle embarque SQLite pour Windows x64 et ARM64. */
export const VERSION_SQLITE = '10.0.15';

export interface DonneesComptesWindows {
  fichiers: Map<string, string>;
  /** Le projet a besoin de Microsoft.Data.Sqlite. */
  sqlite: boolean;
  /** Vrai si App.cs doit appeler DonneesComptes.Demarrer. */
  actif: boolean;
}

const utilise = (nom: string, code: unknown) => JSON.stringify(code).includes(JSON.stringify(nom));

export function donneesComptesWindows(application: Application, diagnostics: Diagnostic[]): DonneesComptesWindows {
  const fichiers = new Map<string, string>();
  const locales = application.partages.filter((p) => p.locale);
  const texte = JSON.stringify([application.ecrans, application.composants]);
  const securite = application.serveurs.some((s) => s.doubleAuthentification || s.connexionCleAcces) || /"type":"compteSecurise"/.test(texte);
  if (locales.length === 0 && !securite) return { fichiers, sqlite: false, actif: false };

  // Ces corps tournent dans un lancement sans fenêtre, où la base du compte n'est pas ouverte.
  const sansFenetre = [
    ...gestionnairesArrierePlan(application).map((g) => ({ quoi: '« en arriere plan »', code: g, ligne: g.ligne })),
    ...(application.formes?.menusClicDroit ?? []).map((m) => ({ quoi: `le menu « ${m.titre} »`, code: m, ligne: m.ligne })),
    ...(application.formes?.boutonsNotification ?? []).map((b) => ({ quoi: `le bouton « ${b.bouton} » d'une notification`, code: b, ligne: b.ligne })),
  ];
  for (const p of locales) {
    for (const c of sansFenetre) {
      if (utilise(p.nom, c.code)) diagnostics.push({ gravite: 'erreur', ligne: c.ligne, message: `${c.quoi} ne peut pas changer la donnée locale « ${p.nom} » sur Windows : il tourne sans fenêtre, sans la base du compte. Faites ce changement dans une page.` });
    }
  }

  const e = new Ecrivain();
  e.ligne('// Produit par Humalis : ce qui se branche au démarrage.');
  e.ligne('namespace Humalis;');
  e.ligne();
  e.ligne('public static class DonneesComptes');
  e.ligne('{');
  e.indenter(() => {
    e.ligne('public static void Demarrer(FenetrePrincipale fenetre)');
    e.ligne('{');
    e.indenter(() => {
      if (securite) e.ligne('Session.DemanderCode = CompteSecurise.DemanderCode;');
      for (const p of locales) {
        const locale = p.locale!;
        const adresse = locale.synchronisee?.replace(/^\/+/, '');
        const route = adresse !== undefined ? chaineCs(`/api/${adresse}`) : 'null';
        const lue = application.serveurs.flatMap((s) => s.routes).find((r) => r.adresse.replace(/^\/+/, '') === adresse);
        const champs = locale.champs.map((c) => chaineCs(cleJson(c.nom))).join(', ');
        e.ligne(`DonneeLocale.Creer(new ReglagesLocale(${chaineCs(p.nom)}, ${locale.chiffree}, new[] { ${champs} }, ${route}, ${lue?.droits.lire === 'tout_le_monde'}), Partage.${nomCs(p.nom)}, fenetre);`);
      }
    });
    e.ligne('}');
  });
  e.ligne('}');
  fichiers.set('Humalis/DonneesComptes.cs', quatreEspaces(e.texte()));
  if (locales.length > 0) {
    fichiers.set('Humalis/CoeurLocal.cs', COEUR_LOCAL_CS);
    fichiers.set('Humalis/DonneeLocale.cs', DONNEE_LOCALE_CS);
  }
  if (securite) {
    fichiers.set('Humalis/CompteSecurise.cs', COMPTE_SECURISE_CS);
    fichiers.set('Humalis/CleAcces.cs', CLE_ACCES_CS);
  }
  return { fichiers, sqlite: locales.length > 0, actif: true };
}

/** La section du LISEZMOI. */
export function lisezmoiDonneesComptes(identifiant: string, d: DonneesComptesWindows): string {
  if (!d.sqlite) return '';
  return `- \`donnee locale\` : \`%LOCALAPPDATA%\\${identifiant}\\locales\\*.db\`, une base SQLite par compte ; \`avec chiffree\`
  chiffre chaque contenu en AES-256-GCM, avec une clé scellée par Windows (DPAPI).
`;
}
