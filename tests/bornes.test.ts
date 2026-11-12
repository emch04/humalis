import { describe, it, expect } from 'vitest';
import { stripTypeScriptTypes } from 'node:module';
import { compiler } from '../src/compilateur.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';
import { BORNES_TS, horsBornes } from '../src/cibles/serveur/bornes.js';

/**
 * Les limites sur les valeurs d'une donnée (revue du 12 novembre 2026, S7 ; phrases validées par le mainteneur) :
 * « nombre entre 0 et 100 », « au moins », « au plus », « entier », « texte de 2 a 80 caracteres »,
 * « au format email », « parmi "a" et "b" », « liste de … de 5 elements au plus ». Sans rien écrire,
 * un texte est limité à 10 000 caractères et une liste à 1 000 éléments.
 */
const programme = (...champs: string[]) => `serveur "boutique" :\n    donnee produit :\n${champs.map((c) => `        ${c}\n`).join('')}    route "produits" :\n        tout le monde peut lire produit\n        connecte peut creer produit\n        seul admin peut modifier produit\n        seul admin peut supprimer produit\n\npage "a" :\n    titre "A"\n`;
const erreurs = (...champs: string[]) => compiler(programme(...champs)).diagnostics.filter((d) => d.gravite === 'erreur').map((d) => d.message);
const bornesDe = (...champs: string[]) => {
  const { application, diagnostics } = compiler(programme(...champs));
  expect(diagnostics.filter((d) => d.gravite === 'erreur').map((d) => d.message)).toEqual([]);
  return Object.fromEntries(application!.serveurs[0]!.donnees[0]!.champs.map((c) => [c.nom, c.bornes]));
};

describe('les phrases des limites', () => {
  it('un nombre : entre, au moins, au plus, entier, et leurs combinaisons', () => {
    expect(bornesDe('prix : nombre entre 0 et 10000', 'stock : nombre entier au moins 0', 'remise : nombre au plus 50', 'temperature : nombre entre -20 et 45,5', 'pas : nombre entier entre 1 et 99')).toEqual({
      prix: { min: 0, max: 10000 },
      stock: { entier: true, min: 0 },
      remise: { max: 50 },
      temperature: { min: -20, max: 45.5 },
      pas: { entier: true, min: 1, max: 99 },
    });
  });

  it('un texte : longueur, format, valeurs permises', () => {
    expect(bornesDe('nom : texte de 2 a 80 caracteres', 'resume : texte de 500 caracteres au plus', 'code : texte de 4 caracteres au moins', 'contact : texte au format email', 'mobile : texte au format telephone', 'site_web : texte au format adresse web', 'statut : texte parmi "brouillon", "en_vente" et "epuise"')).toEqual({
      nom: { longueurMin: 2, longueurMax: 80 },
      resume: { longueurMax: 500 },
      code: { longueurMin: 4 },
      contact: { format: 'email' },
      mobile: { format: 'telephone' },
      site_web: { format: 'adresse_web' },
      statut: { parmi: ['brouillon', 'en_vente', 'epuise'] },
    });
  });

  it('une liste : le nombre d’éléments', () => {
    expect(bornesDe('photos : liste de texte de 5 elements au plus')).toEqual({ photos: { elementsMax: 5 } });
  });

  it('les accents et le pluriel sont libres, et une limite se combine avec les autres règles', () => {
    expect(bornesDe('nom : texte de 2 à 80 caractères non vide', 'code : texte de 1 caractere au moins', 'statut : texte parmi "a" et "b" au depart "a"', 'photos : liste de texte du site de 3 éléments au plus', 'ancien : nombre entre 1 et 5 (avant "note")')).toEqual({
      nom: { longueurMin: 2, longueurMax: 80 },
      code: { longueurMin: 1 },
      statut: { parmi: ['a', 'b'] },
      photos: { elementsMax: 3 },
      ancien: { min: 1, max: 5 },
    });
  });

  it('« au plus » suivi d’un champ garde son sens : le plafond lu dans une autre donnée', () => {
    const source = 'serveur "b" :\n    donnee zone :\n        commune : texte\n        prix : nombre\n    donnee envoi :\n        commune : texte\n        frais : nombre au plus prix de zone par commune\n    route "zones" :\n        tout le monde peut lire zone\n        seul admin peut modifier zone\n    route "envois" :\n        tout le monde peut lire envoi\n        connecte peut creer envoi\n        seul admin peut modifier envoi\n        seul admin peut supprimer envoi\n\npage "a" :\n    titre "A"\n';
    const { application, diagnostics } = compiler(source);
    expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    const frais = application!.serveurs[0]!.donnees[1]!.champs.find((c) => c.nom === 'frais')!;
    expect(frais.regle?.genre).toBe('auPlus');
    expect(frais.bornes).toBeUndefined();
  });

  it('une donnée sans limite n’en reçoit aucune', () => {
    expect(bornesDe('nom : texte', 'prix : nombre')).toEqual({ nom: undefined, prix: undefined });
  });
});

describe('les limites mal écrites', () => {
  it('une phrase incomplète dit comment l’écrire', () => {
    for (const champ of ['prix : nombre entre 0', 'prix : nombre entre 0 et', 'prix : nombre au moins', 'nom : texte de 80 caracteres', 'nom : texte au format fax', 'statut : texte parmi', 'photos : liste de texte de 5 elements']) {
      expect(erreurs(champ)[0], champ).toContain('cette limite n’est pas complète');
    }
  });

  it('une limite sur le mauvais type', () => {
    expect(erreurs('nom : texte entre 0 et 10')[0]).toBe('« nom » : « entre », « au moins », « au plus » et « entier » limitent un nombre ; ce champ est un texte.');
    expect(erreurs('prix : nombre de 2 a 80 caracteres')[0]).toBe('« prix » : une longueur, un format et « parmi » limitent un texte ; ce champ est un nombre.');
    expect(erreurs('prix : nombre au format email')[0]).toContain('limitent un texte');
    expect(erreurs('nom : texte de 5 elements au plus')[0]).toBe('« nom » : un nombre d’éléments limite une liste ; ce champ est un texte.');
    expect(erreurs('photos : liste de texte de 2 a 80 caracteres')[0]).toContain('limitent un texte ; ce champ est une liste');
    expect(erreurs('ouvert : booleen entier')[0]).toContain('limitent un nombre ; ce champ est un booléen');
  });

  it('une limite basse plus grande que la haute, une longueur qui n’est pas un entier positif', () => {
    expect(erreurs('prix : nombre entre 10 et 0')[0]).toBe('« prix » : la limite basse (10) dépasse la limite haute (0).');
    expect(erreurs('nom : texte de 80 a 2 caracteres')[0]).toBe('« nom » : la limite basse (80) dépasse la limite haute (2).');
    expect(erreurs('nom : texte de 2,5 caracteres au plus')[0]).toBe('« nom » : un nombre de caractères ou d’éléments est un entier, 1 ou plus.');
    expect(erreurs('photos : liste de texte de 0 elements au plus')[0]).toContain('est un entier, 1 ou plus');
  });

  it('« parmi » avec deux fois la même valeur', () => {
    expect(erreurs('statut : texte parmi "a", "b" et "a"')[0]).toBe('« statut » : « parmi » cite deux fois "a".');
  });

  it('une valeur de départ, ou une fiche de départ, qui ne respecte pas la limite', () => {
    expect(erreurs('statut : texte parmi "a" et "b" au depart "c"')[0]).toBe('« statut » : sa valeur de départ "c" ne respecte pas sa limite, elle doit être l’une de ces valeurs : a, b.');
    expect(erreurs('note : nombre entre 1 et 5 au depart 9')[0]).toContain('sa valeur de départ 9 ne respecte pas sa limite, elle doit être entre 1 et 5');
    const source = programme('nom : texte de 3 a 20 caracteres', 'prix : nombre au moins 2').replace('\npage', '    donnees de depart pour produit :\n        nom "Thé", prix 2\n        nom "Ca", prix 1\n\npage');
    expect(compiler(source).diagnostics.filter((d) => d.gravite === 'erreur').map((d) => d.message)).toEqual([
      'donnees de depart pour produit : « nom » doit avoir entre 3 et 20 caractères ("Ca").',
      'donnees de depart pour produit : « prix » doit être au moins 2 (1).',
    ]);
  });
});

describe('la vérification d’une valeur', () => {
  const cas: [unknown, Parameters<typeof horsBornes>[1], string | undefined][] = [
    [5, { min: 0, max: 10 }, undefined],
    [0, { min: 0, max: 10 }, undefined],
    [10, { min: 0, max: 10 }, undefined],
    [-1, { min: 0, max: 10 }, 'doit être entre 0 et 10'],
    [11, { min: 0, max: 10 }, 'doit être entre 0 et 10'],
    [-1, { min: 0 }, 'doit être au moins 0'],
    [51, { max: 50 }, 'doit être au plus 50'],
    [1.5, { entier: true }, 'doit être un nombre entier'],
    [2, { entier: true, min: 1 }, undefined],
    [-5, {}, undefined],
    ['ab', { longueurMin: 2, longueurMax: 4 }, undefined],
    ['a', { longueurMin: 2, longueurMax: 4 }, 'doit avoir entre 2 et 4 caractères'],
    ['abcde', { longueurMin: 2, longueurMax: 4 }, 'doit avoir entre 2 et 4 caractères'],
    ['abcde', { longueurMax: 4 }, 'doit avoir au plus 4 caractères'],
    ['', { longueurMin: 1 }, 'doit avoir au moins 1 caractères'],
    ['éà😀', { longueurMax: 3 }, undefined],
    ['a@b.fr', { format: 'email' }, undefined],
    ['a@b', { format: 'email' }, 'doit être une adresse e-mail'],
    ['a b@c.fr', { format: 'email' }, 'doit être une adresse e-mail'],
    ['', { format: 'email' }, 'doit être une adresse e-mail'],
    ['+33 6 12 34 56 78', { format: 'telephone' }, undefined],
    ['06.12.34.56.78', { format: 'telephone' }, undefined],
    ['appelle-moi', { format: 'telephone' }, 'doit être un numéro de téléphone'],
    ['12', { format: 'telephone' }, 'doit être un numéro de téléphone'],
    ['https://exemple.fr/a?b=1', { format: 'adresse_web' }, undefined],
    ['javascript:alert(1)', { format: 'adresse_web' }, 'doit être une adresse web (https://…)'],
    ['exemple.fr', { format: 'adresse_web' }, 'doit être une adresse web (https://…)'],
    ['b', { parmi: ['a', 'b'] }, undefined],
    ['c', { parmi: ['a', 'b'] }, 'doit être l’une de ces valeurs : a, b'],
    [['a', 'b'], { elementsMax: 2 }, undefined],
    [['a', 'b', 'c'], { elementsMax: 2 }, 'doit avoir au plus 2 éléments'],
    // Sans rien écrire : 10 000 caractères, 1 000 éléments ; une image choisie dans la page garde sa propre limite.
    ['a'.repeat(10_000), undefined, undefined],
    ['a'.repeat(10_001), undefined, 'doit avoir au plus 10000 caractères'],
    ['a'.repeat(10_001), { longueurMax: 20_000 }, undefined],
    ['data:image/png;base64,' + 'A'.repeat(50_000), undefined, undefined],
    ['data:image/png;base64,' + 'A'.repeat(95_000), undefined, 'doit avoir au plus 95000 caractères'],
    [Array(1_000).fill('a'), undefined, undefined],
    [Array(1_001).fill('a'), undefined, 'doit avoir au plus 1000 éléments'],
    [['a'.repeat(10_001)], undefined, 'a un élément qui doit avoir au plus 10000 caractères'],
    [true, { min: 0 }, undefined],
    [null, { longueurMin: 2 }, undefined],
  ];

  it('chaque cas, par la fonction du compilateur (celle de « humalis lancer »)', () => {
    for (const [valeur, bornes, attendu] of cas) expect(horsBornes(valeur, bornes), JSON.stringify([String(valeur).slice(0, 30), bornes])).toBe(attendu);
  });

  it('et les mêmes cas par le code écrit dans le serveur produit : les deux ne divergent pas', async () => {
    const module = (await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(BORNES_TS)).toString('base64')}`)) as { horsBornes: typeof horsBornes };
    for (const [valeur, bornes, attendu] of cas) expect(module.horsBornes(valeur, bornes), JSON.stringify([String(valeur).slice(0, 30), bornes])).toBe(attendu);
  });
});

describe('le serveur produit', () => {
  const fichiers = (...champs: string[]) => genererProjetServeur(compiler(programme(...champs)).application!.serveurs[0]!, { nom: 'b', source: 'b.humalis' });

  it('reçoit les limites de chaque champ, à la création et à la modification', () => {
    const serveur = fichiers('nom : texte de 2 a 80 caracteres', 'prix : nombre entre 0 et 10000').get('src/serveur.ts')!;
    const lignes = serveur.split('\n').filter((l) => l.includes('verifierEnvoi(SCHEMA_PRODUIT'));
    expect(lignes).toHaveLength(2);
    for (const ligne of lignes) expect(ligne).toContain('bornes: {"nom":{"longueurMin":2,"longueurMax":80},"prix":{"min":0,"max":10000}}');
  });

  it('vérifie toujours les limites par défaut, même sans aucune règle', () => {
    const verifier = fichiers('nom : texte').get('src/humalis/verifier.ts')!;
    expect(verifier).toContain('export function horsBornes(');
    expect(verifier).toContain('const faute = horsBornes(recu, regles.bornes?.[champ]);');
  });

  it('ses propres tests envoient des exemples qui respectent les limites', () => {
    const tests = fichiers('nom : texte de 2 a 4 caracteres', 'contact : texte au format email', 'statut : texte parmi "ouvert" et "ferme"', 'prix : nombre entier entre 10 et 20', 'tel : texte au format telephone', 'lien : texte au format adresse web').get('tests/regles.test.ts')!;
    expect(tests).toContain(`nom: 'exem', contact: 'a@exemple.fr', statut: 'ouvert', prix: 10, tel: '+33123456789', lien: 'https://exemple.fr'`);
  });
});

describe('« humalis lancer » (la machine)', () => {
  it('applique les mêmes limites, écrites ou par défaut', async () => {
    const { verifierEnvoi } = await import('../src/machine/serveur/base.js');
    const schema = { nom: 'texte', prix: 'nombre' } as const;
    const bornes = { nom: { longueurMin: 2, longueurMax: 5 }, prix: { min: 0 } };
    expect(verifierEnvoi(schema, { nom: 'Thé', prix: 2 }, true, { bornes })).toEqual({ valeur: { nom: 'Thé', prix: 2 } });
    expect(verifierEnvoi(schema, { nom: 'T', prix: 2 }, true, { bornes })).toEqual({ erreur: 'le champ « nom » doit avoir entre 2 et 5 caractères' });
    expect(verifierEnvoi(schema, { prix: -1 }, false, { bornes })).toEqual({ erreur: 'le champ « prix » doit être au moins 0' });
    expect(verifierEnvoi(schema, { nom: 'a'.repeat(10_001), prix: 1 }, true)).toEqual({ erreur: 'le champ « nom » doit avoir au plus 10000 caractères' });
  });
});

describe('la vérification dans la page, avant l’envoi', () => {
  const SOURCE = 'serveur "b" :\n    donnee produit :\n        nom : texte de 2 a 20 caracteres\n        prix : nombre entre 0 et 1000\n        note : texte\n    route "produits" :\n        tout le monde peut lire produit\n        tout le monde peut creer produit\n        seul admin peut modifier produit\n        seul admin peut supprimer produit\n\npage "accueil" :\n    variable nom = "Stylo"\n    variable prix = 3\n    titre "Ajouter"\n    bouton "Envoyer"\n    quand l\'utilisateur clique sur "Envoyer" :\n        envoyer requete vers "produits" avec nom et prix\n';

  it('le code des pages est le même que celui du serveur, sans ses types', async () => {
    const { BORNES_JS, codeAvantEnvoi } = await import('../src/cibles/serveur/bornes.js');
    expect(BORNES_JS).not.toMatch(/: unknown|: Bornes|interface /);
    const module = (await import(`data:text/javascript;base64,${Buffer.from(codeAvantEnvoi({ '/api/produits': { nom: { longueurMin: 2, longueurMax: 20 }, prix: { min: 0, max: 1000 } }, '/api/avis': {} }) + '\nexport { fauteAvantEnvoi, horsBornes };').toString('base64')}`)) as { fauteAvantEnvoi(adresse: string, options: { method: string; body?: string }): string | undefined; horsBornes: typeof horsBornes };
    const envoi = (method: string, adresse: string, corps: unknown) => module.fauteAvantEnvoi(adresse, { method, body: JSON.stringify(corps) });
    expect(envoi('POST', '/api/produits', { nom: 'Stylo', prix: 3 })).toBeUndefined();
    expect(envoi('POST', '/api/produits', { nom: 'S', prix: 3 })).toBe('Le champ « nom » doit avoir entre 2 et 20 caractères.');
    expect(envoi('PATCH', '/api/produits/abc', { prix: -1 })).toBe('Le champ « prix » doit être entre 0 et 1000.');
    // Les limites par défaut valent aussi dans la page, sur une route sans limite écrite.
    expect(envoi('POST', '/api/avis', { texte: 'a'.repeat(10_001) })).toBe('Le champ « texte » doit avoir au plus 10000 caractères.');
    // Rien d'autre n'est jugé ici : une lecture, une action, la synchronisation, une adresse inconnue.
    expect(module.fauteAvantEnvoi('/api/produits', { method: 'GET' })).toBeUndefined();
    expect(envoi('PATCH', '/api/produits/faire/solder/abc', { prix: -1 })).toBeUndefined();
    expect(envoi('POST', '/api/produits/synchro', { prix: -1 })).toBeUndefined();
    expect(envoi('POST', '/auth/login', { email: 'a'.repeat(20_000) })).toBeUndefined();
    expect(module.fauteAvantEnvoi('/api/produits', { method: 'POST', body: '{cassé' })).toBeUndefined();
    // Les mêmes cas que le serveur, pour quelques valeurs.
    expect(module.horsBornes('a@b', { format: 'email' })).toBe(horsBornes('a@b', { format: 'email' }));
  });

  it('le site web et le site statique portent les limites de chaque route et les consultent avant d’envoyer', async () => {
    const { genererProjetMoteur } = await import('../src/cibles/moteur/projet.js');
    const { genererProjetStatique } = await import('../src/cibles/statique/projet.js');
    const application = compiler(SOURCE).application!;
    const web = genererProjetMoteur(application, { nom: 'e', source: 'e.humalis' }).get('src/humalis/serveur.js') as string;
    const statique = genererProjetStatique(application, { nom: 'e', source: 'e.humalis' }).get('humalis/humalis.js') as string;
    for (const code of [web, statique]) {
      expect(code).toContain('const LIMITES = {"/api/produits":{"nom":{"longueurMin":2,"longueurMax":20},"prix":{"min":0,"max":1000}}};');
      expect(code).toContain('fauteAvantEnvoi(adresse, options)');
      expect(code).toContain('if (fauteLocale) throw new Error(fauteLocale);');
    }
  });
});

describe('la vérification dans les applications natives, avant l’envoi', () => {
  // Les trois écritures sont compilées et comparées au serveur, cas par cas, par scripts/essai-limites-natives.mjs
  // (Swift, Kotlin et C# : 51 cas sur 51). Ici : chaque projet porte son fichier, sa table et l'appel avant l'envoi.
  const SOURCE = 'serveur "b" :\n    donnee produit :\n        nom : texte de 2 a 20 caracteres\n        prix : nombre entre 0 et 1000,5\n        statut : texte parmi "brouillon" et "en_vente"\n    route "produits" :\n        tout le monde peut lire produit\n        tout le monde peut creer produit\n        seul admin peut modifier produit\n        seul admin peut supprimer produit\n\npage "accueil" :\n    variable nom = "Stylo"\n    variable prix = 3\n    titre "Ajouter"\n    bouton "Envoyer"\n    quand l\'utilisateur clique sur "Envoyer" :\n        envoyer requete vers "produits" avec nom et prix et statut = "brouillon"\n';
  const application = () => compiler(SOURCE).application!;

  it('Apple : Limites.swift, et l’appel au serveur le consulte', async () => {
    const { genererProjetApple } = await import('../src/cibles/apple/projet.js');
    const { fichiers } = genererProjetApple(application(), { nom: 'essai', source: 'essai.humalis' } as never);
    const limites = [...fichiers].find(([nom]) => nom.endsWith('Humalis/Limites.swift'))?.[1] as string;
    expect(limites).toContain('"/api/produits": ["nom": BornesHumalis(longueurMin: 2, longueurMax: 20), "prix": BornesHumalis(min: 0.0, max: 1000.5), "statut": BornesHumalis(parmi: ["brouillon", "en_vente"])]');
    const serveur = [...fichiers].find(([nom]) => nom.endsWith('Humalis/Serveur.swift'))?.[1] as string;
    expect(serveur).toContain('if source == nil, let envoi, let faute = Limites.faute(adresse, verbe, id, envoi) { throw ErreurHumalis.refus(faute) }');
  });

  it('Android : Limites.kt dans le paquet de l’application, et l’appel au serveur le consulte', async () => {
    const { genererProjetAndroid } = await import('../src/cibles/android/projet.js');
    const { fichiers } = genererProjetAndroid(application(), { nom: 'essai', source: 'essai.humalis', identifiant: 'dev.exemple.essai' } as never);
    const limites = [...fichiers].find(([nom]) => nom.endsWith('/Limites.kt'))?.[1] as string;
    expect(limites).toContain('package dev.exemple.essai');
    expect(limites).toContain('"/api/produits" to mapOf<String, BornesHumalis>("nom" to BornesHumalis(longueurMin = 2, longueurMax = 20), "prix" to BornesHumalis(min = 0.0, max = 1000.5), "statut" to BornesHumalis(parmi = listOf("brouillon", "en_vente")))');
    const serveur = [...fichiers].find(([nom]) => nom.endsWith('/Serveur.kt'))?.[1] as string;
    expect(serveur).toContain('if (source == null && envoi != null) Limites.faute(adresse, verbe, id, envoi)?.let { throw ErreurHumalis(it) }');
  });

  it('Windows : Limites.cs, et l’appel au serveur le consulte', async () => {
    const { genererProjetWindows } = await import('../src/cibles/windows/projet.js');
    const { fichiers } = genererProjetWindows(application(), { nom: 'essai', source: 'essai.humalis' } as never);
    const limites = fichiers.get('Humalis/Limites.cs')!;
    expect(limites).toContain('["/api/produits"] = new() { ["nom"] = new BornesHumalis(LongueurMin: 2, LongueurMax: 20), ["prix"] = new BornesHumalis(Min: 0.0, Max: 1000.5), ["statut"] = new BornesHumalis(Parmi: new[] { "brouillon", "en_vente" }) },');
    expect(fichiers.get('Humalis/Serveur.cs')).toContain('if (source is null && envoi is not null && Limites.Faute(adresse, verbe, id, envoi) is string faute) throw new ErreurHumalis(faute);');
  });
});
