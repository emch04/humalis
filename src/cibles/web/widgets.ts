/**
 * Les éléments d'écran sur le web (React) : icône, badge, avatar,
 * progression, chargement, étoiles, compteur, code QR, et les blocs
 * onglets, dépliants, accordéon, carrousel, fil d'Ariane (plan
 * 2026-10-30-mise-en-page-et-elements, chapitre 5).
 *
 * `ecran.ts` décide quoi écrire et où ; ce fichier dit comment chaque
 * plateforme l'écrit (`RenduWidgets`). Le mobile a le sien
 * (`cibles/mobile/widgets.ts`).
 */
import type { GenreBloc } from '../../parser/ast.js';
import type { ChoixFichierRI, GenreWidget, Reglages, TexteEnLangues } from '../../ri/types.js';
import { messageEnCode } from '../../i18n/messages.js';
import { chercherIcone, composantLucide, ICONES } from '../../vocabulaire/icones.js';
import { chaine } from './noms.js';
import { CHOIX_FICHIER_TSX, TELEVERSER_TS } from './fichiers.js';
import { CARTE_TSX, LEAFLET, carteWeb, type CarteProduite } from './carte.js';

/** Un élément d'écran d'une ligne, prêt à être écrit. */
export interface WidgetProduit {
  genre: GenreWidget;
  id: string;
  /** Les classes CSS (styles nommés, `avec style`), séparées par des espaces. */
  classes: string;
  /** Les noms de style (`taille_grande`…), pour le mobile. */
  styles: string[];
  /** La valeur, en expression JavaScript. */
  valeur: string;
  /** La valeur si c'est un texte sans {variable}. */
  texte?: string;
  /** La valeur comme contenu JSX (texte, ou {expression}). */
  contenu: string;
  /** Vrai si la valeur change (une variable, un calcul) : un lecteur d'écran doit l'annoncer. */
  dynamique: boolean;
  reglages: Reglages;
  /** Le texte de `reglages.photo`, en expression. */
  photo?: string;
  minimum?: number;
  maximum?: number;
  /** Étoiles modifiables, compteur, choix de fichier : la variable que l'élément change. */
  variable?: { lecture: string; setter: string };
  /** Le choix d'un fichier : ce qu'il accepte. */
  fichier?: ChoixFichierRI;
  /** Un audio : sa source et ses textes, prêts à être des attributs (`"x.mp3"` ou `{expression}`). */
  audio?: { source: string; description?: string; transcription?: string };
}

/** Un bloc composite (onglets, dépliant, carrousel, fil d'Ariane), prêt à être écrit. */
export interface CompositeProduit {
  genre: GenreBloc;
  id: string;
  classes: string;
  styles: string[];
  reglages: Reglages;
  /** Chaque partie : son titre en JSX (texte ou `{expression}`), son icône. */
  parties: { titre: string; icone?: string }[];
  /** L'état caché : l'onglet ou le dépliant ouvert. */
  etat?: { lecture: string; setter: string };
  /** Un dépliant : l'expression vraie quand il est ouvert, et ce qui le bascule. */
  ouvert?: string;
  basculer?: string;
}

/** Ce que le rendu écrit autour d'un composite : avant, chaque partie (ouverture, fermeture), après. */
export interface PlanComposite {
  avant: string[];
  /** Absent : le contenu du bloc est écrit tel quel entre `avant` et `apres`. */
  parties?: { ouvrir: string[]; fermer: string[] }[];
  apres: string[];
}

export interface RenduWidgets {
  /** Un élément d'écran d'une ligne : une ligne de JSX. */
  widget(w: WidgetProduit): string;
  /** Une icône décorative, à placer avant le texte d'un bouton, d'un lien… */
  icone(nom: string): string;
  composite(c: CompositeProduit): PlanComposite;
  /** Une carte (plan des médias, 4.5) : les lignes de son écriture. */
  carte(c: CarteProduite): string[];
  /** Les lignes d'import que le code d'une page demande (icônes, code QR, petits composants). */
  imports(code: string): string[];
}

// ─── Le web ──────────────────────────────────────────────────────────────

/** Le composant de lucide-react d'une icône de Humalis (`panier` donne `ShoppingCart`). */
export const composantIcone = (nom: string): string => composantLucide(chercherIcone(nom)?.lucide ?? 'circle-help') + 'Icon';

/** Les tailles d'un code QR, selon la taille de texte demandée. */
const TAILLES_QR: Record<string, number> = { petite: 128, normale: 192, grande: 256, tres_grande: 320 };

/** Un attribut : texte fixe entre guillemets, sinon expression. */
const attribut = (nom: string, texte: string | undefined, langues?: TexteEnLangues) =>
  texte === undefined ? '' : langues ? ` ${nom}={${messageEnCode(langues, chaine)}}` : /["\\{}\n<>]/.test(texte) ? ` ${nom}={${chaine(texte)}}` : ` ${nom}="${texte}"`;
const cls = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' ');

export const WIDGETS_WEB: RenduWidgets = {
  imports(code) {
    const lignes: string[] = [];
    const icones = iconesUtilisees(code);
    if (icones.length > 0) lignes.push(`import { ${icones.join(', ')} } from 'lucide-react';`);
    if (/<QRCodeSVG\b/.test(code)) lignes.push(`import { QRCodeSVG } from 'qrcode.react';`);
    for (const [composant, fichier] of [['Avatar', 'avatar'], ['Etoiles', 'etoiles'], ['Compteur', 'compteur'], ['Carrousel', 'carrousel'], ['CarteLieux', 'carte-lieux'], ['Graphique', 'graphique']]) {
      if (new RegExp(`<${composant}\\b`).test(code)) lignes.push(`import ${composant} from '../humalis/${fichier}';`);
    }
    if (/\bsurToucheOnglets\(/.test(code)) lignes.push(`import { surToucheOnglets } from '../humalis/onglets';`);
    if (/<SelecteurLangue\b/.test(code)) lignes.push(`import { SelecteurLangue } from '../humalis/langue';`);
    if (/<ChoixFichier\b/.test(code)) lignes.push(`import ChoixFichier from '../humalis/choix-fichier';`);
    if (/\bteleverser\(/.test(code)) lignes.push(`import { televerser } from '../humalis/televerser';`);
    return lignes;
  },

  icone: (nom) => `<${composantIcone(nom)} className="humalis-icone" aria-hidden="true" />`,

  carte: carteWeb,

  widget(w) {
    const description = attribut('aria-label', w.reglages.description, w.reglages.descriptionLangues);
    switch (w.genre) {
      case 'icone': {
        const composant = composantIcone(w.texte ?? '');
        const role = w.reglages.description && !w.reglages.decoratif ? ` role="img"${description}` : ' aria-hidden="true"';
        return `<${composant} className="${cls('humalis-icone', w.classes)}"${role} />`;
      }
      case 'badge':
        return `<span className="${cls('humalis-badge', w.classes)}">${w.contenu}</span>`;
      case 'avatar': {
        const photo = w.photo ? ` photo={${w.photo}}` : '';
        return `<Avatar nom={${w.valeur}}${photo} className="${cls('humalis-avatar', w.classes)}" />`;
      }
      case 'progression': {
        const rien = w.valeur === 'null' || w.valeur === 'undefined';
        const max = w.maximum ?? 100;
        const barre = `<progress className="humalis-progression"${rien ? '' : ` value={${w.valeur}}`} max={${max}}${description} />`;
        const pourcentage = w.reglages.pourcentage && !rien ? `<span>{Math.round((${w.valeur} / ${max}) * 100)} %</span>` : '';
        return pourcentage || w.classes
          ? `<div className="${cls('humalis-progression-ligne', w.classes)}">${barre}${pourcentage}</div>`
          : barre;
      }
      case 'chargement':
        return `<span className="${cls('humalis-chargement', w.classes)}" role="status"${w.texte === '' ? ' aria-label="Chargement"' : ''}><span className="humalis-chargement-rond" aria-hidden="true" />${w.contenu}</span>`;
      case 'etoiles': {
        const change = w.reglages.modifiable && w.variable ? ` onChange={${w.variable.setter}}` : '';
        return `<Etoiles valeur={${w.valeur}} maximum={${w.maximum ?? 5}}${change} className="${cls('humalis-etoiles', w.classes)}"${description} />`;
      }
      case 'compteur': {
        const bornes = `${w.minimum !== undefined ? ` minimum={${w.minimum}}` : ''}${w.maximum !== undefined ? ` maximum={${w.maximum}}` : ''}`;
        return `<Compteur valeur={${w.valeur}} onChange={${w.variable!.setter}}${bornes} className="${cls('humalis-compteur', w.classes)}"${description} />`;
      }
      case 'audio': {
        // Jamais de lecture automatique ; rien n'est téléchargé avant que la personne lance le son.
        const a = w.audio!;
        const lecteur = `<audio controls preload="none" src=${a.source}${a.description ? ` aria-label=${a.description}` : ''}${w.reglages.boucle ? ' loop' : ''}`;
        if (!a.transcription) return `${lecteur} className="${cls('humalis-audio', w.classes)}" />`;
        return `<figure className="${cls('humalis-audio', w.classes)}">${lecteur} /><details className="humalis-audio-transcription"><summary>Lire la transcription</summary><p>${a.transcription}</p></details></figure>`;
      }
      case 'fichier': {
        const f = w.fichier!;
        const familles = `[${f.familles.map((x) => `{ nom: ${chaine(x.nom)}, mime: [${x.mime.map(chaine).join(', ')}] }`).join(', ')}]`;
        const maximum = f.octets !== undefined ? ` maximum={${f.octets}}` : '';
        return `<ChoixFichier libelle={${w.valeur}} valeur={${w.variable!.lecture}} onChange={${w.variable!.setter}} familles={${familles}}${maximum}${f.plusieurs ? ' plusieurs' : ''} apercu={${f.apercu}} className="${cls('humalis-fichier', w.classes)}" />`;
      }
      case 'qr': {
        const taille = TAILLES_QR[w.styles.find((s) => s.startsWith('taille_'))?.slice(7) ?? 'normale'] ?? 192;
        const titre = w.reglages.description ?? 'Code QR';
        const nom = w.reglages.descriptionLangues ? `{${messageEnCode(w.reglages.descriptionLangues, chaine)}}` : attributTexte(titre);
        return `<span className="${cls('humalis-qr', w.classes)}" role="img" aria-label=${nom}><QRCodeSVG value={${w.valeur}} size={${taille}} level="M" bgColor="#ffffff" fgColor="#000000" /></span>`;
      }
      case 'selecteurLangue':
        // Le sélecteur vit avec la langue (src/humalis/langue.tsx).
        return `<SelecteurLangue className="${cls('humalis-selecteur-langue', w.classes)}" />`;
    }
  },

  composite(c) {
    const classe = (base: string) => `"${cls(base, c.classes)}"`;
    switch (c.genre) {
      case 'onglets': {
        const sel = c.etat!.lecture;
        const set = c.etat!.setter;
        const n = c.parties.length;
        const boutons = c.parties.map(
          (p, i) =>
            `<button type="button" role="tab" id="${c.id}-onglet-${i}" aria-selected={${sel} === ${i}} aria-controls="${c.id}-panneau-${i}" tabIndex={${sel} === ${i} ? 0 : -1} className="humalis-onglet" onClick={() => ${set}(${i})} onKeyDown={(evenement) => surToucheOnglets(evenement, ${sel}, ${n}, ${set})}>${p.icone ? WIDGETS_WEB.icone(p.icone) : ''}${p.titre}</button>`,
        );
        return {
          avant: [`<div className=${classe('humalis-onglets')}>`, `  <div role="tablist" className="humalis-onglets-barre">`, ...boutons.map((b) => `    ${b}`), '  </div>'],
          parties: c.parties.map((_, i) => ({
            ouvrir: [`<div role="tabpanel" id="${c.id}-panneau-${i}" aria-labelledby="${c.id}-onglet-${i}" hidden={${sel} !== ${i}} className="humalis-onglets-panneau">`],
            fermer: ['</div>'],
          })),
          apres: ['</div>'],
        };
      }
      case 'deroulant':
        return {
          avant: [
            `<div className=${classe('humalis-deroulant')}>`,
            `  <button type="button" id="${c.id}-titre" aria-expanded={${c.ouvert}} aria-controls="${c.id}-zone" className="humalis-deroulant-titre" onClick={() => ${c.basculer}}>${c.parties[0].icone ? WIDGETS_WEB.icone(c.parties[0].icone) : ''}<span>${c.parties[0].titre}</span></button>`,
          ],
          parties: [{ ouvrir: [`<div role="region" id="${c.id}-zone" aria-labelledby="${c.id}-titre" hidden={!(${c.ouvert})} className="humalis-deroulant-zone">`], fermer: ['</div>'] }],
          apres: ['</div>'],
        };
      case 'accordeon':
        return { avant: [`<div className=${classe('humalis-accordeon')}>`], apres: ['</div>'] };
      case 'carrousel': {
        const proprietes = `${c.reglages.automatique ? ` automatique={${c.reglages.automatique}}` : ''}${c.reglages.visibles ? ` visibles={${c.reglages.visibles}}` : ''}${attribut('description', c.reglages.description, c.reglages.descriptionLangues)}`;
        return { avant: [`<Carrousel${proprietes} className=${classe('humalis-carrousel')}>`], apres: ['</Carrousel>'] };
      }
      case 'filAriane':
        return {
          avant: [`<nav aria-label="Fil d'Ariane" className=${classe('humalis-fil')}>`, '  <ol>'],
          parties: c.parties.map((_, i) => ({
            ouvrir: [`<li${i === c.parties.length - 1 ? ' aria-current="page"' : ''}>`],
            fermer: ['</li>'],
          })),
          apres: ['  </ol>', '</nav>'],
        };
      default:
        return { avant: [], apres: [] };
    }
  },
};

function attributTexte(texte: string): string {
  return /["\\{}\n]/.test(texte) ? `{${chaine(texte)}}` : `"${texte}"`;
}

// ─── Les imports et les petits fichiers qui vont avec ───────────────────

/** Les icônes (`<ShoppingCart `) que le code utilise, pour `import { … } from 'lucide-react'`. */
export function iconesUtilisees(code: string): string[] {
  return ICONES.map((i) => composantLucide(i.lucide) + 'Icon').filter((c, i, tout) => tout.indexOf(c) === i && new RegExp(`<${c}[\\s/>]`).test(code));
}

/** Les petits fichiers de `src/humalis/` dont le code produit a besoin, d'après ce qu'il emploie. */
export function fichiersDesElements(codes: string[]): Map<string, string> {
  const fichiers = new Map<string, string>();
  const emploie = (motif: RegExp) => codes.some((c) => motif.test(c));
  if (emploie(/<Avatar\b/)) fichiers.set('avatar.tsx', AVATAR_TSX);
  if (emploie(/<Etoiles\b/)) fichiers.set('etoiles.tsx', ETOILES_TSX);
  if (emploie(/<Compteur\b/)) fichiers.set('compteur.tsx', COMPTEUR_TSX);
  if (emploie(/<Carrousel\b/)) fichiers.set('carrousel.tsx', CARROUSEL_TSX);
  if (emploie(/\bsurToucheOnglets\(/)) fichiers.set('onglets.ts', ONGLETS_TS);
  if (emploie(/<ChoixFichier\b/)) fichiers.set('choix-fichier.tsx', CHOIX_FICHIER_TSX);
  if (emploie(/<CarteLieux\b/)) fichiers.set('carte-lieux.tsx', CARTE_TSX);
  if (emploie(/\bteleverser\(/)) fichiers.set('televerser.ts', TELEVERSER_TS);
  return fichiers;
}

/** Les dépendances d'exécution que le code produit ajoute, d'après ce qu'il emploie. */
export function dependancesDesElements(codes: string[]): Record<string, string> {
  const emploie = (motif: RegExp) => codes.some((c) => motif.test(c));
  return {
    ...(emploie(/from 'lucide-react'/) ? { 'lucide-react': '1.65.0' } : {}),
    ...(emploie(/from 'qrcode\.react'/) ? { 'qrcode.react': '4.2.0' } : {}),
    // La carte : Leaflet est chargé par le composant, à l'ouverture de la carte (voir carte.ts).
    ...(emploie(/import\('leaflet'\)/) ? { leaflet: LEAFLET.version } : {}),
  };
}

/** Les dépendances de développement que le code produit ajoute (les types de Leaflet pour \`tsc\`). */
export function dependancesDeDeveloppement(codes: string[]): Record<string, string> {
  return codes.some((c) => /import\('leaflet'\)/.test(c)) ? { '@types/leaflet': LEAFLET.types } : {};
}

const AVATAR_TSX = `import { useState } from 'react';

/** Les initiales d'un nom : « Camille Martin » donne « CM ». */
function initiales(nom: string): string {
  const mots = nom.trim().split(/\\s+/).filter(Boolean);
  return ((mots[0]?.[0] ?? '') + (mots.length > 1 ? (mots[mots.length - 1][0] ?? '') : '')).toUpperCase();
}

/** La personne : sa photo, ou ses initiales si elle manque ou ne se charge pas. */
export default function Avatar({ nom, photo, className }: { nom: string; photo?: string; className?: string }) {
  const [echec, setEchec] = useState(false);
  return (
    <span role="img" aria-label={nom} className={className}>
      {photo && !echec ? <img src={photo} alt="" onError={() => setEchec(true)} /> : <span aria-hidden="true">{initiales(nom)}</span>}
    </span>
  );
}
`;

const ETOILES_TSX = `import { StarIcon as Star } from 'lucide-react';

interface Proprietes {
  valeur: number;
  maximum?: number;
  /** Présent : on clique sur une étoile pour changer la valeur. */
  onChange?: (valeur: number) => void;
  className?: string;
  'aria-label'?: string;
}

/** Une note en étoiles, avec les demi-étoiles ; modifiable si \`onChange\` est donné. */
export default function Etoiles({ valeur, maximum = 5, onChange, className, 'aria-label': description }: Proprietes) {
  const nombre = new Intl.NumberFormat('fr-FR').format(valeur);
  const etoiles = Array.from({ length: maximum }, (_, i) => {
    const reste = valeur - i;
    const etat = reste >= 1 ? 'pleine' : reste >= 0.5 ? 'demi' : 'vide';
    const dessin = (
      <>
        <Star className="humalis-etoile-fond" aria-hidden="true" />
        {etat === 'demi' && (
          <span className="humalis-etoile-moitie">
            <Star aria-hidden="true" />
          </span>
        )}
      </>
    );
    return onChange ? (
      <button key={i} type="button" role="radio" aria-checked={Math.round(valeur) === i + 1} aria-label={\`\${i + 1} sur \${maximum}\`} className={\`humalis-etoile humalis-etoile-\${etat}\`} onClick={() => onChange(i + 1)}>
        {dessin}
      </button>
    ) : (
      <span key={i} className={\`humalis-etoile humalis-etoile-\${etat}\`}>
        {dessin}
      </span>
    );
  });
  return onChange ? (
    <span role="radiogroup" aria-label={description ?? 'Note'} className={className}>
      {etoiles}
    </span>
  ) : (
    <span role="img" aria-label={description ?? \`Note : \${nombre} sur \${maximum}\`} className={className}>
      {etoiles}
    </span>
  );
}
`;

const COMPTEUR_TSX = `interface Proprietes {
  valeur: number;
  onChange: (valeur: number) => void;
  minimum?: number;
  maximum?: number;
  className?: string;
  'aria-label'?: string;
}

/** « – 1 + » : deux boutons et la valeur, qui reste entre le minimum et le maximum. */
export default function Compteur({ valeur, onChange, minimum, maximum, className, 'aria-label': description }: Proprietes) {
  return (
    <div role="group" aria-label={description ?? 'Quantité'} className={className}>
      <button type="button" aria-label="Diminuer" disabled={minimum !== undefined && valeur <= minimum} onClick={() => onChange(valeur - 1)}>
        –
      </button>
      <output aria-live="polite">{valeur}</output>
      <button type="button" aria-label="Augmenter" disabled={maximum !== undefined && valeur >= maximum} onClick={() => onChange(valeur + 1)}>
        +
      </button>
    </div>
  );
}
`;

const ONGLETS_TS = `import type { KeyboardEvent } from 'react';

/** Les flèches, Début et Fin changent d'onglet, comme dans tout jeu d'onglets accessible. */
export function surToucheOnglets(evenement: KeyboardEvent, courant: number, total: number, choisir: (index: number) => void): void {
  const suivant: Record<string, number> = {
    ArrowRight: (courant + 1) % total,
    ArrowLeft: (courant - 1 + total) % total,
    Home: 0,
    End: total - 1,
  };
  if (!(evenement.key in suivant)) return;
  evenement.preventDefault();
  choisir(suivant[evenement.key]);
  const boutons = evenement.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="tab"]');
  boutons?.[suivant[evenement.key]]?.focus();
}
`;

const CARROUSEL_TSX = `import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

interface Proprietes {
  children: ReactNode;
  /** Secondes entre deux diapositives ; absent : le carrousel ne défile pas seul. */
  automatique?: number;
  /** Combien de diapositives sont vues à la fois (une seule sur un téléphone). */
  visibles?: number;
  description?: string;
  className?: string;
}

/**
 * Des diapositives à défilement accroché : le doigt et la molette marchent
 * sans JavaScript ; les flèches et les points s'y ajoutent. Le défilement
 * automatique s'arrête sous la souris, au clavier, et si l'appareil demande
 * moins de mouvement.
 */
export default function Carrousel({ children, automatique, visibles = 1, description, className }: Proprietes) {
  const piste = useRef<HTMLDivElement>(null);
  const [courante, setCourante] = useState(0);
  const [pause, setPause] = useState(false);
  const total = Children.count(children);
  const pages = Math.max(1, total - visibles + 1);

  const aller = useCallback(
    (index: number) => {
      const element = piste.current;
      if (!element) return;
      const cible = (index + pages) % pages;
      const diapo = element.children[cible] as HTMLElement | undefined;
      element.scrollTo({ left: diapo ? diapo.offsetLeft - element.offsetLeft : 0 });
    },
    [pages],
  );

  // La diapositive courante suit le défilement (doigt, molette ou boutons).
  useEffect(() => {
    const element = piste.current;
    if (!element) return;
    const lire = () => {
      const premiere = element.children[0] as HTMLElement | undefined;
      const pas = premiere ? (element.children[1] as HTMLElement | undefined)?.offsetLeft ?? 0 : 0;
      const largeur = premiere ? pas - premiere.offsetLeft : element.clientWidth;
      setCourante(largeur > 0 ? Math.min(pages - 1, Math.round(element.scrollLeft / largeur)) : 0);
    };
    element.addEventListener('scroll', lire, { passive: true });
    return () => element.removeEventListener('scroll', lire);
  }, [pages]);

  useEffect(() => {
    if (!automatique || pause || pages < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const minuterie = setInterval(() => aller(courante + 1), automatique * 1000);
    return () => clearInterval(minuterie);
  }, [automatique, pause, pages, courante, aller]);

  return (
    <section
      aria-roledescription="carrousel"
      aria-label={description ?? 'Carrousel'}
      className={className}
      style={{ ['--humalis-visibles' as string]: visibles }}
      onMouseEnter={() => setPause(true)}
      onMouseLeave={() => setPause(false)}
      onFocus={() => setPause(true)}
      onBlur={() => setPause(false)}
    >
      <div ref={piste} className="humalis-carrousel-piste" aria-live={automatique && !pause ? 'off' : 'polite'}>
        {children}
      </div>
      {pages > 1 && (
        <div className="humalis-carrousel-commandes">
          <button type="button" aria-label="Précédent" onClick={() => aller(courante - 1)}>
            ‹
          </button>
          <div className="humalis-carrousel-points">
            {Array.from({ length: pages }, (_, i) => (
              <button key={i} type="button" aria-label={\`Diapositive \${i + 1} sur \${pages}\`} aria-current={courante === i} className="humalis-carrousel-point" onClick={() => aller(i)} />
            ))}
          </div>
          <button type="button" aria-label="Suivant" onClick={() => aller(courante + 1)}>
            ›
          </button>
        </div>
      )}
    </section>
  );
}
`;
