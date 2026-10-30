import { describe, expect, it } from 'vitest';
import { analyser } from '../src/lexer/lexer.js';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { genererProjetMobile } from '../src/cibles/mobile/projet.js';

const page = (contenu: string) => `page "accueil" :\n    titre "Accueil"\n${contenu}`;
const application = (source: string) => {
  const resultat = compiler(source);
  expect(resultat.diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return resultat.application!;
};
const options = { nom: 'documentation', source: 'documentation.humalis', adresse: 'https://exemple.test' };

describe('documentation', () => {
  it('découpe le code dans une phrase et refuse sa forme sans guillemets', () => {
    expect(analyser('texte "Écris {code "titre"}."').find((t) => t.type === 'CHAINE')?.parties).toEqual([
      { type: 'texte', valeur: 'Écris ' }, { type: 'code', valeur: 'titre' }, { type: 'texte', valeur: '.' },
    ]);
    expect(() => analyser('texte "Écris {code titre}."')).toThrow(/Ligne 1.*code.*guillemets/i);
  });

  it('rend le code dans une phrase sur les trois cibles et dans les deux langues', () => {
    const source = `langues :\n    francais\n    anglais\n\n${page('    texte "Écris {code "titre"}." en anglais "Write {code "title"}."')}`;
    const app = application(source);
    expect(genererProjetWeb(app, options).get('src/pages/Accueil.tsx')).toContain('humalis-code-ligne');
    expect(genererProjetStatique(app, options).get('index.html')).toContain('<code class="humalis-code-ligne">titre</code>');
    expect(genererProjetMobile(app, options).get('app/index.tsx')).toContain('title');
  });

  it('lit un bloc de code sans analyser ses lignes', () => {
    const tokens = analyser(page('    code humalis :\n        texte "guillemet non fermé\n\n        # commentaire'));
    expect(tokens.some((t) => t.type === 'CODE_BRUT' && t.valeur.includes('guillemet non fermé'))).toBe(true);
  });

  it('garde les lignes et échappe le code brut sur chaque cible', () => {
    const source = page('    code terminal :\n        npm install\n\n        <script>alerte()</script>\n    texte "Après"');
    const app = application(source);
    const bloc = app.ecrans[0].vue.find((n) => n.type === 'codeDocumentation');
    expect(bloc).toMatchObject({ langage: 'terminal', code: 'npm install\n\n<script>alerte()</script>' });
    const web = genererProjetWeb(app, options).get('src/pages/Accueil.tsx')!;
    expect(web).toContain('humalis-bloc-code');
    expect(web).not.toContain('<code><script>alerte()</script>');
    expect(web).toContain('void copier(');
    const statique = genererProjetStatique(app, options).get('index.html')!;
    expect(statique).toContain('&lt;script&gt;alerte()&lt;/script&gt;');
    expect(genererProjetMobile(app, options).get('app/index.tsx')).toContain('fontFamily');
    expect(genererProjetStatique(app, options).get('pages/accueil.js')).toContain('copier(');
  });

  it('ne confond ni code QR ni la variable code avec un bloc de code', () => {
    const source = page('    variable code = "abc"\n    texte "{code}"\n    code qr "https://exemple.test"');
    expect(compiler(source).diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  });

  it('montre sans coloration un bloc invalide et accepte le langage absent', () => {
    const app = application(page('    code :\n        texte "guillemet non fermé\n        <img src=x onerror=alerte()>'));
    const html = genererProjetStatique(app, options).get('index.html')!;
    expect(html).toContain('data-langage=""');
    expect(html).toContain('&lt;img src=x onerror=alerte()&gt;');
    expect(html).not.toContain('humalis-code-mot');
  });

  it('colore un exemple Humalis valide sans changer son texte', () => {
    const app = application(page('    code humalis :\n        titre "Bonjour" # commentaire\n        nombre 12'));
    const html = genererProjetStatique(app, options).get('index.html')!;
    expect(html).toContain('humalis-code-mot');
    expect(html).toContain('humalis-code-texte');
    expect(html).toContain('humalis-code-commentaire');
    expect(html).toContain('humalis-code-nombre');
  });

  it('traduit le bouton de copie avec les langues du site', () => {
    const app = application(`langues :\n    francais\n    anglais\n\n${page('    code terminal :\n        npm install')}`);
    expect(genererProjetWeb(app, options).get('src/pages/Accueil.tsx')).toContain("fr: 'Copier', en: 'Copy'");
    expect(genererProjetStatique(app, options).get('pages/accueil.js')).toContain("'Copy' : 'Copier'");
  });

  it('compile une liste à puces et une liste numérotée', () => {
    const app = application(page('    liste :\n        texte "Installer"\n    liste numerotee :\n        texte "Créer"'));
    const web = genererProjetWeb(app, options).get('src/pages/Accueil.tsx')!;
    expect(web).toContain('<ul');
    expect(web).toContain('<ol');
    expect(genererProjetStatique(app, options).get('index.html')).toContain('<li');
    expect(genererProjetMobile(app, options).get('app/index.tsx')).toContain('•');
  });

  it('une boucle dans une liste produit une puce par valeur', () => {
    const app = application(page('    variable produits = ["Livre", "Stylo"]\n    liste numerotee :\n        pour chaque nom dans produits :\n            texte nom'));
    const web = genererProjetWeb(app, options).get('src/pages/Accueil.tsx')!;
    expect(web).toMatch(/\.map\([^]*?<li>/);
    expect(web).not.toMatch(/<li>\s*\{?produits\.map/);
    const statique = genererProjetStatique(app, options).get('index.html')!;
    expect(statique.match(/<li>/g)).toHaveLength(2);
    expect(() => new Function(genererProjetStatique(app, options).get('pages/accueil.js')!)).not.toThrow();
  });

  it('compile un tableau et refuse une rangée de largeur différente', () => {
    const app = application(page('    tableau "Commandes" :\n        colonnes "Commande", "Rôle"\n        rangee "humalis", "compile"'));
    expect(genererProjetWeb(app, options).get('src/pages/Accueil.tsx')).toContain('<table');
    expect(genererProjetStatique(app, options).get('index.html')).toContain('<caption');
    expect(genererProjetMobile(app, options).get('app/index.tsx')).toContain('humalis');
    expect(compiler(page('    tableau "Commandes" :\n        colonnes "Commande", "Rôle"\n        rangee "humalis"')).diagnostics.map((d) => d.message).join(' ')).toMatch(/rangée.*cellules/i);
  });

  it('traduit chaque cellule et signale légende ou colonnes absentes', () => {
    const source = `langues :\n    francais\n    anglais\n\n${page('    tableau "Commandes" en anglais "Commands" :\n        colonnes "Rôle" en anglais "Role"\n        rangee "Écris {code "titre"}" en anglais "Write {code "title"}"')}`;
    const app = application(source);
    const web = genererProjetWeb(app, options).get('src/pages/Accueil.tsx')!;
    expect(web).toContain('Commands');
    expect(web).toContain('humalis-code-ligne');
    expect(genererProjetStatique(app, options).get('index.html')).toContain('<code class="humalis-code-ligne">titre</code>');
    expect(compiler(page('    tableau :\n        colonnes "Nom"')).diagnostics.map((d) => d.message).join(' ')).toContain('légende');
    expect(compiler(page('    tableau "Vide" :')).diagnostics.map((d) => d.message).join(' ')).toContain('colonnes');
  });
});
