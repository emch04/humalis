import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHOIX_FICHIER_JS, DEPLACEMENT_JS } from '../../src/cibles/moteur/interactions.js';

type Ecouteur = (evenement: any) => void;

class FauxElement {
  children: FauxElement[] = [];
  parentElement: FauxElement | null = null;
  attributes = new Map<string, string>();
  listeners = new Map<string, Ecouteur[]>();
  styleClasses = new Set<string>();
  textContent = '';
  innerHTML = '';
  id = '';
  type = '';
  accept = '';
  htmlFor = '';
  title = '';
  value = '';
  multiple = false;
  hidden = false;
  files: any[] = [];
  tabIndex = -1;
  focused = false;
  constructor(public tagName: string) {}
  get className() { return [...this.styleClasses].join(' '); }
  set className(v: string) { this.styleClasses = new Set(v.split(/\s+/).filter(Boolean)); }
  classList = {
    add: (nom: string) => this.styleClasses.add(nom),
    toggle: (nom: string, actif: boolean) => { if (actif) this.styleClasses.add(nom); else this.styleClasses.delete(nom); },
    contains: (nom: string) => this.styleClasses.has(nom),
  };
  append(...elements: FauxElement[]) { for (const e of elements) { e.parentElement = this; this.children.push(e); } }
  replaceChildren(...elements: FauxElement[]) { this.children = []; this.append(...elements); }
  insertBefore(element: FauxElement, suivant: FauxElement) {
    element.remove();
    const index = this.children.indexOf(suivant);
    this.children.splice(index < 0 ? this.children.length : index, 0, element);
    element.parentElement = this;
  }
  insertAdjacentElement(_place: string, e: FauxElement) { e.parentElement = this.parentElement; }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((e) => e !== this); }
  setAttribute(nom: string, valeur: string) { this.attributes.set(nom, valeur); }
  removeAttribute(nom: string) { this.attributes.delete(nom); }
  hasAttribute(nom: string) { return this.attributes.has(nom); }
  getAttribute(nom: string) { return this.attributes.get(nom) ?? null; }
  addEventListener(nom: string, f: Ecouteur) { this.listeners.set(nom, [...(this.listeners.get(nom) ?? []), f]); }
  removeEventListener(nom: string, f: Ecouteur) { this.listeners.set(nom, (this.listeners.get(nom) ?? []).filter((x) => x !== f)); }
  envoyer(nom: string, autres: Record<string, unknown> = {}) {
    const evenement = { target: this, pointerId: 1, button: 0, clientY: 0, preventDefault: vi.fn(), ...autres };
    for (const f of this.listeners.get(nom) ?? []) f(evenement);
    return evenement;
  }
  closest(selecteur: string): FauxElement | null {
    if (selecteur === '[data-deplacable]') return this.hasAttribute('data-deplacable') ? this : this.parentElement?.closest(selecteur) ?? null;
    return ['button', 'a', 'input', 'textarea', 'select'].includes(this.tagName) ? this : null;
  }
  querySelector(selecteur: string): FauxElement | null {
    if (selecteur === '.humalis-fichier-libelle' && this.innerHTML.includes('humalis-fichier-libelle')) {
      if (!this.children.length) this.append(new FauxElement('span'));
      return this.children[0];
    }
    return null;
  }
  getBoundingClientRect() { return { top: Number(this.getAttribute('data-top') ?? 0), height: 20 }; }
  focus() { this.focused = true; }
  setPointerCapture(_id: number) {}
}

const documentFaux = new FauxElement('document') as FauxElement & { createElement: (nom: string) => FauxElement };
documentFaux.createElement = (nom) => new FauxElement(nom);
const nettoyages: Array<() => void> = [];
const effets: Array<() => void> = [];
const moteurFaux = `export function effet(f) { globalThis.__effets.push(f); f(); }
export function nettoyer(f) { globalThis.__nettoyages.push(f); }
export async function executer(f) { return f(); }`;

async function charger(code: string): Promise<any> {
  const adresse = 'data:text/javascript,' + encodeURIComponent(moteurFaux);
  return import(/* @vite-ignore */ 'data:text/javascript,' + encodeURIComponent(code.replace("'./moteur.js'", JSON.stringify(adresse))) + '#' + Math.random());
}
function boite<T>(initiale: T) {
  let valeur = initiale;
  return {
    get v() { return valeur; },
    set v(v: T) { valeur = v; for (const f of effets) f(); },
  };
}
function fichier(nom: string, type: string, octets: number[], taille = octets.length) {
  return { name: nom, type, size: taille, slice: () => ({ arrayBuffer: async () => Uint8Array.from(octets).buffer }) };
}

beforeEachLocal();
function beforeEachLocal() {
  (globalThis as any).Element = FauxElement;
  (globalThis as any).MutationObserver = class { observe() {} disconnect() {} };
  (globalThis as any).document = documentFaux;
  (globalThis as any).__nettoyages = nettoyages;
  (globalThis as any).__effets = effets;
}
afterEach(() => {
  for (const f of nettoyages.splice(0)) f();
  effets.length = 0;
  documentFaux.listeners.clear();
  vi.restoreAllMocks();
});

describe('modules JavaScript produits pour le moteur', () => {
  it('se chargent comme modules ES et exposent les interactions', async () => {
    const deplacement = await charger(DEPLACEMENT_JS);
    const choix = await charger(CHOIX_FICHIER_JS);
    expect(typeof deplacement.listeDeplacable).toBe('function');
    expect(typeof deplacement.deplacerDans).toBe('function');
    expect(typeof choix.choixFichier).toBe('function');
    expect(DEPLACEMENT_JS + CHOIX_FICHIER_JS).not.toMatch(/\breact\b|import type|<T>/i);
  });

  it('réordonne sans toucher au tableau source et refuse les bornes invalides', async () => {
    const { deplacerDans } = await charger(DEPLACEMENT_JS);
    const source = ['un', 'deux', 'trois'];
    expect(deplacerDans(source, 0, 2)).toEqual(['deux', 'trois', 'un']);
    expect(source).toEqual(['un', 'deux', 'trois']);
    expect(deplacerDans(source, 1, -1)).toBe(source);
  });

  it('déplace au clavier, restaure par Échap et appelle après la dépose', async () => {
    const { listeDeplacable } = await charger(DEPLACEMENT_JS);
    const conteneur = new FauxElement('ul');
    for (const [i, nom] of ['un', 'deux', 'trois'].entries()) {
      const ligne = new FauxElement('li');
      ligne.textContent = nom;
      ligne.setAttribute('data-deplacable', '');
      ligne.setAttribute('data-top', String(i * 20));
      conteneur.append(ligne);
    }
    const valeur = boite(['un', 'deux', 'trois']);
    const ordre = vi.fn();
    listeDeplacable(conteneur, valeur, ordre);
    expect(conteneur.children[0].getAttribute('aria-roledescription')).toBe('élément déplaçable');
    conteneur.envoyer('keydown', { key: ' ', target: conteneur.children[0] });
    expect(conteneur.children[0].classList.contains('humalis-pris')).toBe(true);
    conteneur.envoyer('keydown', { key: 'ArrowDown', target: conteneur.children[0] });
    expect(valeur.v).toEqual(['deux', 'un', 'trois']);
    await Promise.resolve();
    expect(conteneur.children[1].focused).toBe(true);
    conteneur.envoyer('keydown', { key: 'Escape', target: conteneur.children[1] });
    expect(valeur.v).toEqual(['un', 'deux', 'trois']);
    expect(ordre).not.toHaveBeenCalled();
    conteneur.envoyer('keydown', { key: ' ', target: conteneur.children[0] });
    conteneur.envoyer('keydown', { key: 'ArrowDown', target: conteneur.children[0] });
    conteneur.envoyer('keydown', { key: ' ', target: conteneur.children[1] });
    expect(ordre).toHaveBeenCalledTimes(1);
  });

  it('dépose au pointeur et retire ses écouteurs du document', async () => {
    const { listeDeplacable } = await charger(DEPLACEMENT_JS);
    const conteneur = new FauxElement('ul');
    for (const [i, nom] of ['a', 'b'].entries()) {
      const ligne = new FauxElement('li');
      ligne.textContent = nom;
      ligne.setAttribute('data-deplacable', '');
      ligne.setAttribute('data-top', String(i * 20));
      conteneur.append(ligne);
    }
    const valeur = boite(['a', 'b']);
    const ordre = vi.fn();
    listeDeplacable(conteneur, valeur, ordre);
    conteneur.envoyer('pointerdown', { target: conteneur.children[0] });
    documentFaux.envoyer('pointermove', { clientY: 35 });
    expect(conteneur.children[1].classList.contains('humalis-insertion-apres')).toBe(true);
    documentFaux.envoyer('pointerup', { clientY: 35 });
    expect(valeur.v).toEqual(['b', 'a']);
    expect(ordre).toHaveBeenCalledTimes(1);
    expect(documentFaux.listeners.get('pointermove')).toHaveLength(0);
  });

  it('affiche une icône, suit le libellé et garde plusieurs fichiers valides', async () => {
    const { choixFichier } = await charger(CHOIX_FICHIER_JS);
    const cadre = new FauxElement('div');
    const nom = boite('Ajouter');
    const valeur = boite<any>([]);
    choixFichier(cadre, { libelle: () => nom.v, boite: valeur, familles: [], plusieurs: true, apercu: false, iconeHtml: '<svg></svg>', classes: ['large'] });
    const [entree, bouton, erreur] = cadre.children;
    expect(bouton.className).toBe('humalis-fichier-bouton humalis-fichier-icone');
    expect(bouton.title).toBe('Ajouter');
    expect(bouton.querySelector('.humalis-fichier-libelle')?.textContent).toBe('Ajouter');
    nom.v = 'Joindre';
    expect(bouton.title).toBe('Joindre');
    entree.files = [fichier('voix.mp3', 'audio/mpeg', [1]), fichier('texte.txt', 'text/plain', [2])];
    entree.envoyer('change');
    await vi.waitFor(() => expect(valeur.v).toHaveLength(2));
    expect(valeur.v.map((f: any) => f.type)).toEqual(['fichier', 'fichier']);
    expect(cadre.children).toHaveLength(3);
    expect(erreur.hidden).toBe(true);
  });

  it('choisit, refuse et libère les aperçus', async () => {
    const creer = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:apercu');
    const liberer = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const { choixFichier } = await charger(CHOIX_FICHIER_JS);
    const cadre = new FauxElement('div');
    const valeur = boite<any>(null);
    choixFichier(cadre, { libelle: () => 'Photo', boite: valeur, familles: [{ nom: 'images', mime: ['image/png'] }], maximum: 100, plusieurs: false, apercu: true, classes: 'personnalise' });
    const [entree, bouton, erreur] = cadre.children;
    expect(cadre.className).toContain('humalis-fichier personnalise');
    expect(bouton.textContent).toBe('Photo');
    entree.files = [fichier('photo.png', 'image/png', [0x89, 80, 78, 71])];
    entree.envoyer('change');
    await vi.waitFor(() => expect(valeur.v?.nom).toBe('photo.png'));
    expect(valeur.v).toMatchObject({ type: 'image', apercu: 'blob:apercu' });
    expect(cadre.children[2].children[0].textContent).toBe('photo.png');
    expect(creer).toHaveBeenCalledTimes(1);
    entree.files = [fichier('faux.png', 'image/png', [1, 2, 3])];
    entree.envoyer('change');
    await vi.waitFor(() => expect(erreur.textContent).toBe("Ce fichier n'est pas une image."));
    expect(valeur.v).toBeNull();
    expect(liberer).toHaveBeenCalledWith('blob:apercu');
    entree.files = [fichier('lourd.png', 'image/png', [0x89, 80, 78, 71], 101)];
    entree.envoyer('change');
    await vi.waitFor(() => expect(erreur.textContent).toContain('le maximum est 100 octets.'));
    entree.files = [fichier('autre.png', 'image/png', [0x89, 80, 78, 71])];
    entree.envoyer('change');
    await vi.waitFor(() => expect(valeur.v?.nom).toBe('autre.png'));
    for (const nettoyer of nettoyages.splice(0)) nettoyer();
    expect(liberer).toHaveBeenCalledTimes(2);
  });
});
