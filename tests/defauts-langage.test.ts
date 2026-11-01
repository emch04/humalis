import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { programme, erreurs } from './analyse/aide.js';

// Les défauts du langage trouvés en écrivant Rey Store, corrigés un par un (humalis-notes, 2026-11-01).
describe('défauts trouvés avec Rey Store', () => {
  it('le même bouton dans « si » et dans « sinon » : chaque événement vise celui de sa branche', () => {
    const source = programme(
      'page "p" :',
      '>titre "P"',
      '>variable replie = faux',
      '>si replie est vrai :',
      '>>bouton "Se déconnecter"',
      '>>quand l\'utilisateur clique sur "Se déconnecter" :',
      '>>>changer replie par faux',
      '>sinon :',
      '>>bouton "Se déconnecter"',
      '>>quand l\'utilisateur clique sur "Se déconnecter" :',
      '>>>changer replie par vrai',
    );
    expect(erreurs(source)).toEqual([]);
    const page = genererProjetWeb(compiler(source).application!, { nom: 'b', adresse: 'https://b.cd', source: 'b.humalis' }).get('src/pages/P.tsx')!;
    // Deux boutons, deux gestionnaires distincts.
    expect(page.match(/onClick=\{/g)?.length).toBe(2);
  });

  it('deux boutons de même nom au même niveau restent signalés', () => {
    const source = programme('page "p" :', '>titre "P"', '>bouton "Ok"', '>bouton "Ok"', '>quand l\'utilisateur clique sur "Ok" :', '>>afficher "a"');
    expect(erreurs(source).join('\n')).toMatch(/deux éléments s'appellent « Ok »/);
  });

  it('« champ "…" » se lit partout où une valeur est attendue : comparaison, « avec clé = », calcul', () => {
    const source = programme(
      'serveur "s" :',
      '>donnee alerte :',
      '>>telephone : texte',
      '>route "alertes" :',
      '>>tout le monde peut creer alerte',
      '>>seul admin peut lire alerte',
      '>>seul admin peut modifier alerte',
      '',
      'page "p" :',
      '>titre "P"',
      '>formulaire "f" :',
      '>>champ "Téléphone" avec obligatoire',
      '>>champ "Confirme" avec obligatoire',
      '>>bouton "Envoyer"',
      '>quand le formulaire "f" est soumis :',
      '>>si champ "Téléphone" est different de champ "Confirme" :',
      '>>>afficher erreur "Les deux numéros diffèrent."',
      '>>sinon :',
      '>>>envoyer requete vers "alertes" avec telephone = champ "Téléphone"',
    );
    expect(erreurs(source)).toEqual([]);
    const page = genererProjetWeb(compiler(source).application!, { nom: 'b', adresse: 'https://b.cd', source: 'b.humalis' }).get('src/pages/P.tsx')!;
    expect(page).toContain('champTelephone !== champConfirme');
    expect(page).toContain('{ telephone: champTelephone }');
  });

  it('« arrondi de (a - b) » : la parenthèse ouvre la valeur, ce n’est pas une fonction « arrondi »', () => {
    const source = programme('page "p" :', '>variable vendus = 7', '>variable rendus = 2', '>calcul part = arrondi de (vendus - rendus) * 100 / 7', '>titre "P"', '>texte "{part}"');
    expect(erreurs(source)).toEqual([]);
    expect(JSON.stringify(compiler(source).application!.ecrans[0])).toContain('"type":"arrondi"');
  });

  it('deux dates se comparent : « jour est superieur a debut » avec debut = aujourd’hui moins 7 jours', () => {
    const source = programme(
      'serveur "s" :',
      '>donnee commande :',
      '>>nom : texte',
      '>>jour : date',
      '>route "commandes" :',
      '>>tout le monde peut creer commande',
      '>>seul admin peut lire commande',
      '>>seul admin peut modifier commande',
      '',
      'page "p" :',
      '>titre "P"',
      '>variable commandes = []',
      '>quand la page se charge :',
      '>>envoyer requete vers "commandes" dans commandes',
      '>calcul debut = aujourd\'hui moins 7 jours',
      '>calcul recentes = commandes dont jour est superieur a debut',
      '>calcul combien = nombre de recentes',
      '>texte "{combien} commandes"',
    );
    expect(erreurs(source)).toEqual([]);
    // Un nombre ne se compare toujours pas à un texte qui n'est pas une date.
    expect(erreurs(programme('page "p" :', '>titre "P"', '>variable nom = "Rey"', '>si nom est superieur a 3 :', '>>texte "x"')).join('\n')).toMatch(/compare des nombres/);
  });

  it('le titre d’une section n’est pas un second titre principal', () => {
    const avertissements = compiler(programme('page "p" :', '>titre "P"', '>section "Les CGV" :', '>>texte "Bonjour"')).diagnostics.map((d) => d.message).join('\n');
    expect(avertissements).not.toMatch(/plusieurs titres principaux/);
    const deux = compiler(programme('page "p" :', '>titre "P"', '>titre "Q"')).diagnostics.map((d) => d.message).join('\n');
    expect(deux).toMatch(/plusieurs titres principaux/);
  });

  it('dans une boucle, un événement vise un bouton par son texte à {variables} (« Voir {c.nom} »)', () => {
    const source = programme(
      'page "p" :',
      '>titre "P"',
      '>variable clients = [fiche avec nom "Awa", fiche avec nom "Rey"]',
      '>pour chaque c dans clients :',
      '>>bouton "Voir {c.nom}"',
      '>>quand l\'utilisateur clique sur "Voir {c.nom}" :',
      '>>>afficher "{c.nom}"',
    );
    expect(erreurs(source)).toEqual([]);
  });
});
