/**
 * Le CSS de base des éléments d'écran (icône, badge, avatar, progression,
 * chargement, étoiles, compteur, code QR, onglets, dépliants, carrousel,
 * fil d'Ariane), pour le web, le desktop et le site statique. Chacun n'est
 * écrit que si le code produit s'en sert. Le CSS de l'utilisateur, chargé
 * après, le redéfinit.
 */

import { CARTE_CSS } from './carte.js';

const BASE: Record<string, string> = {
  carte: CARTE_CSS,
  icone: `.humalis-icone { width: 1.25em; height: 1.25em; vertical-align: -0.25em; flex: none; }
button .humalis-icone, a .humalis-icone { margin-right: 0.4em; }`,
  badge: `.humalis-badge { display: inline-block; min-width: 1.5em; padding: 0.1em 0.6em; border-radius: 999px; background: var(--humalis-rouge); color: var(--humalis-rouge-encre); font-size: 0.8em; font-weight: 600; line-height: 1.5; text-align: center; }`,
  avatar: `.humalis-avatar { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 2.5em; height: 2.5em; border-radius: 50%; overflow: hidden; background: var(--humalis-bleu); color: var(--humalis-bleu-encre); font-weight: 600; font-size: 1rem; user-select: none; }
.humalis-avatar img { width: 100%; height: 100%; object-fit: cover; max-width: none; }`,
  progression: `.humalis-progression { appearance: none; -webkit-appearance: none; width: 100%; height: 0.75rem; border: none; border-radius: 999px; overflow: hidden; background: rgb(138 138 144 / 0.3); accent-color: var(--humalis-bleu); }
.humalis-progression::-webkit-progress-bar { background: rgb(138 138 144 / 0.3); }
.humalis-progression::-webkit-progress-value { background: var(--humalis-bleu); border-radius: 999px; }
.humalis-progression::-moz-progress-bar { background: var(--humalis-bleu); border-radius: 999px; }
.humalis-progression-ligne { display: flex; align-items: center; gap: 0.75rem; margin: 0.75rem 0; }
.humalis-progression-ligne > span { white-space: nowrap; }`,
  chargement: `.humalis-chargement { display: inline-flex; align-items: center; gap: 0.6em; }
.humalis-chargement-rond { width: 1.25em; height: 1.25em; border: 0.2em solid rgb(138 138 144 / 0.35); border-top-color: var(--humalis-bleu); border-radius: 50%; }
@media (prefers-reduced-motion: no-preference) { .humalis-chargement-rond { animation: humalis-tourne 0.8s linear infinite; } @keyframes humalis-tourne { to { transform: rotate(360deg); } } }`,
  etoiles: `.humalis-etoiles { display: flex; width: fit-content; gap: 0.1em; margin: 0.5rem 0; color: var(--humalis-jaune); }
.humalis-etoile { position: relative; display: inline-flex; padding: 0; margin: 0; border: none; background: none; color: inherit; font-size: inherit; line-height: 1; cursor: default; }
button.humalis-etoile { cursor: pointer; }
.humalis-etoile svg { width: 1.2em; height: 1.2em; fill: none; stroke: currentColor; }
.humalis-etoile-pleine svg { fill: currentColor; }
.humalis-etoile-demi .humalis-etoile-fond { fill: none; }
.humalis-etoile-demi .humalis-etoile-moitie { position: absolute; inset: 0; overflow: hidden; width: 50%; }
.humalis-etoile-demi .humalis-etoile-moitie svg { fill: currentColor; }`,
  compteur: `.humalis-compteur { display: flex; width: fit-content; align-items: center; gap: 0.25rem; margin: 0.5rem 0; }
.humalis-compteur button { margin: 0; min-width: 2.25rem; padding: 0.35rem 0.5rem; }
.humalis-compteur button:disabled { opacity: 0.4; cursor: not-allowed; }
.humalis-compteur output { min-width: 2.5ch; text-align: center; font-variant-numeric: tabular-nums; }`,
  // « ajustement remplir » ou « contenir » : l'image remplit son cadre (rognée) ou y tient entière.
  ajustement: `.humalis-ajustement-remplir { object-fit: cover; width: 100%; }
.humalis-ajustement-contenir { object-fit: contain; width: 100%; }`,
  audio: `.humalis-audio { display: block; width: 100%; max-width: 32rem; margin: 0.75rem 0; }
.humalis-audio audio { display: block; width: 100%; }
.humalis-audio-transcription { margin-top: 0.5rem; }
.humalis-audio-transcription summary { cursor: pointer; }`,
  // Le choix d'un fichier : l'entrée native reste atteignable au clavier, seul son aspect est remplacé par le bouton.
  fichier: `.humalis-fichier { margin: 0.75rem 0; }
.humalis-fichier-entree { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.humalis-fichier-bouton { display: inline-block; padding: 0.55rem 1rem; border: 1px solid currentColor; border-radius: 0.375rem; cursor: pointer; }
.humalis-fichier-entree:focus-visible + .humalis-fichier-bouton { outline: 2px solid var(--humalis-bleu); outline-offset: 2px; }
.humalis-fichier-liste { margin: 0.5rem 0 0; padding-left: 1.25rem; }
.humalis-fichier-erreur { margin: 0.5rem 0 0; color: var(--humalis-rouge); }
.humalis-fichier-erreur[hidden] { display: none; }`,
  qr: `.humalis-qr { display: inline-block; padding: 0.75rem; background: #ffffff; border-radius: 0.5rem; line-height: 0; }
.humalis-qr svg { display: block; }`,
  onglets: `.humalis-onglets { margin: 1rem 0; }
.humalis-onglets-barre { display: flex; gap: 0.25rem; overflow-x: auto; border-bottom: 1px solid rgb(138 138 144 / 0.5); }
.humalis-onglet { margin: 0; border: none; border-bottom: 3px solid transparent; border-radius: 0.375rem 0.375rem 0 0; padding: 0.6rem 1rem; white-space: nowrap; }
.humalis-onglet[aria-selected="true"] { border-bottom-color: var(--humalis-bleu); font-weight: 600; }
.humalis-onglets-panneau { padding: 1rem 0; }
.humalis-onglets-panneau[hidden] { display: none; }`,
  deroulant: `.humalis-deroulant { border-bottom: 1px solid rgb(138 138 144 / 0.5); }
.humalis-deroulant-titre { display: flex; align-items: center; justify-content: space-between; width: 100%; margin: 0; border: none; border-radius: 0; padding: 0.9rem 0.25rem; text-align: left; font-weight: 600; }
.humalis-deroulant-titre::after { content: ""; flex: none; width: 0.5em; height: 0.5em; margin-left: 1em; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(45deg); }
.humalis-deroulant-titre[aria-expanded="true"]::after { transform: rotate(-135deg); }
@media (prefers-reduced-motion: no-preference) { .humalis-deroulant-titre::after { transition: transform 0.15s; } }
.humalis-deroulant-zone { padding: 0 0.25rem 1rem; }
.humalis-deroulant-zone[hidden] { display: none; }`,
  carrousel: `.humalis-carrousel { position: relative; margin: 1rem 0; }
.humalis-carrousel-piste { display: flex; gap: 1rem; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; }
@media (prefers-reduced-motion: no-preference) { .humalis-carrousel-piste { scroll-behavior: smooth; } }
.humalis-carrousel-piste::-webkit-scrollbar { display: none; }
.humalis-carrousel-piste > * { flex: 0 0 calc((100% - (var(--humalis-visibles, 1) - 1) * 1rem) / var(--humalis-visibles, 1)); scroll-snap-align: start; margin: 0; min-width: 0; box-sizing: border-box; }
@media (max-width: 639px) { .humalis-carrousel-piste > * { flex-basis: 100%; } }
.humalis-carrousel-piste img { width: 100%; }
.humalis-carrousel-commandes { display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-top: 0.75rem; }
.humalis-carrousel-commandes button { margin: 0; padding: 0.25rem 0.6rem; }
.humalis-carrousel-points { display: flex; gap: 0.4rem; }
.humalis-carrousel-point { width: 0.7rem; height: 0.7rem; min-width: 0; padding: 0; margin: 0; border-radius: 50%; border: 1px solid currentColor; background: transparent; }
.humalis-carrousel-point[aria-current="true"] { background: currentColor; }`,
  fil: `.humalis-fil ol { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin: 0.75rem 0; padding: 0; list-style: none; }
.humalis-fil li { display: flex; align-items: center; }
.humalis-fil li + li::before { content: "/"; margin-right: 0.5rem; opacity: 0.6; }
.humalis-fil li > * { margin: 0; }
.humalis-page .humalis-fil a { display: inline; margin: 0; }`,
};

/** Le CSS de base des éléments d'écran dont le code produit se sert. */
export function cssElements(codes: string[]): string {
  const regles = Object.entries(BASE)
    .filter(([nom]) => codes.some((c) => new RegExp(`humalis-${nom}\\b`).test(c)))
    .map(([, css]) => css);
  return regles.length === 0 ? '' : `\n/* Les éléments d'écran utilisés par cette application. */\n${regles.join('\n')}\n`;
}
