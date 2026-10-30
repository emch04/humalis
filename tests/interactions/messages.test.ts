import { describe, it, expect } from 'vitest';
import { compiler } from '../../src/compilateur.js';
import { auClic, p, corps, web, statique, mobile, desktop, fichier, erreurs, avertissements } from './aide.js';

const MESSAGES = auClic(
  [
    'afficher reussite "Enregistré"',
    'afficher "Brouillon sauvegardé" pendant 10 secondes',
    'afficher avertissement "Connexion lente"',
    'afficher erreur "Impossible d’enregistrer" sans disparaitre',
    'afficher reussite "Produit retiré" avec action "Annuler" :',
    '>ajouter "Robe" a panier',
  ],
  ['>variable panier = []'],
);

describe('messages — le parser', () => {
  it('lit le genre, la durée, « sans disparaitre » et le bouton', () => {
    const evenement = corps(MESSAGES).find((i) => i.type === 'Evenement') as any;
    const [reussite, duree, avertissement, erreur, action] = evenement.corps;
    expect(reussite.message).toEqual({ genre: 'reussite' });
    expect(duree.message.duree.unite).toBe('seconde');
    expect(avertissement.message).toEqual({ genre: 'avertissement' });
    expect(erreur.action).toBe('afficherErreur');
    expect(erreur.message).toEqual({ persistant: true });
    expect(action.message.action.libelle).toBe('Annuler');
    expect(action.message.action.corps).toHaveLength(1);
  });

  it('garde le sens des programmes d’avant : « reussite » seul est une variable', () => {
    const source = auClic(['afficher reussite'], ['>variable reussite = "ok"']);
    const evenement = corps(source).find((i) => i.type === 'Evenement') as any;
    expect(evenement.corps[0].message).toBeUndefined();
    expect(erreurs(source)).toEqual([]);
  });
});

describe('messages — l’analyse', () => {
  it('accepte les messages de l’exemple', () => {
    expect(erreurs(MESSAGES)).toEqual([]);
    expect(avertissements(MESSAGES)).toEqual([]);
  });
  it('refuse une durée hors de 1 à 60 secondes', () => {
    expect(erreurs(auClic(['afficher "Bonjour" pendant 2 minutes']))[0]).toMatch(/de 1 à 60 secondes/);
    expect(erreurs(auClic(['afficher "Bonjour" pendant 500 millisecondes']))[0]).toMatch(/de 1 à 60 secondes/);
  });
  it('refuse « pendant » avec « sans disparaitre »', () => {
    expect(erreurs(auClic(['afficher "Bonjour" pendant 5 secondes sans disparaitre']))[0]).toMatch(/se contredisent/);
  });
  it('avertit d’une erreur trop courte à lire', () => {
    expect(avertissements(auClic(['afficher erreur "Raté" pendant 2 secondes']))[0]).toMatch(/trop court pour lire une erreur/);
  });
  it('refuse un message avec durée écrit dans la page', () => {
    expect(erreurs(p('>afficher reussite "Bonjour"'))[0]).toMatch(/s’affiche dans un événement/);
  });
  it('une durée est un nombre', () => {
    expect(erreurs(auClic(['afficher "Bonjour" pendant nom secondes'], ['>variable nom = "a"']))[0]).toMatch(/une durée est un nombre/);
  });
});

describe('messages — la RI', () => {
  it('donne le genre, la durée en millisecondes, le bouton et ses actions', () => {
    const { application } = compiler(MESSAGES);
    const actions = application!.ecrans[0].gestionnaires[0].actions as any[];
    expect(actions.map((a) => a.genre)).toEqual(['reussite', 'info', 'avertissement', 'erreur', 'reussite']);
    expect(actions[1].duree).toEqual({ type: 'nombre', valeur: 10000 });
    expect(actions[3].persistant).toBe(true);
    expect(actions[4].action.libelle).toBe('Annuler');
    expect(actions[4].action.actions[0].type).toBe('ajout');
  });
});

describe('messages — les cibles', () => {
  it('web : afficherMessage reçoit le genre, la durée, le bouton ; le bouton lit les dernières valeurs', () => {
    const fichiers = web(MESSAGES);
    const page = fichier(fichiers, 'pages/P.tsx');
    expect(page).toContain("afficherMessage('Enregistré', 'reussite');");
    expect(page).toContain("afficherMessage('Brouillon sauvegardé', 'info', { duree: 10000 });");
    expect(page).toContain("afficherMessage('Impossible d’enregistrer', 'erreur', { persistant: true });");
    expect(page).toContain("action: { libelle: 'Annuler', faire: () => {");
    expect(page).toContain('actuel.current.panier = [...actuel.current.panier, ');
    expect(page).toContain('const actuel = useActuel({ panier });');
    expect(page).toContain("import { useActuel } from '../humalis/temps';");
    const messages = fichier(fichiers, 'humalis/messages.tsx');
    // Une pile de trois, toujours là pour les lecteurs d'écran, une pause au survol et au focus.
    expect(messages).toContain('const PILE = 3;');
    expect(messages).toContain('<ul className="humalis-messages" aria-live="polite">');
    expect(messages).toContain('onMouseEnter={() => setEnPause(true)}');
    expect(messages).toContain('onFocus={() => setEnPause(true)}');
    expect(messages).toContain('aria-label="Fermer le message"');
    expect(messages).toContain("role={message.genre === 'erreur' ? 'alert' : 'status'}");
    expect(messages).toContain('erreur: 8000');
    expect(fichier(fichiers, 'humalis/temps.ts')).toContain('export function useActuel');
    const css = fichier(fichiers, 'styles.css');
    expect(css).toContain('.humalis-message-reussite');
    expect(css).toContain('.humalis-message-avertissement');
  });

  it('web : un programme sans interaction n’a pas de fichier temps.ts', () => {
    expect(fichier(web(p('>titre "Bonjour"')), 'humalis/temps.ts')).toBe('');
  });

  it('desktop : comme le web', () => {
    expect(fichier(desktop(MESSAGES), 'pages/P.tsx')).toContain("afficherMessage('Brouillon sauvegardé', 'info', { duree: 10000 });");
  });

  it('mobile : la pile, les genres, l’annonce au lecteur d’écran', () => {
    const fichiers = mobile(MESSAGES);
    expect(fichier(fichiers, 'app/index.tsx')).toContain("afficherMessage('Enregistré', 'reussite');");
    const messages = fichier(fichiers, 'humalis/messages.tsx');
    expect(messages).toContain('AccessibilityInfo.announceForAccessibility(texte);');
    expect(messages).toContain('accessibilityLabel="Fermer le message"');
    expect(messages).toContain('couleurs.vertEncre');
    expect(fichier(fichiers, 'humalis/styles.ts')).toContain("vertEncre: '#ffffff'");
  });

  it('statique : la même pile, écrite en JavaScript clair', () => {
    const fichiers = statique(MESSAGES);
    const page = fichier(fichiers, 'pages/p.js');
    expect(page).toContain("afficherMessage('Brouillon sauvegardé', 'info', { duree: 10000 });");
    expect(page).toContain("action: { libelle: 'Annuler', faire() {");
    const outils = fichier(fichiers, 'humalis/humalis.js');
    expect(outils).toContain('while (zone.children.length > 3) zone.firstElementChild.remove();');
    expect(outils).toContain("lu.setAttribute('role', genre === 'erreur' ? 'alert' : 'status');");
    expect(fichier(fichiers, 'index.html')).toContain('<ul class="humalis-messages" aria-live="polite"></ul>');
  });
});
