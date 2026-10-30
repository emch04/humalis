import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';
import { compiler } from '../../src/compilateur.js';
import { genererProjetStatique, verifierPourLeStatique, MARQUE_STATIQUE } from '../../src/cibles/statique/projet.js';
import { echapperTexte, echapperAttribut } from '../../src/cibles/statique/html.js';
import { nomJs } from '../../src/cibles/statique/valeurs.js';
import { programme } from '../analyse/aide.js';

const compile = (source: string) => {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return application!;
};
const projet = (source: string, fichiersStyle?: Map<string, string>) =>
  genererProjetStatique(compile(source), { nom: 'essai', source: 'essai.humalis', fichiersStyle });
const exemple = (nom: string) => projet(readFileSync(`exemples/${nom}.humalis`, 'utf8'));
const compter = (texte: string, motif: RegExp) => (texte.match(motif) ?? []).length;
/** Le contenu de <main>, sans les espaces entre les balises. */
const principal = (html: string) => html.slice(html.indexOf('<main'), html.indexOf('</main>') + 7).replace(/>\s+</g, '><');

describe('cible statique — échappement HTML', () => {
  it('échappe le texte', () => {
    expect(echapperTexte('<script>alert(1)</script> & co')).toBe('&lt;script&gt;alert(1)&lt;/script&gt; &amp; co');
    expect(echapperTexte('&amp;')).toBe('&amp;amp;');
  });

  it('échappe les attributs', () => {
    expect(echapperAttribut(`a" onload="x' <b>&`)).toBe('a&quot; onload=&quot;x&#39; &lt;b&gt;&amp;');
  });
});

describe('cible statique — noms', () => {
  it('évite les noms du navigateur et des outils', () => {
    expect(nomJs('document')).toBe('document_');
    expect(nomJs('location')).toBe('location_');
    expect(nomJs('humalis')).toBe('humalis_');
    expect(nomJs('dessiner')).toBe('dessiner_');
    expect(nomJs('class')).toBe('class_');
    expect(nomJs('nombre_articles')).toBe('nombreArticles');
  });
});

describe('cible statique — le site de la boutique', () => {
  const fichiers = exemple('boutique');
  const index = fichiers.get('index.html')!;
  const panier = fichiers.get('panier.html')!;
  const script = fichiers.get('pages/boutique.js')!;

  it('écrit un fichier HTML par page, et ses outils', () => {
    for (const f of [
      MARQUE_STATIQUE,
      'index.html',
      'panier.html',
      '404.html',
      'humalis/humalis.js',
      'humalis/styles.css',
      'pages/boutique.js',
      'pages/panier.js',
      'LISEZMOI.md',
    ]) {
      expect(fichiers.has(f), f).toBe(true);
    }
    expect(fichiers.has('package.json')).toBe(false);
    expect(fichiers.has('boutique.html')).toBe(false);
  });

  it('écrit une page HTML complète, en français', () => {
    expect(index.startsWith('<!doctype html>\n<html lang="fr">')).toBe(true);
    expect(index).toContain('<meta charset="utf-8">');
    expect(index).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
    expect(index).toContain('<title>Nos produits</title>');
    expect(index).toContain('<meta name="description" content="Nos produits">');
    expect(index).toContain('<link rel="stylesheet" href="humalis/styles.css">');
    expect(index).toContain('<script src="humalis/humalis.js" defer></script>');
    expect(index).toContain('<script src="pages/boutique.js" defer></script>');
    expect(index).toContain('<ul class="humalis-messages" aria-live="polite"></ul>');
    expect(compter(index, /<h1\b/g)).toBe(1);
    expect(compter(panier, /<h1\b/g)).toBe(1);
  });

  it('écrit le contenu de départ dans le HTML, lisible sans JavaScript', () => {
    expect(index).toContain(
      '<h1 data-humalis="titre_nos_produits" class="humalis-couleur-bleu humalis-taille-grande">Nos produits</h1>',
    );
    expect(index).toContain('<p data-humalis="texte_ligne_8">Articles dans le panier : 0</p>');
    expect(compter(index, />Ajouter<\/button>/g)).toBe(3);
    expect(index).toContain('<p data-humalis="texte_ligne_10">Stylo</p>');
    expect(index).toContain('<button type="button" data-humalis="bouton_ajouter" class="humalis-fond-vert">Ajouter</button>');
    expect(index).toContain('Rupture de stock');
    expect(index).not.toContain('Commander');
    expect(panier).toContain('<p data-humalis="texte_votre_panier_est_vide">Votre panier est vide.</p>');
    expect(panier).toContain('<a href="index.html" data-humalis="lien_retour_a_la_boutique">Retour à la boutique</a>');
  });

  it('écrit le script de la page en JavaScript lisible', () => {
    expect(script).toContain("let produits = ['Livre', 'Stylo', 'Cahier'];");
    expect(script).toContain('let stock = 0;');
    expect(script).toContain('let panier = [];');
    expect(script).toContain('function nombreArticles() {\n  return panier.length;\n}');
    expect(script).toContain('function quandCliqueAjouter(nom) {\n  panier = [...panier, nom];\n}');
    expect(script).toContain("location.assign('panier.html');");
    expect(script).toContain('...produits.flatMap((nom) => [');
    expect(script).toContain("onclick: () => quandCliqueAjouter(nom)");
    expect(script).toContain("`Articles dans le panier : ${formaterNombre(nombreArticles())}`");
    expect(script).toContain('...(stock === 0');
    expect(script).toContain('humalis.demarrer({ relire, garder, dessiner });');
  });

  it('garde le panier partagé le temps de la visite (sessionStorage)', () => {
    expect(script).toContain("panier = lirePartage('humalis:essai:partage:panier', panier);");
    expect(script).toContain("garderPartage('humalis:essai:partage:panier', panier);");
    expect(fichiers.get('humalis/humalis.js')).toContain('sessionStorage');
    expect(fichiers.get('pages/panier.js')).toContain('panier = retirerPremier(panier, nom);');
  });

  it('ne passe jamais par innerHTML, et chaque script est du JavaScript valide', () => {
    for (const [chemin, contenu] of fichiers) {
      if (!chemin.endsWith('.js')) continue;
      expect(contenu, chemin).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
      expect(() => new Script(contenu, { filename: chemin }), chemin).not.toThrow();
    }
  });

  it('reprend les styles nommés du web, en clair et en sombre', () => {
    const css = fichiers.get('humalis/styles.css')!;
    expect(css).toContain('--humalis-bleu: #1f5fbf;');
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toContain('.humalis-fond-vert');
    expect(css).toContain('.humalis-message-erreur');
  });

  it('écrit une page introuvable', () => {
    const introuvable = fichiers.get('404.html')!;
    expect(introuvable).toContain('<h1>Page introuvable</h1>');
    expect(introuvable).toContain('<a href="index.html">Revenir à l\'accueil</a>');
  });
});

describe('cible statique — les éléments', () => {
  it('écrit les champs avec leur libellé, les messages et les conditions', () => {
    const fichiers = exemple('connexion');
    const html = fichiers.get('index.html')!;
    const script = fichiers.get('pages/connexion.js')!;
    expect(html).toContain('<label class="humalis-champ">email<input data-humalis="champ_email"></label>');
    expect(script).toContain("let champEmail = '';");
    expect(script).toContain('oninput: (evenement) => { champEmail = evenement.target.value; }');
    expect(script).toContain("value: champEmail");
    expect(script).toContain("if (champEmail.length === 0) {\n    afficherMessage('Email requis', 'erreur');\n  } else {\n    afficherMessage('Connexion réussie', 'info');\n  }");
  });

  it('écrit les images, les liens, les titres suivants et les classes CSS', () => {
    const fichiers = projet(
      programme(
        'page "accueil" :',
        '>titre "Bienvenue"',
        '>titre "Encore"',
        '>image "photo_du-chat.jpg" avec description "photo du chat"',
        '>texte "Salut" avec style "carte large"',
        '>lien "Le panier" vers "panier"',
        'page "panier" :',
        '>titre "Panier"',
      ),
    );
    const html = fichiers.get('index.html')!;
    expect(html).toContain('<h2 data-humalis="titre_encore">Encore</h2>');
    expect(html).toContain('<img src="images/photo_du-chat.jpg" alt="photo du chat" loading="lazy" decoding="async" data-humalis="image_photo_du_chat_jpg">');
    expect(html).toContain('<p data-humalis="texte_salut" class="carte large">Salut</p>');
    expect(html).toContain('<a href="panier.html" data-humalis="lien_le_panier">Le panier</a>');
  });

  it('montre et cache les éléments, au départ comme après un événement', () => {
    const fichiers = projet(
      programme(
        'page "p" :',
        '>texte "Secret" avec nom "secret"',
        '>texte "Visible" avec nom "visible"',
        '>bouton "Montrer"',
        '>quand utilisateur clique sur "Montrer" :',
        '>>montrer "secret"',
        '>>cacher "visible"',
        '>>changer le texte de "visible" par "Changé"',
      ),
    );
    const html = principal(fichiers.get('index.html')!);
    const script = fichiers.get('pages/p.js')!;
    expect(html).not.toContain('Secret');
    expect(html).toContain('Visible');
    expect(script).toContain("let visibilite = { 'secret': false, 'visible': true };");
    expect(script).toContain("visibilite = { ...visibilite, 'secret': true };");
    expect(script).toContain("textes = { ...textes, 'visible': 'Changé' };");
    expect(script).toContain("...(visibilite['secret'] ? [");
  });
});

describe('cible statique — aucune injection depuis une valeur', () => {
  const fichiers = projet(
    programme(
      'style :',
      '>.a { color: red; }',
      'page "accueil" :',
      ">titre \"<script>alert('titre')</script>\"",
      '>texte "Tom & Jerry <b>gras</b>" avec style "x\'<y>"',
      '>variable nom = "</p><script>alert(1)</script>"',
      '>texte "Bonjour {nom}"',
      '>texte "Coût ${nom} `x` \\\\"',
      ">image \"x' onerror='alert(3).png\" avec description \"Un dessin\"",
    ),
  );
  const html = fichiers.get('index.html')!;
  const script = fichiers.get('pages/accueil.js')!;

  it('échappe le texte et les attributs du HTML', () => {
    expect(html).not.toMatch(/<script>alert/);
    expect(html).not.toMatch(/<b>/);
    expect(html).toContain("&lt;script&gt;alert('titre')&lt;/script&gt;");
    expect(html).toContain('Tom &amp; Jerry &lt;b&gt;gras&lt;/b&gt;');
    expect(html).toContain('class="x&#39;&lt;y&gt;"');
    expect(html).toContain('Bonjour &lt;/p&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain("<title>&lt;script&gt;alert('titre')&lt;/script&gt;</title>");
  });

  it('échappe les chaînes du script', () => {
    expect(() => new Script(script)).not.toThrow();
    expect(script).toContain("'<script>alert(\\'titre\\')</script>'");
    expect(script).toContain('`Bonjour ${nom}`');
    expect(script).toContain("`Coût $${nom} \\`x\\` \\\\\\\\`");
    expect(html).toContain('<img src="images/x&#39; onerror=&#39;alert(3).png"');
    expect(html).not.toContain("onerror='");
  });

  it('recopie le CSS de l’utilisateur tel quel', () => {
    expect(fichiers.get('styles/style.css')).toContain('.a { color: red; }');
    expect(html).toContain('<link rel="stylesheet" href="styles/style.css">');
  });
});

describe('cible statique — la mémoire', () => {
  it('garde une variable mémorisée dans localStorage, une partagée dans sessionStorage', () => {
    const fichiers = projet(
      programme(
        'variable panier = [] avec partagee',
        'variable compte = 0 avec partagee et memorisee',
        'page "p" :',
        '>variable visites = 0 avec memorisee',
        '>calcul articles = nombre de panier',
        '>texte "{visites} {compte} {articles}"',
      ),
    );
    const script = fichiers.get('pages/p.js')!;
    expect(script).toContain("panier = lirePartage('humalis:essai:partage:panier', panier);");
    expect(script).toContain("compte = lireMemoire('humalis:essai:partage:compte', compte);");
    expect(script).toContain("visites = lireMemoire('humalis:essai:p:visites', visites);");
    expect(script).toContain("garderMemoire('humalis:essai:p:visites', visites);");
    const outils = fichiers.get('humalis/humalis.js')!;
    expect(outils).toContain('localStorage');
    expect(outils).toContain('sessionStorage');
    expect(fichiers.get('index.html')).toContain('0 0 0');
  });
});

describe('cible statique — serveur et connexion', () => {
  const fichiers = exemple('avis');
  const html = fichiers.get('index.html')!;
  const script = fichiers.get('pages/avis.js')!;
  const outils = fichiers.get('humalis/humalis.js')!;

  it('lit et envoie avec fetch et le jeton CSRF du pack', () => {
    expect(script).toContain("avis = await serveur.lire('/api/avis', avis);");
    expect(script).toContain("await serveur.envoyer('/api/avis', { commentaire: champCommentaire });");
    expect(outils).toContain("astratra_csrf");
    expect(outils).toContain("'x-csrf-token'");
    expect(outils).toContain("credentials: 'same-origin'");
  });

  it('se connecte par les packs, sans garder le mot de passe', () => {
    expect(script).toContain(
      "const motDePasseSaisi = champMotDePasse;\n  champMotDePasse = '';\n  if (!(await utilisateur.seConnecter(champEmail, motDePasseSaisi))) return;",
    );
    expect(script).toContain('await utilisateur.seDeconnecter();');
    expect(script).toContain('...(utilisateur.connecte');
    expect(outils).toContain("'/auth/login'");
    expect(outils).toContain("'/auth/me'");
    expect(outils).not.toMatch(/localStorage\.setItem\([^)]*(jeton|token|motDePasse)/);
    expect(script).toContain('humalis.demarrer({ dessiner, auChargement, session: true });');
  });

  it('montre au départ la page d’un visiteur', () => {
    expect(html).toContain("Aucun avis pour l'instant.");
    expect(html).toContain('Connectez-vous pour laisser un avis.');
    expect(html).toContain('<input data-humalis="champ_mot_de_passe" type="password" autocomplete="current-password">');
    expect(html).not.toContain('Publier');
  });
});

describe('cible statique — composants écrits en Humalis', () => {
  const source = programme(
    'composant "Fiche" :',
    '>parametre nom',
    '>parametre prix',
    '>calcul double = prix * 2',
    '>texte nom',
    '>texte "{prix} € ({double})"',
    '',
    'page "accueil" :',
    '>variable prix_minimum = 2',
    '>titre "Vitrine"',
    '>Fiche avec nom "Livre" et prix 12',
    '>Fiche avec nom "Stylo" et prix prix_minimum',
  );

  it('devient une fonction, et son contenu est dans le HTML', () => {
    const fichiers = projet(source);
    const composants = fichiers.get('composants.js')!;
    expect(composants).toContain('function Fiche({ nom, prix }) {');
    expect(() => new Script(composants)).not.toThrow();
    const html = fichiers.get('index.html')!;
    expect(html).toContain('<script src="composants.js" defer></script>');
    expect(html).toContain('>Livre</p>');
    expect(html).toContain('>12 € (24)</p>');
    expect(html).toContain('>2 € (4)</p>');
    expect(fichiers.get('pages/accueil.js')).toContain("...Fiche({ nom: 'Livre', prix: 12 }),");
    expect(fichiers.get('pages/accueil.js')).toContain("...Fiche({ nom: 'Stylo', prix: prixMinimum }),");
  });
});

describe('cible statique — ce qui est refusé', () => {
  const messages = (source: string) => verifierPourLeStatique(compile(source)).map((d) => `${d.gravite} ${d.ligne} : ${d.message}`);

  it('refuse les composants React', () => {
    const resultat = messages(readFileSync('exemples/vitrine.humalis', 'utf8'));
    expect(resultat).toHaveLength(1);
    expect(resultat[0]).toMatch(/^erreur 1 : le composant React « Carte » ne peut pas être utilisé sur la cible statique/);
  });

  it('refuse « memorisee en secret »', () => {
    expect(messages('variable jeton = "x" avec partagee et memorisee en secret\npage "p" :\n    texte jeton')[0]).toMatch(
      /^erreur 1 : « memorisee en secret » n'existe pas sur le web/,
    );
  });

  it('refuse un composant qui a ses propres variables ou événements', () => {
    const resultat = messages(
      programme(
        'composant "Compteur" :',
        '>variable n = 0',
        '>texte "{n}"',
        'page "p" :',
        '>Compteur',
      ),
    );
    expect(resultat).toEqual([
      expect.stringMatching(/^erreur 1 : sur la cible statique, le composant « Compteur » ne peut pas encore avoir ses propres variables ou événements/),
    ]);
  });

  it('accepte la boutique, la connexion et les avis', () => {
    for (const nom of ['boutique', 'connexion', 'avis', 'boutique-complete']) {
      expect(messages(readFileSync(`exemples/${nom}.humalis`, 'utf8')), nom).toEqual([]);
    }
  });
});

describe('cible statique — HTML et script racontent la même page', () => {
  it('le HTML de départ de chaque exemple est bien formé', () => {
    for (const nom of ['boutique', 'connexion', 'avis', 'boutique-complete']) {
      for (const [chemin, contenu] of exemple(nom)) {
        if (!chemin.endsWith('.html')) continue;
        expect(balisesEquilibrees(contenu), `${nom} ${chemin}`).toBe(true);
        expect(principal(contenu)).toMatch(/^<main class="humalis-page">/);
      }
    }
  });

  const composants = programme(
    'composant "Fiche" :',
    '>parametre nom',
    '>calcul longueur = nombre de nom',
    '>texte "{nom}"',
    'page "accueil" :',
    '>variable notes = [12, 15, 9]',
    '>variable actif = vrai',
    '>titre "Divers"',
    '>texte "Notes : {notes}"',
    '>texte actif',
    '>pour chaque n dans notes :',
    '>>variable moitie = n / 2',
    '>>si moitie est superieur a 5 :',
    '>>>texte "{n} donne {moitie}"',
    '>>sinon :',
    '>>>texte "petit {n}"',
    '>Fiche avec nom "Livre"',
    '>champ "nom"',
  );
  for (const [nom, source] of [
    ['boutique', readFileSync('exemples/boutique.humalis', 'utf8')],
    ['avis', readFileSync('exemples/avis.humalis', 'utf8')],
    ['connexion', readFileSync('exemples/connexion.humalis', 'utf8')],
    ['inscription', readFileSync('exemples/inscription.humalis', 'utf8')],
    ['gestion', readFileSync('exemples/gestion.humalis', 'utf8')],
    ['catalogue', readFileSync('exemples/catalogue.humalis', 'utf8')],
    ['divers', composants],
  ]) {
    it(`${nom} : le premier dessin du script est le HTML de départ (scripts lancés ensemble)`, () => {
      const fichiers = projet(source);
      for (const [chemin, html] of fichiers) {
        if (!chemin.endsWith('.html') || chemin === '404.html') continue;
        const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => fichiers.get(m[1])!);
        const { main } = lancer(scripts);
        expect(main.enfantsHtml(), `${nom} ${chemin}`).toBe(principal(html).replace(/^<main class="humalis-page">|<\/main>$/g, ''));
      }
    });
  }

  it('un clic redessine la page, et le panier est gardé pour l’autre page', () => {
    const fichiers = exemple('boutique');
    const scripts = ['humalis/humalis.js', 'pages/boutique.js'].map((f) => fichiers.get(f)!);
    const { main, session } = lancer(scripts);
    main.chercher('bouton_ajouter')[1].ecouteurs.click();
    return new Promise((fin) => setTimeout(fin, 0)).then(() => {
      expect(main.enfantsHtml()).toContain('Articles dans le panier : 1');
      expect(session.get('humalis:essai:partage:panier')).toBe('["Stylo"]');
    });
  });
});

/** Un tout petit DOM, juste ce qu'utilisent les scripts produits. */
class FauxNoeud {
  attributs: [string, string][] = [];
  enfants: (FauxNoeud | string)[] = [];
  ecouteurs: Record<string, () => void> = {};
  value = '';
  constructor(readonly balise: string) {}
  setAttribute(nom: string, valeur: string) {
    this.attributs = [...this.attributs.filter(([n]) => n !== nom), [nom, valeur]];
  }
  getAttribute(nom: string) {
    return this.attributs.find(([n]) => n === nom)?.[1] ?? null;
  }
  append(...enfants: (FauxNoeud | string)[]) {
    this.enfants.push(...enfants);
  }
  replaceChildren(...enfants: (FauxNoeud | string)[]) {
    this.enfants = enfants;
  }
  addEventListener(type: string, ecouteur: () => void) {
    this.ecouteurs[type] = ecouteur;
  }
  chercher(id: string): FauxNoeud[] {
    return this.enfants.flatMap((e) => (typeof e === 'string' ? [] : [...(e.getAttribute('data-humalis') === id ? [e] : []), ...e.chercher(id)]));
  }
  enfantsHtml(): string {
    return this.enfants.map((e) => (typeof e === 'string' ? echapperTexte(e) : e.html())).join('');
  }
  html(): string {
    const attributs = this.attributs.map(([n, v]) => ` ${n}="${echapperAttribut(v)}"`).join('');
    return ['img', 'input'].includes(this.balise) ? `<${this.balise}${attributs}>` : `<${this.balise}${attributs}>${this.enfantsHtml()}</${this.balise}>`;
  }
}

/** Lance les scripts d'une page, dans l'ordre, dans un même contexte (comme le navigateur). */
function lancer(scripts: string[]) {
  const main = new FauxNoeud('main');
  const messages = new FauxNoeud('div');
  const stockage = () => {
    const valeurs = new Map<string, string>();
    return { valeurs, getItem: (c: string) => valeurs.get(c) ?? null, setItem: (c: string, v: string) => void valeurs.set(c, v) };
  };
  const session = stockage();
  const local = stockage();
  const contexte = createContext({
    Node: FauxNoeud,
    CSS: { escape: (s: string) => s },
    console,
    setTimeout,
    clearTimeout,
    sessionStorage: session,
    localStorage: local,
    addEventListener: () => {},
    // Une page à paramètre lit son adresse (produit.html?id=…) : ici, sans paramètre.
    URLSearchParams,
    location: { search: '' },
    // Le serveur ne répond pas : la valeur de départ est gardée.
    fetch: () => Promise.reject(new Error('hors ligne')),
    Headers: class { set() {} },
    document: {
      activeElement: null,
      cookie: '',
      createElement: (balise: string) => new FauxNoeud(balise),
      querySelector: (s: string) => (s === 'main' ? main : messages),
      querySelectorAll: () => [],
    },
  });
  for (const script of scripts) new Script(script).runInContext(contexte);
  return { main, session: session.valeurs };
}

/** Chaque balise ouverte est fermée, dans le bon ordre (les éléments vides à part). */
function balisesEquilibrees(html: string): boolean {
  const vides = new Set(['meta', 'link', 'img', 'input', 'br', 'hr']);
  const pile: string[] = [];
  for (const [, fermante, nom] of html.replace(/<!doctype html>/i, '').matchAll(/<(\/?)([a-z0-9]+)\b[^>]*>/g)) {
    if (vides.has(nom)) continue;
    if (!fermante) pile.push(nom);
    else if (pile.pop() !== nom) return false;
  }
  return pile.length === 0;
}

describe('cible statique — formulaires et genres de champs', () => {
  const fichiers = exemple('inscription');
  const tout = [...fichiers.values()].join('\n');

  it('écrit une vraie balise form, envoyée sans recharger la page', () => {
    expect(tout).toMatch(/<form data-humalis="formulaire_\w+" class="humalis-formulaire" novalidate="true">/);
    expect(tout).toContain("class: 'humalis-formulaire', novalidate: true, onsubmit: quandSoumis");
    expect(fichiers.get('humalis/humalis.js')).toContain("element.addEventListener('submit', (evenement) => {");
    expect(tout).toContain("type: 'submit'");
  });

  it('donne à chaque sorte sa balise', () => {
    for (const morceau of ['type="tel"', 'type="number"', 'type="date"', 'type="checkbox"', 'type="radio"', '<select', '<textarea', 'required="true"']) {
      expect(tout, morceau).toContain(morceau);
    }
  });

  it('vérifie les champs avant l’envoi, puis les vide', () => {
    expect(tout).toMatch(/afficherMessage\('Le champ « [^»]+ » est obligatoire\.', 'erreur'\);/);
    expect(tout).toContain('const echecs = serveur.echecs();');
    expect(tout).toContain('if (serveur.echecs() > echecs) return;');
    expect(fichiers.get('humalis/humalis.js')).toContain('echecs: () => echecs,');
    expect(fichiers.get('humalis/styles.css')).toContain('.humalis-formulaire');
  });
});
