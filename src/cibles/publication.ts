/**
 * Ce que le web et le site statique partagent pour la publication (plan
 * 2026-10-30-qualite-publication, parties 3 à 5) : le titre complété du nom
 * du site, les adresses complètes, robots.txt, le manifeste et les fichiers
 * recopiés (logo, image de partage).
 */
import type { SiteRI } from '../ri/types.js';
import { contenuBinaire } from './binaire.js';
import { dimensionsImage } from '../image/entete.js';

/** « Bienvenue » → « Bienvenue | Rey Store », sauf si le titre contient déjà le nom. */
export function titreComplet(titre: string, site: SiteRI | undefined): string {
  return site?.nom && !titre.includes(site.nom) ? `${titre} | ${site.nom}` : titre;
}

/** Une image du projet ou une adresse externe. */
export const estExterne = (chemin: string) => /^https?:\/\//.test(chemin);

/** Le chemin d'un fichier du projet dans le site produit : « ./partage/a.png » → « partage/a.png ». */
export function cheminPublie(chemin: string): string {
  const morceaux = chemin.replace(/\\/g, '/').split('/').filter((m) => m !== '' && m !== '.');
  // Un fichier hors du dossier du projet (« ../logo.png ») est publié à la racine, sous son nom.
  return morceaux.includes('..') ? morceaux[morceaux.length - 1] : morceaux.join('/');
}

/** L'adresse complète d'une image, pour og:image : les réseaux sociaux n'acceptent pas une adresse relative. */
export function adresseImage(chemin: string, adresse: string | undefined): string | undefined {
  if (estExterne(chemin)) return chemin;
  return adresse ? `${sansBarreFinale(adresse)}/${cheminPublie(chemin)}` : undefined;
}

export const sansBarreFinale = (adresse: string) => adresse.replace(/\/+$/, '');

export function typeImage(chemin: string): string {
  const extension = chemin.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return { svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', ico: 'image/x-icon' }[extension ?? ''] ?? 'image/png';
}

/** robots.txt : ouvert avec le plan du site, ou fermé (« indexation non »). Les pages réservées n'y sont jamais nommées. */
export function robotsTxt(site: SiteRI, adresse: string | undefined): string {
  if (!site.indexation) return 'User-agent: *\nDisallow: /\n';
  return `User-agent: *\nAllow: /\n${adresse ? `Sitemap: ${sansBarreFinale(adresse)}/sitemap.xml\n` : ''}`;
}

/** Le manifeste minimal : le nom et l'icône, sans installation promise. */
export function manifeste(site: SiteRI, images: Map<string, string> | undefined, racine: string): string {
  const logo = site.logo!;
  const octets = images?.get(logo) ? Uint8Array.from(atob(images.get(logo)!), (c) => c.charCodeAt(0)) : undefined;
  const dimensions = octets && dimensionsImage(octets);
  const icone = {
    src: `${racine}${cheminPublie(logo)}`,
    type: typeImage(logo),
    sizes: dimensions ? `${dimensions.largeur}x${dimensions.hauteur}` : 'any',
  };
  return JSON.stringify({ ...(site.nom ? { name: site.nom } : {}), icons: [icone], display: 'browser' }, null, 2) + '\n';
}

/** Le logo et l'image de partage, recopiés dans le site produit (`dossier` : « public/ » pour le web, « » pour le statique). */
export function fichiersDuSite(site: SiteRI, images: Map<string, string> | undefined, dossier: string): Map<string, string> {
  const fichiers = new Map<string, string>();
  for (const chemin of [site.logo, site.image]) {
    if (!chemin || estExterne(chemin)) continue;
    const contenu = images?.get(chemin);
    if (contenu !== undefined) fichiers.set(`${dossier}${cheminPublie(chemin)}`, contenuBinaire(contenu));
  }
  return fichiers;
}

/** Les balises de l'icône, communes à toutes les pages (`racine` : « / » pour le web, « » pour le statique). */
export function balisesIcone(site: SiteRI, racine: string): string[] {
  if (!site.logo) return ['<link rel="icon" href="data:," />'];
  const href = estExterne(site.logo) ? site.logo : `${racine}${cheminPublie(site.logo)}`;
  return [
    `<link rel="icon" type="${typeImage(site.logo)}" href="${echapper(href)}" />`,
    ...(typeImage(site.logo) === 'image/png' ? [`<link rel="apple-touch-icon" href="${echapper(href)}" />`] : []),
    `<link rel="manifest" href="${racine}manifest.webmanifest" />`,
  ];
}

export const echapper = (texte: string) =>
  texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
