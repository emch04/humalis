import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter, matchRoutes } from 'react-router';
import type { ReactElement } from 'react';
import { Vocabulaire } from '../src/pages/documentation/Vocabulaire';
import { Accueil } from '../src/pages/Accueil';
import { Erreurs } from '../src/pages/documentation/Erreurs';
import { Introuvable } from '../src/pages/Introuvable';
import { routes } from '../src/routes';
import { SOMMAIRE } from '../src/contenu/sommaire';
import { TABLE } from '../src/vocabulaire/adaptateur';
import { ENTREES_ERREURS } from '../src/contenu/erreurs';
import { EXEMPLES } from '../src/contenu/exemples';
import { ETAT } from '../src/contenu/etat';

const rendre = (element: ReactElement, chemin = '/') =>
  renderToStaticMarkup(<MemoryRouter initialEntries={[chemin]}>{element}</MemoryRouter>);

/** Le texte de la page sans les blocs de code (les programmes d'exemple peuvent dire « votre »). */
const sansCode = (html: string) => html.replace(/<pre[\s\S]*?<\/pre>/g, '').replace(/<code>[\s\S]*?<\/code>/g, '');

describe('page vocabulaire', () => {
  const html = rendre(<Vocabulaire />, '/documentation/vocabulaire');

  it('liste toutes les entrées de la table', () => {
    expect((html.match(/data-mot="/g) ?? []).length).toBe(TABLE.length);
    for (const e of TABLE) expect(html).toContain(`data-mot="${e.mot}"`);
    expect(html).toContain(`data-total="${TABLE.length}"`);
  });

  it('a un seul h1', () => {
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
  });

  it('affiche le statut de chaque mot en texte (pas seulement en couleur)', () => {
    expect(html).toMatch(/réservé/);
    expect(html).toMatch(/contextuel/);
    expect(html).toMatch(/disponible/);
  });
});

describe('page des erreurs', () => {
  const html = rendre(<Erreurs />, '/documentation/erreurs');
  it('affiche une fiche par entrée du catalogue', () => {
    for (const e of ENTREES_ERREURS) expect(html).toContain(`id="${e.id}"`);
  });
  it('montre de vrais messages « Ligne N : »', () => {
    expect(html).toMatch(/Ligne \d+ : la page « accueil » est déjà déclarée plus haut/);
  });
});

describe('vitrine', () => {
  const html = rendre(<Accueil />);

  it('un seul h1, et l’exemple de la vitrine existe', () => {
    expect((html.match(/<h1/g) ?? []).length).toBe(1);
    expect(EXEMPLES.find((e) => e.id === 'accueil-vitrine')).toBeDefined();
  });

  it('ne promet pas ce qui n’existe pas', () => {
    expect(html).not.toMatch(/télécharger|installer humalis|essayez en ligne|bientôt/i);
    expect(html).toMatch(/feuille de route/i);
    // Ce qui n'est pas encore essayé sur un vrai appareil est dit.
    expect(html).toMatch(/pas encore essayée sur un Mac/);
    expect(html).not.toMatch(/ne produit pas encore d’application|pas encore dans un navigateur/i);
    expect(html).toMatch(/site web React prérendu/);
  });

  it('l’état du projet reflète le README', () => {
    expect(ETAT.find((l) => l.nom === 'Lexer')?.fait).toBe(true);
    expect(ETAT.find((l) => l.nom === 'Cible web (React, prérendue)')?.fait).toBe(true);
    expect(ETAT.find((l) => l.nom === 'Cible serveur (Node + packs Astratra)')?.fait).toBe(true);
    expect(ETAT.find((l) => l.nom === 'Cible desktop (Electron)')?.fait).toBe(true);
  });

  it('tutoie le lecteur, jamais de vouvoiement', () => {
    expect(sansCode(html)).not.toMatch(/\b(vous|vos|votre)\b/i);
    expect(sansCode(html)).toMatch(/\b(tu|ton|ta)\b/i);
  });
});

describe('routes', () => {
  it('chaque page du sommaire a sa route', () => {
    for (const e of SOMMAIRE) {
      const trouvees = matchRoutes(routes, e.chemin);
      expect(trouvees?.at(-1)?.route.path, e.chemin).toBe(e.chemin.slice(1));
    }
  });
  it('une adresse inconnue tombe sur « page introuvable »', () => {
    expect(matchRoutes(routes, '/nimporte/quoi')?.at(-1)?.route.path).toBe('*');
    expect(rendre(<Introuvable />)).toContain('Page introuvable');
  });
});

describe('chaque page de la documentation se rend sans erreur, avec un seul h1', () => {
  for (const e of SOMMAIRE) {
    it(e.chemin, () => {
      const trouvees = matchRoutes(routes, e.chemin)!;
      const element = trouvees.at(-1)!.route.element as ReactElement;
      const html = rendre(element, e.chemin);
      expect((html.match(/<h1/g) ?? []).length).toBe(1);
      expect(sansCode(html)).not.toMatch(/\b(vous|vos|votre)\b/i);
      expect(html).toContain(e.titre.replace(/’/g, '&#x27;').slice(0, 5));
    });
  }
});
