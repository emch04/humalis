import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetWeb } from '../src/cibles/web/projet.js';
import { genererProjetApple } from '../src/cibles/apple/projet.js';
import { programme } from './analyse/aide.js';

// Les phrases validées par Emch le 10 novembre 2026.
const sansErreur = (source: string) => {
  const r = compiler(source);
  expect(r.diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return r.application!;
};
const web = (source: string) => genererProjetWeb(sansErreur(source), { nom: 'a', adresse: 'https://a.fr', source: 'a.humalis' });
const pageWeb = (source: string, nom = 'Accueil') => web(source).get(`src/pages/${nom}.tsx`)!;
const pageApple = (source: string) => [...genererProjetApple(sansErreur(source), { nom: 'a', source: 'a.humalis' }).fichiers.entries()].find(([k]) => k.endsWith('PageAccueil.swift'))![1];

describe('« non » et une condition comme valeur', () => {
  const source = programme(
    'page "accueil" :',
    '>variable ouvert = faux',
    '>variable role = "gerant"',
    '>calcul est_chef = role est dans ["gerant", "direction"]',
    '>calcul ferme = non ouvert',
    '>titre "Essai"',
    '>si est_chef est vrai :',
    '>>texte "Chef"',
    '>bouton "Basculer"',
    '>quand l\'utilisateur clique sur "Basculer" :',
    '>>changer ouvert par non ouvert',
  );
  it('devient du JavaScript', () => {
    const page = pageWeb(source);
    expect(page).toContain("const estChef = (['gerant', 'direction'].includes(role));");
    expect(page).toContain('const ferme = (!ouvert);');
    expect(page).toContain('setOuvert((!ouvert));');
  });
  it('devient du Swift', () => {
    const page = pageApple(source);
    expect(page).toContain('private var estChef: Bool { (["gerant", "direction"].contains(role)) }');
    expect(page).toContain('private var ferme: Bool { (!ouvert) }');
  });
  it('est un vrai ou faux pour l’analyse', () => {
    const r = compiler(programme('page "accueil" :', '>variable n = 1', '>calcul grand = n est superieur a 3', '>calcul double = grand * 2', '>titre "a"'));
    expect(r.diagnostics.some((d) => d.gravite === 'erreur')).toBe(true);
  });
});

describe('« {a la ligne} »', () => {
  it('va à la ligne, comme « {saut de ligne} »', () => {
    const page = pageWeb(programme('page "accueil" :', '>titre "a"', '>texte "Bonjour,{a la ligne}Merci."', '>texte "Un{à la ligne}Deux"'));
    expect(page).toContain("{'Bonjour,\\nMerci.'}");
    expect(page).toContain("{'Un\\nDeux'}");
  });
});

describe('le bouton à icône seule', () => {
  const source = programme('page "accueil" :', '>variable ouvert = vrai', '>titre "Essai"', '>bouton icone "fermer" avec nom "Fermer la fenêtre"', '>quand l\'utilisateur clique sur "Fermer la fenêtre" :', '>>changer ouvert par faux');
  it('ne montre que l’icône, et donne son nom au lecteur d’écran', () => {
    const page = pageWeb(source);
    expect(page).toContain('aria-label="Fermer la fenêtre"');
    expect(page).toMatch(/<button[^>]*aria-label="Fermer la fenêtre"[^>]*><XIcon className="humalis-icone" aria-hidden="true" \/><\/button>/);
  });
  it('sur Apple, l’icône porte le nom pour VoiceOver', () => {
    expect(pageApple(source)).toContain('Image(systemName: "xmark").accessibilityLabel(Text(verbatim: "Fermer la fenêtre"))');
  });
  it('sans nom, le compilateur l’explique', () => {
    const r = compiler(programme('page "accueil" :', '>titre "a"', '>bouton icone "fermer"'));
    expect(r.diagnostics.map((d) => d.message).join(' ')).toContain('a besoin d\'un nom');
  });
});

describe('« avec desactive »', () => {
  const source = programme('page "accueil" :', '>variable panier = []', '>titre "Essai"', '>bouton "Payer" avec desactive si panier est vide et couleur bleu', '>bouton "Bientôt" avec desactive');
  it('suit sa condition sur le web, et se voit', () => {
    const fichiers = web(source);
    const page = fichiers.get('src/pages/Accueil.tsx')!;
    expect(page).toContain('className="humalis-couleur-bleu" disabled={(panier?.length ?? 0) === 0}>Payer</button>');
    expect(page).toContain('disabled={true}>Bientôt</button>');
    expect([...fichiers.values()].join('\n')).toContain('button:disabled { opacity: 0.5; cursor: not-allowed; }');
  });
  it('devient .disabled sur Apple', () => {
    const page = pageApple(source);
    expect(page).toContain('.disabled(panier.isEmpty)');
    expect(page).toContain('.disabled(true)');
  });
  it('ne vaut que pour un bouton', () => {
    const r = compiler(programme('page "accueil" :', '>titre "a" avec desactive'));
    expect(r.diagnostics.map((d) => d.message).join(' ')).toContain('s\'applique à un bouton');
  });
});

describe('« video »', () => {
  const source = programme('page "accueil" :', '>titre "Essai"', '>video "https://exemple.test/clip.mp4" avec commandes et description "Présentation" et boucle');
  it('devient un lecteur avec ses commandes, jamais lancé seul', () => {
    const page = pageWeb(source);
    expect(page).toContain('<video controls preload="metadata" playsInline src="https://exemple.test/clip.mp4" aria-label="Présentation" loop className="humalis-video" />');
    expect(page).not.toContain('autoPlay');
  });
  it('devient VideoHumalis sur Apple', () => {
    expect(pageApple(source)).toContain('VideoHumalis(source: .adresse("https://exemple.test/clip.mp4"), description: "Présentation", transcription: nil, boucle: true)');
  });
  it('demande « avec commandes » et une description', () => {
    const r = compiler(programme('page "accueil" :', '>titre "a"', '>video "https://exemple.test/clip.mp4"'));
    const messages = r.diagnostics.map((d) => d.message).join(' ');
    expect(messages).toContain('ajoutez « avec commandes »');
    expect(messages).toContain('décrivez la vidéo');
  });
  it('refuse un format que les navigateurs ne jouent pas', () => {
    const r = compiler(programme('page "accueil" :', '>titre "a"', '>video "film.avi" avec commandes et description "x"'));
    expect(r.diagnostics.map((d) => d.message).join(' ')).toContain('n’est pas une vidéo');
  });
});

describe('« jeton secret depuis l’environnement »', () => {
  const source = programme(
    'serveur "s" :', '>donnee note :', '>>texte : texte', '>route "notes" :', '>>tout le monde peut lire note',
    'source "meteo" :', '>adresse "https://api.meteo.example"', '>jeton secret depuis l\'environnement "METEO_CLE" dans le parametre "key"',
    '>route "previsions" :', '>>tout le monde peut lire une liste de prevision dans "jours"', '>>seul admin peut supprimer prevision',
    '>donnee prevision :', '>>jour : texte',
    'page "accueil" :', '>variable previsions = []', '>titre "Météo"', '>quand la page se charge :', '>>envoyer requete vers "previsions" de la source "meteo" dans previsions',
  );
  it('fait passer les pages par la passerelle du serveur, avec les droits de chaque route', async () => {
    const { genererProjetServeur } = await import('../src/cibles/serveur/projet.js');
    const app = sansErreur(source);
    const serveur = [...genererProjetServeur(app.serveurs[0], { nom: 's' } as never).entries()];
    const code = serveur.find(([k]) => k.endsWith('serveur.ts'))![1];
    expect(code).toContain('passerelleMeteo.get("/previsions", lecturePrivee, ...acces.toutLeMonde, relaisMeteo);');
    expect(code).toContain('passerelleMeteo.delete("/previsions/:id", ...acces.seulAdmin, csrfMiddleware, relaisMeteo);');
    expect(code).toContain('passerelleMeteo.post("/previsions", refuse, csrfMiddleware, relaisMeteo);');
    expect(code).toContain('app.use("/api/passerelle/meteo", passerelleMeteo);');
    expect(serveur.find(([k]) => k.endsWith('.env.exemple'))![1]).toContain('METEO_CLE=\n');
  });
});
