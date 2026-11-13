import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { compiler } from '../src/compilateur.js';
import { genererProjetDesktop } from '../src/cibles/desktop/projet.js';
import { LOGIQUE } from '../src/cibles/serveur/logique.js';
import { SYNCHRO, tablesSynchro } from '../src/cibles/serveur/synchro.js';
import { SYNCHRO_SQLITE } from '../src/cibles/serveur/sqlite.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { genererProjetApple } from '../src/cibles/apple/projet.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';

/** La seconde passe de la revue Codex (12 novembre 2026) : les défauts de justesse 4, 5, 7 et 8. */
describe('la revue Codex : justesse', () => {
  it('4) le journal de synchronisation rend les mêmes champs qu’une lecture ordinaire (PostgreSQL et SQLite)', () => {
    const source = 'serveur "s" :\n    donnee note :\n        texte : texte\n    route "notes" :\n        connecte peut lire note\n        connecte peut creer note\n        connecte peut modifier note\n        connecte peut supprimer note\n\npage "a" :\n    titre "A"\n';
    const { application, diagnostics } = compiler(source);
    expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    const serveur = application!.serveurs[0]!;
    // Une route suivie par une application (« synchronisee avec "notes" » dans une page).
    const suivi = { ...serveur, routes: serveur.routes.map((r) => (r.adresse === 'notes' ? { ...r, synchronisee: true } : r)) } as typeof serveur;
    expect(tablesSynchro(suivi, (d) => d)).toContain('champs: ["texte"');
    for (const code of [SYNCHRO, SYNCHRO_SQLITE]) expect(code).toContain('ficheRendue(');
  });

  it('5) le relais de l’application de bureau garde la clé d’un envoi (pas de commande en double)', () => {
    const { application } = compiler('page "a" :\n    titre "A"\n');
    const fichiers = genererProjetDesktop(application!, { nom: 'a', source: 'a.humalis' });
    const principal = [...fichiers.entries()].find(([chemin, code]) => chemin.startsWith('electron/') && code.includes('async function relayer'))?.[1] ?? '';
    expect(principal).toContain("'x-humalis-envoi'");
  });

  it('7) une tâche planifiée qui échoue rend sa période et sera retentée', () => {
    expect(LOGIQUE).toContain('await reclamer.rendre?.(tache.nom, prise)');
    expect(LOGIQUE).toContain("UPDATE humalis_taches SET periode = ''");
  });

  it('8) la moitié s’éloigne de zéro sur toutes les cibles : 2,5 → 3 et -2,5 → -3', () => {
    const source = 'page "a" :\n    variable x = -2.5\n    titre "A"\n    texte "{arrondi de x}"\n';
    const { application, diagnostics } = compiler(source);
    expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    const web = [...genererProjetWeb(application!, { nom: 'a', adresse: 'https://a.cd', source: 'a.humalis' }).values()].join('\n');
    const expression = /\(\(n\) => Math\.sign\(n\) \* Math\.round\(Math\.abs\(n\) \* 1\) \/ 1\)/.exec(web)?.[0];
    expect(expression).toBeDefined();
    const arrondir = new Function('v', `return ${expression}(v);`) as (v: number) => number;
    expect([arrondir(2.5), arrondir(-2.5), arrondir(-2.4), arrondir(0)]).toEqual([3, -3, -2, 0]);
    expect(genererProjetStatique(application!, { nom: 'a', source: 'a.humalis' }).get('index.html')).toContain('-3');
  });

  it('troisième passe : « longueur » compte les caractères Unicode partout (« 😀 » vaut 1)', () => {
    const source = 'page "a" :\n    variable mot = "😀é"\n    variable taille = longueur de mot\n    titre "A"\n    texte "{taille}"\n';
    const { application } = compiler(source);
    const web = [...genererProjetWeb(application!, { nom: 'a', adresse: 'https://a.cd', source: 'a.humalis' }).values()].join('\n');
    expect(web).toContain('Array.from(');
    expect(Array.from('😀é').length).toBe(2);
    const apple = [...genererProjetApple(application!, { nom: 'a', source: 'a.humalis' }).fichiers.values()].join('\n');
    expect(apple).toContain('.unicodeScalars.count');
    expect(genererProjetStatique(application!, { nom: 'a', source: 'a.humalis' }).get('index.html')).toContain('>2<');
  });

  it('troisième passe : en Swift, une variable n’en initialise pas une autre', () => {
    const source = 'page "a" :\n    variable mot = "😀"\n    variable taille = longueur de mot\n    titre "A"\n    texte "{taille}"\n';
    const apple = [...genererProjetApple(compiler(source).application!, { nom: 'a', source: 'a.humalis' }).fichiers.values()].join('\n');
    expect(apple).toContain('@State private var taille: Double = Double("😀".unicodeScalars.count)');
    expect(apple).not.toMatch(/@State private var taille: Double = Double\(mot\./);
  });

  it('troisième passe : le service systemd peut écrire la base SQLite dans « donnees »', () => {
    const source = 'serveur "s" :\n    donnee note :\n        texte : texte\n    route "notes" :\n        connecte peut lire note\n\npage "a" :\n    titre "A"\n';
    const fichiers = genererProjetServeur(compiler(source).application!.serveurs[0]!, { nom: 's', source: 's.humalis' });
    const service = [...fichiers.entries()].find(([chemin]) => /^deploiement\/[^/]+\.service$/.test(chemin) && !chemin.includes('sauvegarde'))?.[1] ?? '';
    expect(service).toMatch(/ReadWritePaths=\S+\/sauvegardes \S+\/donnees/);
  });

  it('le test produit d’une somme lit une fiche que le compte qui essaie peut lire (« seul son auteur »)', () => {
    const source = readFileSync('tests/serveur-attaques-codex.humalis', 'utf8');
    const { application } = compiler(source);
    const regles = genererProjetServeur(application!.serveurs[0]!, { nom: 'essai', source: 'essai.humalis' }).get('tests/regles.test.ts')!;
    const essai = regles.slice(regles.indexOf('« total » est recalculé depuis « note »'));
    // La note est réservée à son auteur : l'essai crée un compte, lui donne la note, et envoie avec son jeton.
    expect(essai).toContain("const auteur = await nouveauCompte('utilisateur');");
    expect(essai).toContain('prix: 7, auteur: auteur.id }');
    expect(essai.slice(0, essai.indexOf('\n    });'))).toContain('Bearer ${auteur.jeton}');
    // Une fiche lue par tout compte connecté garde l'essai ordinaire.
    const produit = regles.slice(regles.indexOf('« total » est recalculé depuis « produit »'));
    expect(produit.slice(0, produit.indexOf('\n    });'))).not.toContain('nouveauCompte');
  });
});

