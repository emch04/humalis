import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetMobile } from '../src/cibles/mobile/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { genererProjetMoteur } from '../src/cibles/moteur/projet.js';
import { genererProjetApple } from '../src/cibles/apple/projet.js';
import { espacerEnFrancais } from '../src/ri/typographie.js';
import { programme } from './analyse/aide.js';

const FINE = ' ';
const INSECABLE = ' ';
const OPTIONS = { nom: 'b', adresse: 'https://b.cd', source: 'b.humalis' };
const application = (source: string) => {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return application!;
};
const tout = (fichiers: Map<string, string>) => [...fichiers.values()].join('\n');

describe('les espaces insécables du français', () => {
  it('devant « ; : ? ! » et dans « », sans toucher aux adresses, aux heures ni au code', () => {
    expect(espacerEnFrancais('Bonjour !')).toBe(`Bonjour${FINE}!`);
    expect(espacerEnFrancais('Quoi? Vraiment?!')).toBe(`Quoi${FINE}? Vraiment${FINE}?!`);
    expect(espacerEnFrancais('Prix: 12 ; total : 20')).toBe(`Prix${INSECABLE}: 12${FINE}; total${INSECABLE}: 20`);
    expect(espacerEnFrancais('«Bonjour» et « au revoir »')).toBe(`«${FINE}Bonjour${FINE}» et «${FINE}au revoir${FINE}»`);
    expect(espacerEnFrancais('Ouvert à 9:30, ratio 1:2')).toBe('Ouvert à 9:30, ratio 1:2');
    expect(espacerEnFrancais('Voir https://exemple.fr/a?b=1&c=2 ou www.exemple.fr!')).toBe('Voir https://exemple.fr/a?b=1&c=2 ou www.exemple.fr!');
    expect(espacerEnFrancais('Écrire : mailto:contact@exemple.fr')).toBe(`Écrire${INSECABLE}: mailto:contact@exemple.fr`);
    expect(espacerEnFrancais('Déjà espacé !')).toBe(`Déjà espacé${FINE}!`);
  });

  it('dans les textes affichés de chaque cible : web, moteur, statique, mobile, Apple', () => {
    const source = programme('page "p" :', '>titre "Bonjour !"', '>variable nom = "Léa"', '>texte "Prix : 12 € ; merci {nom} !"', '>texte "Le code `a ; b` reste"', '>bouton "Envoyer ?"', '>quand l\'utilisateur clique sur "Envoyer ?" :', '>>afficher "Merci !"');
    const app = application(source);
    const web = genererProjetWeb(app, OPTIONS).get('src/pages/P.tsx')!;
    expect(web).toContain(`Bonjour${FINE}!`);
    expect(web).toContain(`Prix${INSECABLE}: 12 €${FINE}; merci `);
    expect(web).toContain(`\${nom}${FINE}!`);
    expect(web).toContain(`Envoyer${FINE}?`);
    expect(web).toContain(`Merci${FINE}!`);
    expect(web).toContain('a ; b');
    for (const [nom, sortie] of [
      ['moteur', tout(genererProjetMoteur(app, OPTIONS as never))],
      ['statique', tout(genererProjetStatique(app, OPTIONS as never))],
      ['mobile', tout(genererProjetMobile(app, OPTIONS as never))],
    ] as const) {
      expect(sortie, nom).toContain(`Bonjour${FINE}!`);
      expect(sortie, nom).toContain(`Merci${FINE}!`);
    }
    const apple = tout(genererProjetApple(app, OPTIONS as never).fichiers);
    expect(/Bonjour( |\\u\{202[fF]\})!/.test(apple)).toBe(true);
    expect(/Merci( |\\u\{202[fF]\})!/.test(apple)).toBe(true);
  });

  it('une valeur envoyée au serveur ou comparée reste telle qu’écrite', () => {
    const source = programme(
      'serveur "s" :',
      '>donnee avis :',
      '>>note : texte',
      '>route "avis" :',
      '>>tout le monde peut creer avis',
      '>>seul admin peut lire avis',
      '',
      'page "p" :',
      '>titre "P"',
      '>variable choix = "Oui !"',
      '>bouton "Noter"',
      '>quand l\'utilisateur clique sur "Noter" :',
      '>>si choix est egal a "Oui !" :',
      '>>>envoyer requete vers "avis" avec note = "Super !"',
    );
    const web = genererProjetWeb(application(source), OPTIONS).get('src/pages/P.tsx')!;
    expect(web).toContain("'Super !'");
    expect(web).toContain("'Oui !'");
    expect(web).not.toContain(`Super${FINE}`);
  });

  it('seulement en français : l’anglais d’un site bilingue reste tel quel', () => {
    const source = programme(
      'langues : francais, anglais',
      '',
      'page "p" :',
      '>titre "Bonjour !" en anglais "Hello!"',
      '>si langue est anglais :',
      '>>texte "Really?" sans traduction',
      '>sinon :',
      '>>texte "Vraiment?" sans traduction',
    );
    const web = tout(genererProjetWeb(application(source), OPTIONS));
    expect(web).toContain(`Bonjour${FINE}!`);
    expect(web).toContain('Hello!');
    expect(web).toContain('Really?');
    expect(web).toContain(`Vraiment${FINE}?`);
    // Un site dont la langue de base est l'anglais : seule la version française change.
    const anglais = programme('langues : anglais, francais', '', 'page "p" :', '>titre "Hello: welcome!" en francais "Bonjour : bienvenue !"');
    const sortie = tout(genererProjetWeb(application(anglais), OPTIONS));
    expect(sortie).toContain('Hello: welcome!');
    expect(sortie).toContain(`Bonjour${INSECABLE}: bienvenue${FINE}!`);
  });
});
