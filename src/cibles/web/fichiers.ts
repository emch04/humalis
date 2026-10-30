/**
 * Le choix et l'envoi d'un fichier dans le code web produit. Les deux fichiers
 * ci-dessous sont recopiés dans `src/humalis/` seulement si une page s'en
 * sert. Aucune bibliothèque : un `<input type="file">` natif et
 * `XMLHttpRequest`, le seul moyen natif de suivre la progression d'un
 * envoi (`fetch` ne l'offre pas).
 *
 * Ni l'un ni l'autre ne « sécurise » quoi que ce soit : le type et la taille
 * vérifiés ici sont un confort, le serveur revérifie toujours.
 */

/** `choix-fichier.tsx` : le bouton, l'aperçu, le refus de confort. */
export const CHOIX_FICHIER_TSX = `import { useEffect, useId, useRef, useState } from 'react';

/** Un fichier choisi : ce que la page peut lire (nom, taille, type, aperçu) et le fichier lui-même. */
export interface FichierChoisi {
  nom: string;
  /** En octets. */
  taille: number;
  /** Un mot : image, audio, video, pdf, document ou fichier. */
  type: string;
  /** Une adresse locale pour l'afficher (images, sons, vidéos), sinon null. */
  apercu: string | null;
  brut: File;
}

interface Famille {
  nom: string;
  mime: string[];
}

interface Proprietes {
  libelle: string;
  /** La page voit un fichier choisi comme une fiche de quatre champs (nom, taille, type, apercu) : \`brut\` est réservé à ce composant et à televerser. */
  valeur: any;
  onChange: (valeur: any) => void;
  familles: Famille[];
  /** En octets. */
  maximum?: number;
  plusieurs?: boolean;
  apercu: boolean;
  className?: string;
}

const MOTS: Record<string, string> = { images: 'image', audio: 'audio', videos: 'video', pdf: 'pdf', documents: 'document' };

/** Les octets de tête d'un fichier : ce qu'il est vraiment, pas ce que son nom annonce. */
async function typeLu(fichier: File): Promise<string> {
  const o = new Uint8Array(await fichier.slice(0, 16).arrayBuffer());
  const texte = (debut: number, fin: number) => String.fromCharCode(...o.slice(debut, fin));
  if (o[0] === 0x89 && texte(1, 4) === 'PNG') return 'image/png';
  if (o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) return 'image/jpeg';
  if (texte(0, 3) === 'GIF') return 'image/gif';
  if (texte(0, 4) === 'RIFF' && texte(8, 12) === 'WEBP') return 'image/webp';
  if (texte(4, 8) === 'ftyp' && texte(8, 12) === 'avif') return 'image/avif';
  if (texte(0, 4) === '%PDF') return 'application/pdf';
  // Une image ou un PDF dont les octets ne le confirment pas n'en est pas un, quoi qu'en dise son nom.
  if (/^image\\//.test(fichier.type) || fichier.type === 'application/pdf') return '';
  return fichier.type;
}

/** 8,2 Mo, 340 Ko : la taille comme on la lit. */
function ecrireTaille(octets: number): string {
  if (octets >= 1024 * 1024) return (octets / (1024 * 1024)).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' Mo';
  if (octets >= 1024) return Math.round(octets / 1024).toLocaleString('fr-FR') + ' Ko';
  return octets + ' octets';
}

const REFUS_DE_TYPE: Record<string, string> = {
  images: 'une image',
  audio: 'un son',
  videos: 'une vidéo',
  pdf: 'un PDF',
  documents: 'un document',
};

/** Le choix d'un fichier : un bouton natif, un aperçu, et un message si le fichier ne convient pas. */
export default function ChoixFichier({ libelle, valeur, onChange, familles, maximum, plusieurs, apercu, className }: Proprietes) {
  const id = useId();
  const [erreur, setErreur] = useState('');
  const apercus = useRef<string[]>([]);

  const liberer = () => {
    for (const adresse of apercus.current) URL.revokeObjectURL(adresse);
    apercus.current = [];
  };
  // Les adresses d'aperçu sont rendues au navigateur quand la page se démonte.
  useEffect(() => liberer, []);

  async function choisir(fichiers: File[]) {
    liberer();
    const gardes: FichierChoisi[] = [];
    const refus: string[] = [];
    for (const fichier of fichiers) {
      const sujet = fichiers.length === 1 ? 'Ce fichier' : fichier.name;
      if (maximum !== undefined && fichier.size > maximum) {
        refus.push(\`\${sujet} est trop gros : \${ecrireTaille(fichier.size)}, le maximum est \${ecrireTaille(maximum)}.\`);
        continue;
      }
      const mime = await typeLu(fichier);
      const famille = familles.find((f) => f.mime.includes(mime));
      if (familles.length > 0 && !famille) {
        refus.push(\`\${sujet} n'est pas \${familles.map((f) => REFUS_DE_TYPE[f.nom]).join(' ni ')}.\`);
        continue;
      }
      const adresse = apercu && /^(image|audio|video)\\//.test(mime) ? URL.createObjectURL(fichier) : null;
      if (adresse) apercus.current.push(adresse);
      gardes.push({ nom: fichier.name, taille: fichier.size, type: famille ? MOTS[famille.nom] : mime.startsWith('image/') ? 'image' : 'fichier', apercu: adresse, brut: fichier });
    }
    // Un fichier refusé n'est pas gardé : la variable reste vide.
    setErreur(refus.join(' '));
    onChange(plusieurs ? gardes : (gardes[0] ?? null));
  }

  const choisis: FichierChoisi[] = Array.isArray(valeur) ? valeur : valeur ? [valeur] : [];
  return (
    <div className={className}>
      <input
        id={id}
        type="file"
        className="humalis-fichier-entree"
        accept={familles.flatMap((f) => f.mime).join(',') || undefined}
        multiple={plusieurs}
        aria-describedby={erreur ? \`\${id}-erreur\` : undefined}
        onChange={(evenement) => {
          const fichiers = Array.from(evenement.target.files ?? []);
          // Le même fichier peut être choisi de nouveau.
          evenement.target.value = '';
          void choisir(fichiers);
        }}
      />
      <label htmlFor={id} className="humalis-fichier-bouton">
        {libelle}
      </label>
      {choisis.length > 0 && (
        <ul className="humalis-fichier-liste">
          {choisis.map((fichier, i) => (
            <li key={i}>{fichier.nom}</li>
          ))}
        </ul>
      )}
      <p id={\`\${id}-erreur\`} role="alert" className="humalis-fichier-erreur" hidden={!erreur}>
        {erreur}
      </p>
    </div>
  );
}
`;

/** `televerser.ts` : l'envoi d'un fichier à une source, avec sa progression. */
export const TELEVERSER_TS = `import { SOURCES, REPOS, type EtatRequete } from './sources';
import type { FichierChoisi } from './choix-fichier';

export interface OptionsEnvoi {
  /** La source déclarée dans le programme (« de la source "boutique" »). */
  source: string;
  /** Le fichier seul comme corps ; sinon un formulaire sous le nom \`champ\`. */
  corpsBrut?: boolean;
  champ?: string;
  /** Reçoit 0 à 100 pendant l'envoi. */
  progression?: (pourcent: number) => void;
  /** Reçoit l'état de la requête : la page lit « adresse est en chargement ». */
  suivi?: (etat: EtatRequete) => void;
  /** La page parle elle-même de l'erreur : pas de message automatique. */
  silencieux?: boolean;
  message?: (texte: string, genre: 'erreur') => void;
}

/** Suit un chemin (« data.fichier ») dans une réponse. */
function suivre(valeur: unknown, chemin?: string): unknown {
  if (!chemin) return valeur;
  return chemin.split('.').reduce<unknown>((courant, cle) => (courant !== null && typeof courant === 'object' ? (courant as Record<string, unknown>)[cle] : undefined), valeur);
}

/** Une seule requête XHR : la progression de l'envoi, puis la réponse. */
function envoyerUn(fichier: FichierChoisi, adresse: string, options: OptionsEnvoi, avancer: (fraction: number) => void): Promise<unknown> {
  const source = SOURCES[options.source];
  return new Promise((resolve, reject) => {
    const parametres = new URLSearchParams();
    if (source.jeton?.place.genre === 'parametre') parametres.set(source.jeton.place.nom, source.jeton.valeur);
    const url = \`\${source.base}/\${adresse.replace(/^\\/+/, '')}\${parametres.size > 0 ? \`?\${parametres}\` : ''}\`;
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.withCredentials = source.session;
    xhr.timeout = source.delai * 1000 * 6;
    xhr.setRequestHeader('Accept', 'application/json');
    for (const [nom, valeur] of Object.entries(source.entetes)) xhr.setRequestHeader(nom, valeur);
    if (source.jeton?.place.genre === 'autorisation') xhr.setRequestHeader('Authorization', \`Bearer \${source.jeton.valeur}\`);
    if (source.jeton?.place.genre === 'entete') xhr.setRequestHeader(source.jeton.place.nom, source.jeton.valeur);
    // Le jeton CSRF des packs (cookie astratra_csrf) voyage avec les envois d'une source qui donne la session.
    const csrf = document.cookie.match(/(?:^|; )astratra_csrf=([^;]*)/)?.[1];
    if (source.session && csrf) xhr.setRequestHeader('x-csrf-token', decodeURIComponent(csrf));

    let corps: Blob | FormData;
    if (options.corpsBrut) {
      xhr.setRequestHeader('Content-Type', fichier.brut.type || 'application/octet-stream');
      corps = fichier.brut;
    } else {
      corps = new FormData();
      corps.append(options.champ ?? 'fichier', fichier.brut, fichier.nom);
    }

    xhr.upload.onprogress = (evenement) => {
      if (evenement.lengthComputable) avancer(evenement.loaded / evenement.total);
    };
    xhr.onload = () => {
      let json: unknown;
      try {
        json = xhr.responseText === '' ? undefined : JSON.parse(xhr.responseText);
      } catch {
        json = undefined;
      }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(json);
      const message = suivre(json, source.erreur);
      reject({ code: xhr.status, message: typeof message === 'string' ? message : '' });
    };
    xhr.onerror = () => reject({ code: 0, message: '' });
    xhr.ontimeout = () => reject({ code: 0, message: '' });
    xhr.send(corps);
  });
}

/** Le message à montrer : celui de l'API pour un refus, sinon un texte clair selon le code. */
function messageDe(erreur: { code: number; message: string }): string {
  if (erreur.code === 429) return 'Trop de demandes en peu de temps. Patientez un moment, puis réessayez.';
  if (erreur.code === 401) return 'Connectez-vous pour continuer.';
  if (erreur.code === 413) return erreur.message || 'Ce fichier est trop gros pour le serveur.';
  if (erreur.message !== '' && erreur.code >= 400 && erreur.code < 500) return erreur.message;
  return "Le serveur n'a pas répondu. Réessayez dans un instant.";
}

/**
 * Envoie le fichier choisi (ou chacun, l'un après l'autre) à la route d'une
 * source. Un envoi n'est jamais rejoué tout seul. Rend le champ « fichier »
 * de la réponse (ou toute la réponse), sinon la valeur actuelle.
 */
export async function televerser<T>(choisi: any, adresse: string, options: OptionsEnvoi, actuelle: T): Promise<T> {
  const fichiers: FichierChoisi[] = Array.isArray(choisi) ? choisi : choisi ? [choisi] : [];
  const source = SOURCES[options.source];
  if (fichiers.length === 0) {
    if (!options.silencieux) options.message?.("Choisissez d'abord un fichier.", 'erreur');
    options.suivi?.({ statut: 'erreur', message: "Choisissez d'abord un fichier." });
    return actuelle;
  }
  options.suivi?.({ statut: 'chargement', message: '' });
  options.progression?.(0);
  const reponses: unknown[] = [];
  try {
    for (const [i, fichier] of fichiers.entries()) {
      const brut = await envoyerUn(fichier, adresse, options, (fraction) => options.progression?.(Math.round(((i + fraction) / fichiers.length) * 100)));
      const valeur = suivre(brut, source.enveloppe);
      reponses.push(valeur !== null && typeof valeur === 'object' && 'fichier' in valeur ? (valeur as { fichier: unknown }).fichier : valeur);
    }
    options.progression?.(100);
    options.suivi?.(REPOS);
    return (Array.isArray(choisi) ? reponses : reponses[0]) as T;
  } catch (erreur) {
    const message = messageDe(erreur as { code: number; message: string });
    options.suivi?.({ statut: (erreur as { code: number }).code === 404 ? 'introuvable' : 'erreur', message });
    if (!options.silencieux) options.message?.(message, 'erreur');
    return actuelle;
  }
}
`;
