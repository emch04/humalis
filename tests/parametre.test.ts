import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetMobile } from '../src/cibles/mobile/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { programme, erreurs } from './analyse/aide.js';

// Sept lignes de serveur : la page « boutique » commence ligne 9.
const BOUTIQUE = programme(
  'serveur "boutique" :',
  '>donnee produit :',
  '>>nom : texte',
  '>>prix : nombre',
  '>route "produits" :',
  '>>tout le monde peut lire produit',
  '>>seul admin peut modifier produit',
  '',
  'page "boutique" :',
  '>variable produits = []',
  '>quand la page se charge :',
  '>>envoyer requete vers "produits" dans produits',
  '>pour chaque p dans produits :',
  '>>lien p.nom vers "produit" avec id p.id',
  '',
  'page "produit" avec parametre id :',
  '>variable produit = rien',
  '>quand la page se charge :',
  '>>envoyer requete vers "produits" avec id dans produit',
  '>si produit est rien :',
  '>>texte "Chargement…"',
  '>sinon :',
  '>>titre produit.nom',
  '>>texte "{produit.prix} €"',
  '>lien "Retour" vers "boutique"',
);

const web = () => {
  const { application, diagnostics } = compiler(BOUTIQUE);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return genererProjetWeb(application!, { nom: 'boutique', adresse: 'https://boutique.exemple.cd', source: 'boutique.humalis' });
};

describe('page avec paramètre — analyse', () => {
  it('accepte la page « produit », son paramètre, « rien » et « p.id »', () => {
    expect(erreurs(BOUTIQUE)).toEqual([]);
  });

  it('refuse un lien qui oublie le paramètre de la page', () => {
    expect(erreurs(BOUTIQUE.replace('lien p.nom vers "produit" avec id p.id', 'lien p.nom vers "produit"'))).toEqual([
      '14 : la page « produit » attend le paramètre « id » : écrivez lien … vers "produit" avec id …',
    ]);
  });

  it('refuse un paramètre que la page ne connaît pas', () => {
    expect(erreurs(BOUTIQUE.replace('avec id p.id', 'avec id p.id et couleur_choisie "rouge"'))).toEqual([
      '14 : la page « produit » n\'a pas de paramètre « couleur_choisie ». Paramètres : id.',
    ]);
  });
});

describe('page avec paramètre — cible web', () => {
  it('donne à la page une adresse avec son paramètre, lu par useParams', () => {
    const fichiers = web();
    expect(fichiers.get('src/main.tsx')).toContain('<Route path="/produit/:id" element={<Produit />} />');
    const page = fichiers.get('src/pages/Produit.tsx')!;
    expect(page).toContain("const { id = '' } = useParams();");
    expect(page).toContain("import { useParams } from 'react-router';");
    expect(web().get('src/pages/Boutique.tsx')).toContain("import { Lien } from '../humalis/navigation';");
    expect(page).toContain('const [produit, setProduit] = useState<Produit | null>(null);');
    expect(page).toContain("setProduit(await serveur.lireUn('/api/produits', id, produit));");
    expect(page).toContain('{produit === null ? (');
    expect(page).toContain('{produit?.nom}');
  });

  it('écrit le lien avec la valeur du paramètre', () => {
    expect(web().get('src/pages/Boutique.tsx')).toContain('<Lien to={`/produit/${encodeURIComponent(String(p.id))}`}');
  });

  it('ne prérend pas une page à paramètre (son adresse dépend des données)', () => {
    const config = web().get('astratra.prerender.config.cjs')!;
    expect(config).toContain('{ path: "/"');
    expect(config).not.toContain(':id');
  });

  it('le serveur.ts produit lit un seul élément par son identifiant', () => {
    expect(web().get('src/humalis/serveur.ts')).toContain('lireUn: (adresse: string, id: string, actuelle?: unknown) =>');
  });
});

describe('page avec paramètre — cible mobile', () => {
  it('place la page dans app/produit/[id].tsx et lit useLocalSearchParams', () => {
    const fichiers = genererProjetMobile(compiler(BOUTIQUE).application!, { nom: 'boutique', source: 'boutique.humalis' });
    const page = fichiers.get('app/produit/[id].tsx')!;
    expect(page).toContain("const { id = '' } = useLocalSearchParams<{ id: string }>();");
    expect(fichiers.get('app/index.tsx')).toContain('href={`/produit/${encodeURIComponent(String(p.id))}`}');
  });
});

describe('page avec paramètre — cible statique', () => {
  it('lit le paramètre dans l’adresse de la page (produit.html?id=…)', () => {
    const fichiers = genererProjetStatique(compiler(BOUTIQUE).application!, { nom: 'boutique', source: 'boutique.humalis' });
    const scripts = [...fichiers.values()].join('\n');
    expect(scripts).toContain("new URLSearchParams(location.search).get('id') ?? ''");
    expect(scripts).toContain('`produit.html?id=${encodeURIComponent(String(p.id))}`');
  });
});

describe('page avec paramètre — la page d’entrée', () => {
  it('ne prend jamais une page à paramètre comme page d’entrée', () => {
    const source = programme(
      'page "produit" avec parametre id :',
      '>texte "Produit {id}"',
      '',
      'page "liste" :',
      '>lien "Le premier" vers "produit" avec id "1"',
    );
    const { application } = compiler(source);
    const fichiers = genererProjetWeb(application!, { nom: 'essai', adresse: 'https://x.cd', source: 'essai.humalis' });
    expect(fichiers.get('src/main.tsx')).toContain('<Route path="/" element={<Liste />} />');
    expect(fichiers.get('src/main.tsx')).toContain('<Route path="/produit/:id" element={<Produit />} />');
    expect(genererProjetStatique(application!, { nom: 'essai', source: 'essai.humalis' }).get('index.html')).toContain('Le premier');
    expect(genererProjetMobile(application!, { nom: 'essai', source: 'essai.humalis' }).get('app/index.tsx')).toContain('export default function Liste()');
  });
});

describe('page avec paramètre — rediriger vers une page calculée', () => {
  it('refuse des paramètres quand la page n’est pas écrite entre guillemets', () => {
    const source = programme(
      'page "liste" :',
      '>variable destination = "produit"',
      '>bouton "Voir"',
      '>quand l\'utilisateur clique sur "Voir" :',
      '>>rediriger vers destination avec id "1"',
      '',
      'page "produit" avec parametre id :',
      '>texte "{id}"',
    );
    expect(erreurs(source)).toEqual([
      '5 : « rediriger vers … avec … » demande le nom de la page entre guillemets : rediriger vers "produit" avec id …',
    ]);
  });
});

describe('page avec paramètre — le titre de l’onglet (projet « Le Fleuve »)', () => {
  it('web : l’onglet suit le premier titre affiché, même calculé (« titre produit.nom »)', () => {
    const page = web().get('src/humalis/page.ts')!;
    expect(page).toContain("document.title = document.querySelector('main h1')?.textContent?.trim() || titre;");
  });

  it('site statique : l’onglet suit aussi le premier titre après chaque dessin', () => {
    const outils = genererProjetStatique(compiler(BOUTIQUE).application!, { nom: 'boutique', source: 'boutique.humalis' }).get('humalis/humalis.js')!;
    expect(outils).toContain("const titre = document.querySelector('main h1')?.textContent?.trim();");
    expect(outils).toContain('if (titre) document.title = titre;');
  });
});
