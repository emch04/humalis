/**
 * L'en-tête d'une page, étendu : `page "collection" a l'adresse "/collections/:slug" reservee a
 * connecte sinon vers "connexion" avec parametre …`. Les mots (`adresse`,
 * `reservee`) ne sont des mots-clés qu'ici, juste après le nom de la page.
 */
import { FluxTokens } from './fluxTokens.js';
import { ErreurSyntaxique } from './erreurs.js';
import { normaliser } from '../lexer/motsCles.js';
import { estLeMot } from './parser.js';
import type { Page, FiltrePage } from './ast.js';

const ORDRE = "dans l'en-tête d'une page, l'ordre est : dans \"parent\", puis a l'adresse \"/…\", puis reservee a …, puis avec parametre … et filtre …, puis deux-points";

export function analyserEntetePage(flux: FluxTokens): Pick<Page, 'adresse' | 'reservee' | 'parent'> {
  const entete: Pick<Page, 'adresse' | 'reservee' | 'parent'> = {};
  // « dans "admin" » : la page vit dans la page parente.
  if (flux.verifier('MOT_CLE', 'dans')) {
    flux.avancer();
    entete.parent = flux.attendre('CHAINE', undefined, 'le nom de la page parente entre guillemets (page "commandes" dans "admin" :)').valeur;
  }
  // « a l'adresse "…" » : « a » et « l' » sont des mots de liaison, déjà écartés.
  if (estLeMot(flux.actuel(), 'adresse') && flux.regarder(1).type === 'CHAINE') {
    flux.avancer();
    entete.adresse = flux.avancer().valeur;
  }
  // « reservee a connecte [sinon vers "connexion"] ».
  if (estLeMot(flux.actuel(), 'reservee')) {
    const debut = flux.avancer();
    const qui = flux.actuel();
    const mot = normaliser(qui.original ?? qui.valeur);
    if (mot !== 'connecte' && mot !== 'admin') {
      throw new ErreurSyntaxique(`« reservee » est suivi de « connecte » ou de « admin » (page "admin" reservee a admin) ; « ${qui.original ?? qui.valeur} » a été trouvé`, debut.ligne);
    }
    flux.avancer();
    let sinon: string | undefined;
    if (flux.accepter('MOT_CLE', 'sinon')) {
      flux.attendre('MOT_CLE', 'vers', '« vers » suivi de la page, après « sinon » (sinon vers "connexion")');
      sinon = flux.attendre('CHAINE', undefined, 'le nom de la page entre guillemets').valeur;
    }
    entete.reservee = { qui: mot, ...(sinon !== undefined ? { sinon } : {}), ligne: debut.ligne };
  }
  // Un morceau dans le désordre : on montre l'ordre attendu.
  const suivant = flux.actuel();
  if (flux.verifier('MOT_CLE', 'dans') || estLeMot(suivant, 'adresse') || estLeMot(suivant, 'reservee')) {
    throw new ErreurSyntaxique(`« ${suivant.original ?? suivant.valeur} » n'est pas à sa place : ${ORDRE}`, suivant.ligne);
  }
  return entete;
}

/**
 * « avec parametre id et filtre categorie » : ce que la page lit dans son
 * adresse. Le paramètre est dans le chemin (obligatoire), le filtre dans la
 * requête (?categorie=…, facultatif ; « filtre page nombre » pour un nombre).
 */
export function analyserAvecPage(flux: FluxTokens): { parametres: string[]; filtres: FiltrePage[] } {
  const parametres: string[] = [];
  const filtres: FiltrePage[] = [];
  if (!flux.accepter('MOT_CLE', 'avec')) return { parametres, filtres };
  do {
    if (estLeMot(flux.actuel(), 'filtre')) {
      flux.avancer();
      const { nom, ligne } = flux.attendreNom('le nom du filtre de la page (page "catalogue" avec filtre categorie :)');
      const filtre: FiltrePage = { nom, ligne };
      if (estLeMot(flux.actuel(), 'nombre')) {
        flux.avancer();
        filtre.nombre = true;
      } else if (estLeMot(flux.actuel(), 'texte')) {
        flux.avancer();
      }
      filtres.push(filtre);
      continue;
    }
    if (!estLeMot(flux.actuel(), 'parametre')) {
      flux.attendre('IDENTIFIANT', 'parametre', '« parametre » ou « filtre » suivi de son nom (page "produit" avec parametre id :)');
    }
    flux.avancer();
    parametres.push(flux.attendreNom('le nom du paramètre de la page').nom);
  } while (flux.accepter('MOT_CLE', 'et'));
  return { parametres, filtres };
}
