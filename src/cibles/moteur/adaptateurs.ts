/**
 * Un seul contrat pour tout l'écosystème JavaScript :
 * `(element, proprietes) => nettoyage | { mettreAJour, detruire }`.
 * Un adaptateur transforme un composant d'un framework en ce contrat, et
 * n'est chargé que par les pages qui s'en servent.
 */
import { dependancesDesComposantsReact, paquetsImportes, VERSIONS_PAQUETS_REACT } from '../web/composants-react.js';
import { VERSIONS } from '../web/projet.js';
import type { ContexteMoteur } from './page.js';

export type SorteExterne = ContexteMoteur['externes'] extends Map<string, infer V> ? (V extends { sorte: infer S } ? S : never) : never;

/** Le nom de la balise d'un Web Component : celui donné à customElements.define. */
export function baliseDe(code: string): string | undefined {
  return /customElements\.define\(\s*['"]([a-z][a-z0-9-]*-[a-z0-9-]*)['"]/.exec(code)?.[1];
}

export function sorteDe(module: boolean, fichier: string, code = ''): SorteExterne {
  if (module) return 'module';
  if (baliseDe(code)) return 'web';
  if (fichier.endsWith('.vue')) return 'vue';
  if (fichier.endsWith('.svelte')) return 'svelte';
  return 'react';
}

export function paquetsDesExternes(codes: string[], sortes: Set<SorteExterne>): { dependances: Record<string, string>; dependancesDev: Record<string, string> } {
  const { dependances, dependancesDev } = dependancesDesComposantsReact(codes);
  void paquetsImportes;
  void VERSIONS_PAQUETS_REACT;
  if (sortes.has('react')) {
    dependances.react = VERSIONS.react;
    dependances['react-dom'] = VERSIONS.reactDom;
    dependancesDev['@vitejs/plugin-react'] = VERSIONS.pluginReact;
  }
  if (sortes.has('vue')) {
    dependances.vue = '3.5.45';
    dependancesDev['@vitejs/plugin-vue'] = '6.0.10';
  }
  if (sortes.has('svelte')) {
    dependances.svelte = '5.57.3';
    dependancesDev['@sveltejs/vite-plugin-svelte'] = '7.3.1';
  }
  return { dependances, dependancesDev };
}

export function adaptateursJs(externes: ContexteMoteur['externes']): string {
  const sortes = new Set([...externes.values()].map((e) => e.sorte));
  return `// Produit par Humalis : relie du JavaScript extérieur à la page, par un seul contrat.
import { effet, nettoyer, sansSuivi } from './moteur.js';

const fermer = (instance) => {
  if (typeof instance === 'function') instance();
  else instance?.detruire?.();
};

/** Le contrat commun : charge le module à part, lui donne ses propriétés, le nettoie à la fin. */
function monter(element, charger, lire) {
  let fini = false;
  let instance;
  let empreinte;
  let generation = 0;

  async function lancer(proprietes) {
    const moi = ++generation;
    const m = await charger();
    if (fini || moi !== generation) return;
    const rendu = await m.default(element, proprietes);
    if (fini || moi !== generation) fermer(rendu);
    else instance = rendu;
  }

  effet(() => {
    const proprietes = lire();
    const nouvelle = JSON.stringify(proprietes);
    if (nouvelle === empreinte) return;
    const premiere = empreinte === undefined;
    empreinte = nouvelle;
    sansSuivi(() => {
      if (premiere) return void lancer(proprietes).catch((erreur) => console.error(erreur));
      if (instance && typeof instance === 'object' && instance.mettreAJour) return instance.mettreAJour(proprietes);
      fermer(instance);
      instance = undefined;
      element.replaceChildren();
      lancer(proprietes).catch((erreur) => console.error(erreur));
    });
  });

  nettoyer(() => {
    fini = true;
    fermer(instance);
    instance = undefined;
    element.replaceChildren();
  });
}

export function monterModule(element, charger, lire) {
  monter(element, charger, lire);
}
${sortes.has('react') ? `
/** Un composant React : React n'est chargé que sur les pages qui s'en servent. */
export function monterReact(element, charger, lire) {
  monter(element, async () => {
    const [{ createElement }, { createRoot }, m] = await Promise.all([import('react'), import('react-dom/client'), charger()]);
    return {
      default(cadre, proprietes) {
        const racine = createRoot(cadre);
        const dessiner = (p) => racine.render(createElement(m.default, p));
        dessiner(proprietes);
        return { mettreAJour: dessiner, detruire: () => racine.unmount() };
      },
    };
  }, lire);
}
` : ''}${sortes.has('web') ? `
/** Un Web Component : le fichier définit sa balise ; les propriétés sont posées sur l'élément. */
export function monterWeb(element, charger, lire, balise) {
  monter(element, async () => {
    await charger();
    return {
      default(cadre, proprietes) {
        const composant = document.createElement(balise);
        const poser = (p) => Object.assign(composant, p);
        poser(proprietes);
        cadre.append(composant);
        return { mettreAJour: poser, detruire: () => composant.remove() };
      },
    };
  }, lire);
}
` : ''}${sortes.has('vue') ? `
/** Un composant Vue : Vue n'est chargé que sur les pages qui s'en servent. */
export function monterVue(element, charger, lire) {
  monter(element, async () => {
    const [{ createApp, reactive, h }, m] = await Promise.all([import('vue'), charger()]);
    return {
      default(cadre, proprietes) {
        const etat = reactive({ ...proprietes });
        const app = createApp({ render: () => h(m.default, { ...etat }) });
        app.mount(cadre);
        return { mettreAJour: (p) => Object.assign(etat, p), detruire: () => app.unmount() };
      },
    };
  }, lire);
}
` : ''}${sortes.has('svelte') ? `
/** Un composant Svelte : Svelte n'est chargé que sur les pages qui s'en servent. */
export function monterSvelte(element, charger, lire) {
  monter(element, async () => {
    const [{ mount, unmount }, m] = await Promise.all([import('svelte'), charger()]);
    return {
      default(cadre, proprietes) {
        const instance = mount(m.default, { target: cadre, props: proprietes });
        return { detruire: () => unmount(instance) };
      },
    };
  }, lire);
}
` : ''}
`;
}
