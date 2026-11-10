/**
 * Les icônes de Humalis en SF Symbols, les dessins du système d'Apple : pas de
 * fichier à embarquer, et ils suivent la couleur du texte et sa taille.
 */
export const SYMBOLES: Record<string, string> = {
  panier: 'cart', sac: 'bag', maison: 'house', recherche: 'magnifyingglass', utilisateur: 'person', utilisateurs: 'person.2',
  menu: 'line.3.horizontal', fermer: 'xmark', plus: 'plus', moins: 'minus', coche: 'checkmark', etoile: 'star', demi_etoile: 'star.leadinghalf.filled',
  coeur: 'heart', calendrier: 'calendar', horloge: 'clock', telephone: 'phone', courrier: 'envelope', lieu: 'mappin.and.ellipse', carte: 'map',
  soleil: 'sun.max', lune: 'moon', fleche_droite: 'arrow.right', fleche_gauche: 'arrow.left', fleche_haut: 'arrow.up', fleche_bas: 'arrow.down',
  chevron_droite: 'chevron.right', chevron_gauche: 'chevron.left', chevron_haut: 'chevron.up', chevron_bas: 'chevron.down', info: 'info.circle',
  alerte: 'exclamationmark.triangle', erreur: 'xmark.circle', succes: 'checkmark.circle', aide: 'questionmark.circle', parametres: 'gearshape',
  sortie: 'rectangle.portrait.and.arrow.right', entree: 'arrow.right.square', cadenas: 'lock', cle: 'key', oeil: 'eye', oeil_barre: 'eye.slash',
  corbeille: 'trash', modifier: 'pencil', copier: 'doc.on.doc', telecharger: 'arrow.down.to.line', envoyer: 'paperplane', partager: 'square.and.arrow.up',
  lien: 'link', image: 'photo', photo: 'camera', video: 'video', musique: 'music.note', livre: 'book', document: 'doc.text', dossier: 'folder',
  filtre: 'line.3.horizontal.decrease', tri: 'arrow.up.arrow.down', liste: 'list.bullet', grille: 'square.grid.2x2', cloche: 'bell', message: 'message',
  discussion: 'bubble.left.and.bubble.right', couverts: 'fork.knife', cafe: 'cup.and.saucer', vin: 'wineglass', poisson: 'fish', feuille: 'leaf',
  flamme: 'flame', goutte: 'drop', vagues: 'water.waves', voiture: 'car', velo: 'bicycle', avion: 'airplane', bateau: 'ferry', train: 'tram',
  carte_bancaire: 'creditcard', argent: 'banknote', cadeau: 'gift', etiquette: 'tag', recompense: 'rosette', trophee: 'trophy', eclair: 'bolt',
  globe: 'globe', wifi: 'wifi', batterie: 'battery.100', mobile: 'iphone', ordinateur: 'desktopcomputer', imprimante: 'printer', micro: 'mic', micro_coupe: 'mic.slash', video_coupee: 'video.slash', partage_ecran: 'rectangle.on.rectangle', partage_ecran_arrete: 'rectangle.on.rectangle.slash', main: 'hand.raised', main_levee: 'hand.raised.fill', decrocher: 'phone.fill', raccrocher: 'phone.down',
  son: 'speaker.wave.2', muet: 'speaker.slash', lecture_media: 'play', pause: 'pause', stop: 'stop', rafraichir: 'arrow.clockwise',
  plus_cercle: 'plus.circle', moins_cercle: 'minus.circle', points: 'ellipsis', points_verticaux: 'ellipsis', epingle: 'pin', drapeau: 'flag',
  signet: 'bookmark', ampoule: 'lightbulb', bouclier: 'shield', graphique: 'chart.bar', courbe: 'chart.xyaxis.line', boutique: 'storefront',
  lien_externe: 'arrow.up.right.square', volet: 'sidebar.left', replier_volet: 'sidebar.left', deplier_volet: 'sidebar.left',
  tableau_de_bord: 'rectangle.3.group', boite: 'shippingbox',
};

/** Le nom du dessin Apple d'une icône ; un nom inconnu du tableau montre un point d'interrogation. */
export const nomIcone = (nom: string): string => SYMBOLES[nom] ?? 'questionmark.square';
