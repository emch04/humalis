/**
 * Les éléments d'écran sur le site statique (plan
 * 2026-10-30-mise-en-page-et-elements, chapitre 5) : icône, badge, avatar,
 * progression, chargement, étoiles, compteur, code QR, onglets, dépliants,
 * accordéon, carrousel, fil d'Ariane.
 *
 * Une page statique s'écrit deux fois : en HTML de départ, et en JavaScript
 * qui la redessine. Pour ne pas écrire chaque élément deux fois, chacun est
 * décrit ici par un petit arbre (`Noeud`) que `page.ts` écrit dans les deux
 * formes. Une valeur qui change (l'onglet ouvert) porte son expression
 * JavaScript et sa valeur de départ.
 */
import type { NoeudVue, Reglages, GenreWidget, LangueRI } from '../../ri/types.js';
import { messageEnCode } from '../../i18n/messages.js';
import { chaine } from '../web/noms.js';

/** « Langue » dans chaque langue : le nom du sélecteur, lu par les lecteurs d'écran. */
const NOM_DU_CHOIX: Record<string, string> = { fr: 'Langue', en: 'Language' };
import { chercherIcone } from '../../vocabulaire/icones.js';

/** Un attribut : fixe, ou calculé par le script avec sa valeur de départ. */
export type Attr = string | boolean | { js: string; initial: string | boolean };

export type Enfant =
  | Noeud
  | { texte: string }
  | { js: string; initial: string }
  /** Le contenu du bloc, écrit par le générateur de la page. */
  | { vue: NoeudVue[] }
  /** Une icône de Lucide, en SVG en ligne. */
  | { icone: string; classe?: string; label?: string | { js: string; initial: string } }
  /** Un code QR dessiné par le script (aucun encodeur dans le compilateur). */
  | { qr: string }
  /** Le contenu d'un avatar : sa photo ou ses initiales. */
  | { avatar: { nom: string; photo?: string; initialNom: string; initialPhoto?: string } }
  /** Des étoiles (dessinées par `etoiles` dans le script, calculées ici pour le HTML de départ). */
  | { etoiles: { js: string; initial: number; maximum: number; change?: string; label: string | { js: string; initial: string }; classes: string } };

export interface Noeud {
  tag: string;
  attrs: [string, Attr][];
  enfants: Enfant[];
}

const n = (tag: string, attrs: [string, Attr][], ...enfants: Enfant[]): Noeud => ({ tag, attrs, enfants });
const cls = (...parts: (string | undefined | false)[]) => parts.filter(Boolean).join(' ');

/** Ce que la page sait calculer pour un widget : la valeur et le texte, en JavaScript et au départ. */
export interface AideWidget {
  /** La valeur comme expression JavaScript, et sa valeur de départ. */
  valeur: { js: string; initial: unknown };
  /** Le contenu texte (avec format français) : expression JS et texte de départ. */
  texte: { js: string; initial: string };
  /** Le texte si la valeur est un texte sans {variable}. */
  litteral?: string;
  /** Les classes (styles nommés + `avec style`). */
  classes: string;
  styles: string[];
  reglages: Reglages;
  minimum?: number;
  maximum?: number;
  /** La photo d'un avatar (expression JS et valeur de départ). */
  photo?: { js: string; initial: string };
  /** La variable liée (compteur, étoiles modifiables), en JavaScript. */
  variable?: string;
  /** `humalis-onglet-12` : de quoi fabriquer des identifiants. */
  id: string;
  /** Les langues du site, pour le sélecteur de langue. */
  langues?: LangueRI[];
  /** Un audio : sa source et ses textes (fixes, ou calculés par le script). */
  audio?: { source: Attr; description?: Attr; transcription?: { js: string; initial: string } };
}

const lucide = (nom: string | undefined) => chercherIcone(nom ?? '')?.lucide ?? 'circle-help';

export function arbreWidget(genre: GenreWidget, a: AideWidget): Enfant {
  // Avec des langues, la description suit la langue courante ; le HTML de départ est dans la langue de base.
  const description: string | { js: string; initial: string } | undefined = a.reglages.descriptionLangues
    ? { js: messageEnCode(a.reglages.descriptionLangues, chaine), initial: a.reglages.description! }
    : a.reglages.description;
  switch (genre) {
    case 'icone':
      return { icone: lucide(a.litteral), classe: cls('humalis-icone', a.classes), label: a.reglages.decoratif ? undefined : description };
    case 'badge':
      return n('span', [['class', cls('humalis-badge', a.classes)]], a.texte);
    case 'avatar':
      return n(
        'span',
        [['class', cls('humalis-avatar', a.classes)], ['role', 'img'], ['aria-label', { js: a.texte.js, initial: a.texte.initial }]],
        { avatar: { nom: a.valeur.js, photo: a.photo?.js, initialNom: a.texte.initial, initialPhoto: a.photo?.initial } },
      );
    case 'progression': {
      const max = a.maximum ?? 100;
      const indeterminee = a.valeur.initial === null || a.valeur.initial === undefined;
      const barre = n('progress', [
        ['class', 'humalis-progression'],
        ['max', String(max)],
        ...(indeterminee ? [] : ([['value', { js: `String(${a.valeur.js})`, initial: String(a.valeur.initial) }]] as [string, Attr][])),
        ...(description ? ([['aria-label', description]] as [string, Attr][]) : []),
      ]);
      if (!a.reglages.pourcentage && !a.classes) return barre;
      return n(
        'div',
        [['class', cls('humalis-progression-ligne', a.classes)]],
        barre,
        ...(a.reglages.pourcentage && !indeterminee
          ? [n('span', [], { js: `Math.round((${a.valeur.js} / ${max}) * 100) + ' %'`, initial: `${Math.round((Number(a.valeur.initial) / max) * 100)} %` })]
          : []),
      );
    }
    case 'chargement':
      return n(
        'span',
        [['class', cls('humalis-chargement', a.classes)], ['role', 'status'], ...(a.litteral === '' ? ([['aria-label', 'Chargement']] as [string, Attr][]) : [])],
        n('span', [['class', 'humalis-chargement-rond'], ['aria-hidden', 'true']]),
        ...(a.litteral === '' ? [] : [a.texte]),
      );
    case 'etoiles':
      return {
        etoiles: {
          js: a.valeur.js,
          initial: Number(a.valeur.initial) || 0,
          maximum: a.maximum ?? 5,
          change: a.reglages.modifiable && a.variable ? `(valeur) => { ${a.variable} = valeur; }` : undefined,
          label: description ?? { js: `'Note : ' + formaterNombre(${a.valeur.js}) + ' sur ${a.maximum ?? 5}'`, initial: `Note : ${a.valeur.initial} sur ${a.maximum ?? 5}` },
          classes: cls('humalis-etoiles', a.classes),
        },
      };
    case 'compteur': {
      const v = a.variable!;
      const min = a.minimum;
      const max = a.maximum;
      const initial = Number(a.valeur.initial);
      return n(
        'div',
        [['class', cls('humalis-compteur', a.classes)], ['role', 'group'], ['aria-label', description ?? 'Quantité']],
        n('button', [['type', 'button'], ['aria-label', 'Diminuer'], ['data-humalis', `${a.id}-moins`], ['disabled', min === undefined ? false : { js: `${v} <= ${min}`, initial: initial <= min }], ['onclick', `() => { ${v} = ${min === undefined ? `${v} - 1` : `Math.max(${min}, ${v} - 1)`}; }`]], { texte: '–' }),
        n('output', [['aria-live', 'polite']], { js: `String(${v})`, initial: String(initial) }),
        n('button', [['type', 'button'], ['aria-label', 'Augmenter'], ['data-humalis', `${a.id}-plus`], ['disabled', max === undefined ? false : { js: `${v} >= ${max}`, initial: initial >= max }], ['onclick', `() => { ${v} = ${max === undefined ? `${v} + 1` : `Math.min(${max}, ${v} + 1)`}; }`]], { texte: '+' }),
      );
    }
    case 'qr':
      return n('span', [['class', cls('humalis-qr', a.classes)], ['role', 'img'], ['aria-label', description ?? 'Code QR']], { qr: a.valeur.js });
    case 'selecteurLangue': {
      // Chaque langue écrite dans sa langue ; le HTML de départ choisit la première, le script la langue courante.
      const langues = a.langues ?? [];
      const nom = { js: `t({ ${langues.map((l) => `${l.code}: '${NOM_DU_CHOIX[l.code] ?? 'Langue'}'`).join(', ')} })`, initial: NOM_DU_CHOIX[langues[0]?.code] ?? 'Langue' };
      return n(
        'select',
        [['class', cls('humalis-selecteur-langue', a.classes)], ['aria-label', nom], ['oninput', '(evenement) => changerLangue(evenement.target.value)']],
        ...langues.map((l, i) => n('option', [['value', l.code], ['lang', l.code], ['selected', { js: `langue() === '${l.code}'`, initial: i === 0 }]], { texte: l.nom })),
      );
    }
    case 'audio': {
      // Jamais de lecture automatique ; rien n'est téléchargé avant que la personne lance le son.
      const son = a.audio!;
      const lecteur = n('audio', [
        ['controls', true],
        ['preload', 'none'],
        ['src', son.source],
        ...(son.description !== undefined ? ([['aria-label', son.description]] as [string, Attr][]) : []),
        ...(a.reglages.boucle ? ([['loop', true]] as [string, Attr][]) : []),
        ...(son.transcription ? [] : ([['class', cls('humalis-audio', a.classes)]] as [string, Attr][])),
      ]);
      if (!son.transcription) return lecteur;
      return n(
        'figure',
        [['class', cls('humalis-audio', a.classes)]],
        lecteur,
        n('details', [['class', 'humalis-audio-transcription']], n('summary', [], { texte: 'Lire la transcription' }), n('p', [], son.transcription)),
      );
    }
    case 'fichier':
      // Refusé avant d'arriver ici (cibles/sources.ts : verifierMediasPourLaCible).
      throw new Error('le choix d’un fichier n’est pas encore produit pour le site statique');
  }
}

/** Les initiales d'un nom : « Camille Martin » donne « CM » (le même calcul que humalis.initiales). */
export function initiales(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  return ((mots[0]?.[0] ?? '') + (mots.length > 1 ? (mots[mots.length - 1][0] ?? '') : '')).toUpperCase();
}

// ─── Les blocs ───────────────────────────────────────────────────────────

export interface AideComposite {
  genre: 'onglets' | 'deroulant' | 'accordeon' | 'carrousel' | 'filAriane';
  id: string;
  classes: string;
  reglages: Reglages;
  /** Chaque partie : son titre (expression et texte de départ), son icône, son contenu. */
  parties: { titre: { js: string; initial: string }; icone?: string; corps: NoeudVue[] }[];
  /** L'état caché : son nom JavaScript et sa valeur de départ. */
  etat?: { js: string; initial: number | boolean };
  /** Un dépliant : vrai quand il est ouvert (JavaScript et départ), et ce qui le bascule. */
  ouvert?: { js: string; initial: boolean };
  basculer?: string;
  /** Le contenu du bloc (carrousel, accordéon). */
  corps: NoeudVue[];
}

export function arbreComposite(c: AideComposite): Noeud {
  switch (c.genre) {
    case 'onglets': {
      const sel = c.etat!.js;
      const depart = Number(c.etat!.initial);
      return n(
        'div',
        [['class', cls('humalis-onglets', c.classes)]],
        n(
          'div',
          [['role', 'tablist'], ['class', 'humalis-onglets-barre']],
          ...c.parties.map((p, i) =>
            n(
              'button',
              [
                ['type', 'button'],
                ['role', 'tab'],
                ['id', `${c.id}-onglet-${i}`],
                ['data-humalis', `${c.id}-onglet-${i}`],
                ['aria-selected', { js: `String(${sel} === ${i})`, initial: String(depart === i) }],
                ['aria-controls', `${c.id}-panneau-${i}`],
                ['tabindex', { js: `${sel} === ${i} ? '0' : '-1'`, initial: depart === i ? '0' : '-1' }],
                ['class', 'humalis-onglet'],
                ['onclick', `() => { ${sel} = ${i}; }`],
              ],
              ...(p.icone ? [{ icone: lucide(p.icone), classe: 'humalis-icone' }] : []),
              p.titre,
            ),
          ),
        ),
        ...c.parties.map((p, i) =>
          n(
            'div',
            [['role', 'tabpanel'], ['id', `${c.id}-panneau-${i}`], ['aria-labelledby', `${c.id}-onglet-${i}`], ['class', 'humalis-onglets-panneau'], ['hidden', { js: `${sel} !== ${i}`, initial: depart !== i }]],
            { vue: p.corps },
          ),
        ),
      );
    }
    case 'deroulant': {
      const ouvert = c.ouvert!;
      return n(
        'div',
        [['class', cls('humalis-deroulant', c.classes)]],
        n(
          'button',
          [['type', 'button'], ['id', `${c.id}-titre`], ['data-humalis', `${c.id}-titre`], ['aria-expanded', { js: `String(${ouvert.js})`, initial: String(ouvert.initial) }], ['aria-controls', `${c.id}-zone`], ['class', 'humalis-deroulant-titre'], ['onclick', `() => { ${c.basculer}; }`]],
          ...(c.parties[0].icone ? [{ icone: lucide(c.parties[0].icone), classe: 'humalis-icone' }] : []),
          n('span', [], c.parties[0].titre),
        ),
        n('div', [['role', 'region'], ['id', `${c.id}-zone`], ['aria-labelledby', `${c.id}-titre`], ['class', 'humalis-deroulant-zone'], ['hidden', { js: `!(${ouvert.js})`, initial: !ouvert.initial }]], { vue: c.parties[0] ? c.corps : [] }),
      );
    }
    case 'accordeon':
      return n('div', [['class', cls('humalis-accordeon', c.classes)]], { vue: c.corps });
    case 'carrousel':
      return n(
        'section',
        [
          ['class', cls('humalis-carrousel', c.classes)],
          ['aria-roledescription', 'carrousel'],
          ['aria-label', c.reglages.descriptionLangues ? { js: messageEnCode(c.reglages.descriptionLangues, chaine), initial: c.reglages.description! } : (c.reglages.description ?? 'Carrousel')],
          ['data-humalis-carrousel', c.id],
          ...(c.reglages.automatique ? ([['data-automatique', String(c.reglages.automatique)]] as [string, Attr][]) : []),
          ...(c.reglages.visibles ? ([['style', `--humalis-visibles: ${c.reglages.visibles}`]] as [string, Attr][]) : []),
        ],
        n('div', [['class', 'humalis-carrousel-piste']], { vue: c.corps }),
      );
    case 'filAriane':
      return n(
        'nav',
        [['aria-label', "Fil d'Ariane"], ['class', cls('humalis-fil', c.classes)]],
        n('ol', [], ...c.parties.map((p, i) => n('li', i === c.parties.length - 1 ? [['aria-current', 'page']] : [], { vue: p.corps }))),
      );
  }
}
