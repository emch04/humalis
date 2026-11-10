import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { compiler } from '../src/compilateur.js';
import { pourLaCible } from '../src/ri/plateforme.js';
import { verifierFormesPourLaCible, PREVUES, ECRITES } from '../src/cibles/formes.js';

/** Un programme qui écrit les 18 formes d'un coup. */
const TOUT = readFileSync(new URL('./formes/toutes.humalis', import.meta.url), 'utf8');

const compile = (source: string) => {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return application!;
};
const erreurs = (source: string) => compiler(source).diagnostics.filter((d) => d.gravite === 'erreur').map((d) => d.message);

describe('les formes d’application spéciales', () => {
  it('lit les dix-huit formes, et les range dans la représentation', () => {
    const app = compile(TOUT);
    const f = app.formes!;
    expect(f.widgets[0]).toMatchObject({ nom: 'solde', taille: 'petite', vers: 'compte', actualiser: { nombre: 30, unite: 'minutes' } });
    expect(f.widgets[0]!.ecran.vue.map((n) => n.type)).toEqual(['element', 'element']);
    expect(f.activites.map((a) => a.nom)).toEqual(['livraison']);
    expect(f.raccourcisIcone).toMatchObject([{ titre: 'Mon compte', page: 'compte', icone: 'user' }]);
    expect(f.commandesVocales.map((c) => [c.phrase, c.parametres, c.vers])).toEqual([['Mon solde', [], undefined], ['Voir {produit}', ['produit'], 'compte']]);
    expect(f.commandesVocales[0]!.ecran.gestionnaires[0]!.actions.map((a) => a.type)).toEqual(['dire']);
    expect(f.demarrage).toMatchObject({ discret: true });
    expect(f.recherches).toMatchObject([{ liste: 'produits', titre: 'nom', texte: 'description', vers: 'compte' }]);
    expect(f.tuiles[0]).toMatchObject({ nom: 'Pointer', icone: 'clock' });
    expect(f.minis).toMatchObject([{ nom: 'commander', page: 'compte' }]);
    expect(f.voitures[0]).toMatchObject({ nom: 'Livraisons', liste: 'produits', titre: 'nom', texte: 'description', vers: 'compte' });
    expect(f.menusClicDroit[0]).toMatchObject({ titre: 'Envoyer', extensions: ['.jpg', '.png'] });
    expect(f.claviers[0]!.touches).toMatchObject([{ texte: 'Bonjour', ecrit: 'Bonjour, comment allez-vous ?' }]);
    expect(f.partageRecu!.ecran.gestionnaires[0]!.actions.map((a) => a.type)).toEqual(['ajout', 'navigation']);
    expect(f.fichiersOuverts[0]!.extensions).toEqual(['.csv', '.pdf']);
    expect(app.ecrans.find((e) => e.nom === 'rapide')!.barreSysteme).toEqual({ icone: 'clock' });
    expect(app.ecrans.find((e) => e.nom === 'minuteur')!.appareil).toBe('montre');
    expect(JSON.stringify(app.ecrans.find((e) => e.nom === 'compte'))).toContain('"type":"activite","mode":"commencer","nom":"livraison"');
  });

  it('dit les fautes avec leur ligne', () => {
    const P = 'page "a" :\n    titre "A"\n';
    expect(erreurs(`widget "w" vers "inconnue" :\n    texte "{prix}"\n${P}`)).toEqual(["la page « inconnue » n'existe pas. Pages : a.", "le texte utilise {prix}, mais la variable « prix » n'est pas déclarée."]);
    expect(erreurs(`activite en direct "livraison" :\n    titre "x"\n${P}    bouton "b"\n    quand l'utilisateur clique sur "b" :\n        commencer activite "livrason"\n`)[0]).toContain('Peut-être « livraison » ?');
    expect(erreurs(`voiture "V" :\n    liste commandes avec titre nom\n${P}`)[0]).toContain("n'est ni une variable partagée ni une source");
    expect(erreurs(`${P}    dire "x"\n`)[0]).toContain('ne s\'utilise que dans un événement');
    expect(erreurs(`quand on ouvre un fichier ".csv" :\n    afficher "{fichier.nom} {fichier.type}"\n${P}`)).toEqual([]);
    expect(erreurs(`quand on partage vers l'application :\n    afficher "{partage.lien}"\n${P}`)).toEqual([]);
  });

  it('la montre et la télévision ne vivent que sur Apple et Android', () => {
    const app = compile(TOUT);
    for (const cible of ['apple', 'android']) expect(pourLaCible(app, cible).ecrans.some((e) => e.appareil === 'montre')).toBe(true);
    for (const cible of ['web', 'windows', 'desktop', 'statique']) expect(pourLaCible(app, cible).ecrans.some((e) => e.appareil !== undefined)).toBe(false);
  });

  it('une forme prévue mais pas écrite est refusée ; ailleurs, elle est ignorée et dite une fois', () => {
    const app = compile(TOUT);
    const web = verifierFormesPourLaCible(pourLaCible(app, 'web'), 'web');
    expect(web).toHaveLength(1);
    expect(web[0]).toMatchObject({ gravite: 'avertissement' });
    expect(web[0]!.message).toContain('le widget « solde »');
    // Une cible qui n'a pas encore écrit la forme la refuse, avec sa ligne (ici Apple, le temps du test).
    const ecrites = ECRITES.apple;
    delete ECRITES.apple;
    try {
      const apple = verifierFormesPourLaCible(pourLaCible(app, 'apple'), 'apple');
      expect(apple.find((d) => d.message.startsWith('le widget « solde »'))).toMatchObject({ gravite: 'erreur', ligne: 5 });
    } finally {
      if (ecrites) ECRITES.apple = ecrites;
    }
    // Chaque forme a au moins une cible prévue.
    for (const cibles of Object.values(PREVUES)) expect(cibles.length).toBeGreaterThan(0);
  });

  it('le serveur lit « mettre a jour activite » et les boutons d’une notification', () => {
    const source = `activite en direct "livraison" :\n    titre "En route"\nserveur "boutique" :\n    roles gerant\n    donnee commande :\n        total : nombre\n    route "commandes" :\n        seul gerant peut lire commande\n        seul gerant peut modifier commande\n        seul gerant peut faire "valider" sur commande :\n            envoyer notification aux gerant avec titre "Nouvelle" et texte "Commande" et boutons "Accepter" et "Refuser"\n            mettre a jour activite "livraison" pour gerant\nquand l'utilisateur touche "Accepter" dans une notification :\n    afficher "Acceptée"\npage "a" :\n    titre "A"\n`;
    const app = compile(source);
    const texte = JSON.stringify(app.serveurs);
    expect(texte).toContain('"boutons":["Accepter","Refuser"]');
    expect(texte).toContain('"type":"activite","nom":"livraison"');
    // Le serveur les écrit (APNs et FCM) : rien n'y est refusé.
    expect(verifierFormesPourLaCible(app, 'serveur').filter((d) => d.gravite === 'erreur')).toEqual([]);
  });
});
