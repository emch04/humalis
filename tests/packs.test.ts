import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';
import { PACKS, genreDeChangement, etatDesPacks, verifierProjet } from '../src/packs.js';

describe('les packs Astratra du compilateur', () => {
  it('liste chaque pack avec sa version exacte', () => {
    expect(PACKS.map((p) => p.nom)).toEqual([
      '@astratra/saas-kit',
      '@astratra/security',
      '@astratra/store-postgres',
      '@astratra/prerender',
    ]);
    for (const pack of PACKS) expect(pack.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('genreDeChangement', () => {
  it('reconnaît les trois genres de changement', () => {
    expect(genreDeChangement('2.0.1', '2.0.1')).toBe('a_jour');
    expect(genreDeChangement('2.0.1', '2.0.2')).toBe('correctif');
    expect(genreDeChangement('2.0.1', '2.1.0')).toBe('nouveautes');
    expect(genreDeChangement('2.0.1', '3.0.0')).toBe('grand_changement');
  });

  it('ne prend jamais une version plus ancienne ni illisible', () => {
    expect(genreDeChangement('2.0.1', '2.0.0')).toBe('plus_ancienne');
    expect(genreDeChangement('2.0.1', '1.9.9')).toBe('plus_ancienne');
    expect(genreDeChangement('2.0.1', '2.1.0-beta.1')).toBe('illisible');
    expect(genreDeChangement('2.0.1', 'n’importe quoi')).toBe('illisible');
  });
});

describe('etatDesPacks', () => {
  it('donne pour chaque pack la dernière version et le conseil à suivre', () => {
    const dernieres: Record<string, string> = {
      '@astratra/saas-kit': '2.0.2',
      '@astratra/security': '2.0.0',
    };
    const etat = etatDesPacks((nom) => dernieres[nom] ?? PACKS.find((p) => p.nom === nom)!.version);
    const saas = etat.find((l) => l.nom === '@astratra/saas-kit')!;
    expect(saas.genre).toBe('correctif');
    expect(saas.conseil).toContain('npm run essai:packs');
    const security = etat.find((l) => l.nom === '@astratra/security')!;
    expect(security.genre).toBe('grand_changement');
    expect(security.conseil).toContain('un plan');
    expect(etat.find((l) => l.nom === '@astratra/prerender')!.genre).toBe('a_jour');
  });

  it('dit quand npm ne répond pas', () => {
    const etat = etatDesPacks(() => undefined);
    expect(etat.every((l) => l.genre === 'inconnu' && l.derniere === undefined)).toBe(true);
    expect(etat[0].conseil).toContain('npm');
  });
});

describe('verifierProjet', () => {
  const serveurProduit = () => {
    const { application } = compiler(
      ['serveur "boutique" :', '    donnee produit :', '        nom : texte', '    route "produits" :', '        tout le monde peut lire produit'].join('\n'),
    );
    return genererProjetServeur(application!.serveurs[0], { nom: 'boutique', source: 'boutique.humalis' }).get('package.json')!;
  };

  it('ne signale rien pour un projet produit par ce compilateur', () => {
    expect(verifierProjet(serveurProduit())).toEqual([]);
  });

  it('signale un pack plus ancien que celui du compilateur', () => {
    const paquet = JSON.parse(serveurProduit());
    paquet.dependencies['@astratra/saas-kit'] = '1.9.0';
    const retards = verifierProjet(JSON.stringify(paquet));
    expect(retards).toHaveLength(1);
    expect(retards[0].nom).toBe('@astratra/saas-kit');
    expect(retards[0].message).toContain('recompile');
  });

  it('ignore les packs que le projet n’utilise pas', () => {
    expect(verifierProjet(JSON.stringify({ dependencies: { react: '19.3.1' } }))).toEqual([]);
  });

  it('dit en français qu’un package.json est illisible', () => {
    expect(() => verifierProjet('{ "dependencies": { "react": "1", } }')).toThrow(/le package\.json n'est pas un JSON valide/);
  });
});

describe('le démarrage du serveur produit', () => {
  it('lit le fichier .env, comme le dit le LISEZMOI (cp .env.exemple .env, puis npm start)', () => {
    const { application } = compiler(['serveur "boutique" :', '    donnee produit :', '        nom : texte'].join('\n'));
    const paquet = JSON.parse(genererProjetServeur(application!.serveurs[0], { nom: 'boutique', source: 'boutique.humalis' }).get('package.json')!);
    expect(paquet.scripts.start).toBe('node --env-file-if-exists=.env dist/src/demarrer.js');
  });
});
