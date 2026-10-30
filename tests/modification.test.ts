import { describe, it, expect } from 'vitest';
import { analyser } from '../src/lexer/lexer.js';
import { analyserSyntaxe } from '../src/parser/parser.js';
import { compiler } from './aide-qualite.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetMobile } from '../src/cibles/mobile/projet.js';
import { programme, erreurs, avertissements } from './analyse/aide.js';

// Sept lignes : la page commence ligne 8.
const SERVEUR = [
  'serveur "boutique" :',
  '>donnee produit :',
  '>>nom : texte',
  '>>prix : nombre',
  '>route "produits" :',
  '>>tout le monde peut lire produit',
  '>>seul admin peut modifier produit',
];

/** La page « gestion » : l'événement commence ligne 15, son action ligne 16. */
const gestion = (...actions: string[]) =>
  programme(
    ...SERVEUR,
    'page "gestion" :',
    '>variable produits = []',
    '>quand la page se charge :',
    '>>envoyer requete vers "produits" dans produits',
    '>pour chaque p dans produits :',
    '>>texte p.nom',
    '>>bouton "Changer"',
    '>>quand l\'utilisateur clique sur "Changer" :',
    ...actions.map((a) => `>>>${a}`),
  );

const projet = (source: string) => {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return genererProjetWeb(application!, { nom: 'boutique', adresse: 'https://boutique.exemple.cd', source: 'boutique.humalis' });
};

describe('modifier et supprimer — parser', () => {
  it('lit « supprimer p de "produits" »', () => {
    const corps = analyserSyntaxe(analyser(gestion('supprimer p de "produits"'))).pages[0].corps;
    const evenement = (corps[2] as { corps: { corps: unknown[] }[] }).corps[2];
    expect(evenement).toMatchObject({ corps: [{ type: 'Suppression', objet: { type: 'Reference', nom: 'p' }, adresse: 'produits', ligne: 16 }] });
  });

  it('lit « modifier p dans "produits" avec prix = … et nom = … »', () => {
    const corps = analyserSyntaxe(analyser(gestion('modifier p dans "produits" avec prix = p.prix - 1 et nom = "Livre"'))).pages[0].corps;
    const evenement = (corps[2] as { corps: { corps: unknown[] }[] }).corps[2];
    expect(evenement).toMatchObject({
      corps: [
        {
          type: 'Modification',
          objet: { type: 'Reference', nom: 'p' },
          adresse: 'produits',
          changements: [
            { champ: 'prix', valeur: { type: 'Calcul' } },
            { champ: 'nom', valeur: { type: 'Chaine' } },
          ],
        },
      ],
    });
  });
});

describe('modifier et supprimer — analyse', () => {
  it('accepte une modification correcte, et prévient que seul un admin peut', () => {
    const source = gestion('modifier p dans "produits" avec prix = p.prix - 1');
    expect(erreurs(source)).toEqual([]);
    expect(avertissements(source)).toEqual([
      '16 : seul un admin peut modifier « produit » : cette requête sera refusée à un visiteur.',
    ]);
  });

  it('prévient pour la suppression, que la règle « modifier » couvre aussi', () => {
    expect(avertissements(gestion('supprimer p de "produits"'))).toEqual([
      '16 : seul un admin peut supprimer « produit » : cette requête sera refusée à un visiteur.',
    ]);
  });

  it('refuse une route inconnue', () => {
    expect(erreurs(gestion('supprimer p de "produit"'))).toEqual([
      '16 : aucune route « produit » dans le serveur « boutique ». Routes : produits.',
    ]);
  });

  it('refuse un champ inconnu et un mauvais type', () => {
    expect(erreurs(gestion('modifier p dans "produits" avec prixx = 3'))).toEqual([
      '16 : la donnée « produit » n\'a pas de champ « prixx ». Champs : nom, prix. Peut-être « prix » ?',
    ]);
    expect(erreurs(gestion('modifier p dans "produits" avec prix = "gratuit"'))).toEqual([
      '16 : cette valeur est un texte ; le champ « prix » de « produit » attend un nombre.',
    ]);
  });

  it('refuse de supprimer autre chose qu’une donnée de la route', () => {
    const source = programme(
      ...SERVEUR,
      'page "gestion" :',
      '>variable nom = "Livre"',
      '>bouton "Supprimer"',
      '>quand l\'utilisateur clique sur "Supprimer" :',
      '>>supprimer nom de "produits"',
    );
    expect(erreurs(source)).toEqual([
      '12 : « nom » est un texte : « supprimer … de "produits" » attend un « produit » lu sur cette route (par exemple la variable d’une boucle « pour chaque p dans produits »).',
    ]);
  });

  it('refuse modifier ou supprimer en dehors d’un événement', () => {
    const source = programme(...SERVEUR, 'page "gestion" :', '>variable produits = []', '>pour chaque p dans produits :', '>>supprimer p de "produits"');
    expect(erreurs(source)).toContain(
      '11 : « supprimer » ne s\'utilise que dans un événement (quand …).',
    );
  });

  it('refuse modifier ou supprimer sans serveur dans le fichier', () => {
    const source = programme(
      'page "gestion" :',
      '>variable produits = []',
      '>pour chaque p dans produits :',
      '>>bouton "Supprimer"',
      '>>quand l\'utilisateur clique sur "Supprimer" :',
      '>>>supprimer p de "produits"',
    );
    expect(erreurs(source)).toEqual([
      '6 : « supprimer » demande un serveur dans le même fichier : ajoutez un bloc serveur "…" : avec la route « produits ».',
    ]);
  });
});

describe('modifier et supprimer — cibles', () => {
  const page = projet(gestion('modifier p dans "produits" avec prix = p.prix - 1', 'supprimer p de "produits"', 'envoyer requete vers "produits" dans produits')).get('src/pages/Gestion.tsx')!;

  it('appelle le serveur avec l’identifiant de la donnée', () => {
    expect(page).toContain('async function quandCliqueChanger(p: Produit) {');
    expect(page).toContain("await serveur.modifier('/api/produits', p.id, { prix: p.prix - 1 });");
    expect(page).toContain("await serveur.supprimer('/api/produits', p.id);");
  });

  it('le serveur produit envoie PATCH et DELETE, avec le jeton CSRF', () => {
    const serveur = projet(gestion('supprimer p de "produits"')).get('src/humalis/serveur.ts')!;
    expect(serveur).toContain("method: 'DELETE'");
    expect(serveur).toContain("method: 'PATCH'");
    expect(serveur).toContain('`${adresse}/${encodeURIComponent(id)}`');
    expect(serveur).toContain('supprimer(adresse: string, id: string): Promise<unknown>;');
  });

  it('le mobile fait de même', () => {
    const { application } = compiler(gestion('supprimer p de "produits"'));
    const fichiers = genererProjetMobile(application!, { nom: 'boutique', source: 'boutique.humalis' });
    expect(fichiers.get('app/index.tsx')).toContain("await serveur.supprimer('/api/produits', p.id);");
    expect(fichiers.get('humalis/serveur.ts')).toContain("method: 'DELETE'");
  });
});

import { genererProjetStatique } from '../src/cibles/statique/projet.js';

describe('modifier et supprimer — cible statique', () => {
  it('appelle le serveur avec l’identifiant de la donnée', () => {
    const { application } = compiler(gestion('modifier p dans "produits" avec prix = p.prix - 1', 'supprimer p de "produits"'));
    const fichiers = genererProjetStatique(application!, { nom: 'boutique', source: 'boutique.humalis' });
    const scripts = [...fichiers.values()].join('\n');
    expect(scripts).toContain("await serveur.modifier('/api/produits', p.id, { prix: p.prix - 1 });");
    expect(scripts).toContain("await serveur.supprimer('/api/produits', p.id);");
    expect(scripts).toContain("method: 'DELETE'");
  });
});
