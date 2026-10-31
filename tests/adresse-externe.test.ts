import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { verifierPourLeStatique } from '../src/cibles/statique/projet.js';
import { programme, erreurs } from './analyse/aide.js';

// Une adresse externe à trous : le lien WhatsApp d'une boutique (« …?text={message} »).
const COMMANDE = programme(
  'page "panier" :',
  '>variable message = "Bonjour & merci #12"',
  '>variable site = "https://exemple.fr"',
  '>titre "Panier"',
  '>lien "Commander sur WhatsApp" vers "https://wa.me/243000000000?text={message}" avec nouvel onglet',
  '>bouton "Envoyer"',
  '>quand l\'utilisateur clique sur "Envoyer" :',
  '>>rediriger vers "https://wa.me/243000000000?text={message}"',
);

describe('adresse externe à trous', () => {
  it('l’analyse lit les {…} du lien, et refuse une variable inconnue', () => {
    expect(erreurs(COMMANDE)).toEqual([]);
    expect(erreurs(COMMANDE.replace('text={message}" avec', 'text={messag}" avec')).join('\n')).toMatch(/messag/);
  });

  it('les {…} ne s’écrivent que dans une adresse externe', () => {
    expect(erreurs(programme('page "a" :', '>variable id = "1"', '>titre "A"', '>lien "Voir" vers "produit{id}"')).join('\n')).toMatch(/adresse externe/);
  });

  it('web : le lien et la redirection insèrent la valeur, encodée après le « ? »', () => {
    const page = genererProjetWeb(compiler(COMMANDE).application!, { nom: 'p', adresse: 'https://p.cd', source: 'p.humalis' }).get('src/pages/Panier.tsx')!;
    expect(page).toContain('href={`https://wa.me/243000000000?text=${encodeURIComponent(String(message ?? \'\'))}`}');
    expect(page).toContain('allerVers(naviguer, String(`https://wa.me/243000000000?text=${encodeURIComponent(String(message ?? \'\'))}`), afficherMessage);');
    expect(page).not.toContain('text={message}');
  });

  it('web : une adresse entière donnée par une variable n’est pas encodée', () => {
    const source = programme('page "a" :', '>variable site = "https://exemple.fr"', '>titre "A"', '>bouton "Aller"', '>quand l\'utilisateur clique sur "Aller" :', '>>rediriger vers "{site}"');
    const page = genererProjetWeb(compiler(source).application!, { nom: 'a', adresse: 'https://a.cd', source: 'a.humalis' }).get('src/pages/A.tsx')!;
    expect(page).not.toContain('encodeURIComponent');
  });

  it('web : une liste insérée dans l’adresse garde ses virgules, encodées', () => {
    const source = programme('page "a" :', '>variable articles = ["Maillot L", "Maillot M"]', '>titre "A"', '>bouton "Aller"', '>quand l\'utilisateur clique sur "Aller" :', '>>rediriger vers "https://wa.me/1?text=Bonjour%0A{articles}"');
    const page = genererProjetWeb(compiler(source).application!, { nom: 'a', adresse: 'https://a.cd', source: 'a.humalis' }).get('src/pages/A.tsx')!;
    expect(page).toContain("text=Bonjour%0A${encodeURIComponent(String(articles.join(', ') ?? ''))}");
  });

  it('site statique : le lien à trous est refusé clairement', () => {
    expect(verifierPourLeStatique(compiler(COMMANDE).application!).map((d) => d.message).join('\n')).toMatch(/adresse externe avec des \{…\}/);
  });
});
