/** Deux interactions du navigateur, produites en JavaScript sans React. */

/** `humalis/deplacement.js` : déplacement des enfants directs d'une liste. */
export const DEPLACEMENT_JS = String.raw`// Produit par Humalis : déplacer les lignes d'une liste.
import { effet, nettoyer, executer } from './moteur.js';

/** Rend un nouveau tableau sans modifier celui de la boîte. */
export function deplacerDans(liste, de, vers) {
  if (!Array.isArray(liste) || de < 0 || de >= liste.length || vers < 0 || vers >= liste.length || de === vers) return liste;
  const copie = [...liste];
  const [element] = copie.splice(de, 1);
  copie.splice(vers, 0, element);
  return copie;
}

/** Espace prend ou dépose, les flèches déplacent, Échap annule. Le pointeur dépose à la moitié d'une ligne. */
export function listeDeplacable(conteneur, boite, surOrdre) {
  let pris = null;
  let cible = null;
  let depart = null;
  let pointeur = null;
  const annonce = document.createElement('div');
  annonce.className = 'humalis-annonce-cachee';
  annonce.setAttribute('aria-live', 'polite');
  annonce.setAttribute('aria-atomic', 'true');
  conteneur.insertAdjacentElement('afterend', annonce);
  conteneur.classList.add('humalis-liste-deplacable');

  const lignes = () => Array.from(conteneur.children).filter((e) => e.hasAttribute('data-deplacable'));
  const position = (i) => 'position ' + (i + 1) + ' sur ' + boite.v.length;
  const nommer = (ligne) => (ligne?.textContent ?? '').trim();
  const dire = (texte) => { annonce.textContent = texte; };
  const indexDe = (cibleEvenement) => {
    const ligne = cibleEvenement instanceof Element ? cibleEvenement.closest('[data-deplacable]') : null;
    return ligne?.parentElement === conteneur ? lignes().indexOf(ligne) : -1;
  };
  const synchroniser = () => {
    const toutes = lignes();
    for (let i = 0; i < toutes.length; i++) {
      const ligne = toutes[i];
      ligne.classList.add('humalis-deplacable');
      ligne.classList.toggle('humalis-pris', i === pris);
      ligne.classList.toggle('humalis-insertion-avant', pris !== null && cible === i && cible < pris);
      ligne.classList.toggle('humalis-insertion-apres', pris !== null && cible === i && cible > pris);
      ligne.tabIndex = 0;
      ligne.setAttribute('aria-roledescription', 'élément déplaçable');
      ligne.setAttribute('aria-grabbed', String(i === pris));
    }
  };
  const observation = new MutationObserver(synchroniser);
  observation.observe(conteneur, { childList: true });
  effet(() => { void boite.v; synchroniser(); });
  const focaliser = (i) => queueMicrotask(() => lignes()[i]?.focus());
  const terminer = () => {
    depart = null;
    pris = null;
    cible = null;
    synchroniser();
    if (surOrdre) void executer(surOrdre);
  };

  const clavier = (evenement) => {
    const index = indexDe(evenement.target);
    if (index < 0) return;
    const actuelle = boite.v;
    if (evenement.key === ' ') {
      evenement.preventDefault();
      if (pris === null) {
        depart = actuelle;
        pris = index;
        dire('Pris : ' + nommer(lignes()[index]) + ', ' + position(index) + '. Flèches pour déplacer, Espace pour déposer, Échap pour annuler.');
        synchroniser();
      } else {
        dire('Déposé : ' + nommer(lignes()[index]) + ', ' + position(index) + '.');
        terminer();
      }
    } else if (pris !== null && (evenement.key === 'ArrowUp' || evenement.key === 'ArrowDown')) {
      evenement.preventDefault();
      const vers = index + (evenement.key === 'ArrowUp' ? -1 : 1);
      if (vers < 0 || vers >= actuelle.length) return;
      boite.v = deplacerDans(actuelle, index, vers);
      pris = vers;
      dire('Déplacé en ' + position(vers) + '.');
      synchroniser();
      focaliser(vers);
    } else if (pris !== null && evenement.key === 'Escape') {
      evenement.preventDefault();
      const retour = depart ? depart.indexOf(actuelle[index]) : index;
      if (depart) boite.v = depart;
      depart = null;
      pris = null;
      cible = null;
      dire('Annulé.');
      synchroniser();
      focaliser(retour < 0 ? index : retour);
    }
  };

  const indexSous = (y) => {
    const toutes = lignes();
    for (let i = 0; i < toutes.length; i++) {
      const boiteLigne = toutes[i].getBoundingClientRect();
      if (y < boiteLigne.top + boiteLigne.height / 2) return i;
    }
    return Math.max(toutes.length - 1, 0);
  };
  const retirerPointeur = () => {
    document.removeEventListener('pointermove', bouger);
    document.removeEventListener('pointerup', deposer);
    document.removeEventListener('pointercancel', annulerPointeur);
    pointeur = null;
  };
  const bouger = (evenement) => {
    if (evenement.pointerId !== pointeur) return;
    cible = indexSous(evenement.clientY);
    synchroniser();
  };
  const deposer = (evenement) => {
    if (evenement.pointerId !== pointeur) return;
    const de = pris;
    const vers = indexSous(evenement.clientY);
    retirerPointeur();
    if (de !== null && vers !== de) {
      boite.v = deplacerDans(boite.v, de, vers);
      dire('Déplacé en ' + position(vers) + '.');
      terminer();
    } else {
      pris = null;
      cible = null;
      synchroniser();
    }
  };
  const annulerPointeur = (evenement) => {
    if (evenement.pointerId !== pointeur) return;
    retirerPointeur();
    pris = null;
    cible = null;
    synchroniser();
  };
  const prendre = (evenement) => {
    const index = indexDe(evenement.target);
    if (index < 0 || evenement.button !== 0 || evenement.target.closest('button, a, input, textarea, select')) return;
    pris = index;
    cible = index;
    pointeur = evenement.pointerId;
    lignes()[index].setPointerCapture?.(pointeur);
    document.addEventListener('pointermove', bouger);
    document.addEventListener('pointerup', deposer);
    document.addEventListener('pointercancel', annulerPointeur);
    synchroniser();
  };
  conteneur.addEventListener('keydown', clavier);
  conteneur.addEventListener('pointerdown', prendre);
  nettoyer(() => {
    retirerPointeur();
    observation.disconnect();
    conteneur.removeEventListener('keydown', clavier);
    conteneur.removeEventListener('pointerdown', prendre);
    annonce.remove();
  });
}`;

/** `humalis/fichier.js` : bouton de choix, validation et aperçu. */
export const CHOIX_FICHIER_JS = String.raw`// Produit par Humalis : choisir des fichiers sans bibliothèque.
import { effet, nettoyer, executer } from './moteur.js';

const MOTS = { images: 'image', audio: 'audio', videos: 'video', pdf: 'pdf', documents: 'document' };
const REFUS_DE_TYPE = { images: 'une image', audio: 'un son', videos: 'une vidéo', pdf: 'un PDF', documents: 'un document' };
let prochainId = 0;

/** Les octets de tête priment sur le nom et le type annoncé pour les images et les PDF. */
async function typeLu(fichier) {
  const o = new Uint8Array(await fichier.slice(0, 16).arrayBuffer());
  const texte = (debut, fin) => String.fromCharCode(...o.slice(debut, fin));
  if (o[0] === 0x89 && texte(1, 4) === 'PNG') return 'image/png';
  if (o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) return 'image/jpeg';
  if (texte(0, 3) === 'GIF') return 'image/gif';
  if (texte(0, 4) === 'RIFF' && texte(8, 12) === 'WEBP') return 'image/webp';
  if (texte(4, 8) === 'ftyp' && texte(8, 12) === 'avif') return 'image/avif';
  if (texte(0, 4) === '%PDF') return 'application/pdf';
  if (/^image\//.test(fichier.type) || fichier.type === 'application/pdf') return '';
  return fichier.type;
}

function ecrireTaille(octets) {
  if (octets >= 1024 * 1024) return (octets / (1024 * 1024)).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' Mo';
  if (octets >= 1024) return Math.round(octets / 1024).toLocaleString('fr-FR') + ' Ko';
  return octets + ' octets';
}

/** Dessine le même champ natif que la cible web, puis suit le libellé et la valeur. */
export function choixFichier(cadre, { libelle, boite, familles, maximum, plusieurs, apercu, iconeHtml, classes }) {
  const id = 'humalis-fichier-' + ++prochainId;
  const supplement = Array.isArray(classes) ? classes.filter(Boolean).join(' ') : (classes ?? '');
  cadre.className = ['humalis-fichier', supplement].filter(Boolean).join(' ');
  const entree = document.createElement('input');
  entree.id = id;
  entree.type = 'file';
  entree.className = 'humalis-fichier-entree';
  entree.accept = familles.flatMap((famille) => famille.mime).join(',');
  entree.multiple = Boolean(plusieurs);
  const bouton = document.createElement('label');
  bouton.htmlFor = id;
  bouton.className = iconeHtml ? 'humalis-fichier-bouton humalis-fichier-icone' : 'humalis-fichier-bouton';
  if (iconeHtml) bouton.innerHTML = iconeHtml + '<span class="humalis-fichier-libelle"></span>';
  const liste = document.createElement('ul');
  liste.className = 'humalis-fichier-liste';
  const erreur = document.createElement('p');
  erreur.id = id + '-erreur';
  erreur.className = 'humalis-fichier-erreur';
  erreur.setAttribute('role', 'alert');
  erreur.hidden = true;
  cadre.append(entree, bouton, erreur);
  let apercus = [];
  let version = 0;
  let actif = true;
  const liberer = () => {
    for (const adresse of apercus) URL.revokeObjectURL(adresse);
    apercus = [];
  };
  effet(() => {
    const texte = String(libelle() ?? '');
    if (iconeHtml) {
      bouton.title = texte;
      bouton.querySelector('.humalis-fichier-libelle').textContent = texte;
    } else bouton.textContent = texte;
    const valeur = boite.v;
    const choisis = Array.isArray(valeur) ? valeur : valeur ? [valeur] : [];
    liste.replaceChildren();
    if (choisis.length && !iconeHtml) {
      for (const fichier of choisis) {
        const ligne = document.createElement('li');
        ligne.textContent = fichier.nom;
        liste.append(ligne);
      }
    }
    if (choisis.length && !iconeHtml) cadre.insertBefore(liste, erreur);
    else liste.remove();
  });
  const choisir = async (fichiers) => {
    const tour = ++version;
    liberer();
    const gardes = [];
    const refus = [];
    for (const fichier of fichiers) {
      const sujet = fichiers.length === 1 ? 'Ce fichier' : fichier.name;
      if (maximum !== undefined && fichier.size > maximum) {
        refus.push(sujet + ' est trop gros : ' + ecrireTaille(fichier.size) + ', le maximum est ' + ecrireTaille(maximum) + '.');
        continue;
      }
      const mime = await typeLu(fichier);
      if (!actif || tour !== version) return;
      const famille = familles.find((f) => f.mime.includes(mime));
      if (familles.length > 0 && !famille) {
        refus.push(sujet + " n'est pas " + familles.map((f) => REFUS_DE_TYPE[f.nom]).join(' ni ') + '.');
        continue;
      }
      const adresse = apercu && /^(image|audio|video)\//.test(mime) ? URL.createObjectURL(fichier) : null;
      if (adresse) apercus.push(adresse);
      gardes.push({ nom: fichier.name, taille: fichier.size, type: famille ? MOTS[famille.nom] : mime.startsWith('image/') ? 'image' : 'fichier', apercu: adresse, brut: fichier });
    }
    if (!actif || tour !== version) return;
    erreur.textContent = refus.join(' ');
    erreur.hidden = refus.length === 0;
    if (refus.length) entree.setAttribute('aria-describedby', erreur.id);
    else entree.removeAttribute('aria-describedby');
    boite.v = plusieurs ? gardes : (gardes[0] ?? null);
  };
  entree.addEventListener('change', () => {
    const fichiers = Array.from(entree.files ?? []);
    entree.value = '';
    void executer(() => choisir(fichiers));
  });
  nettoyer(() => {
    actif = false;
    version++;
    liberer();
  });
}`;
