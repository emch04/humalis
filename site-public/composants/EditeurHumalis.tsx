/**
 * Le bac à sable du site public : on écrit du Humalis à gauche, le site
 * produit apparaît à droite, les messages du compilateur dessous.
 *
 * Le compilateur tourne dans le navigateur. Il n'alourdit pas le site : il
 * n'est chargé qu'à l'ouverture de cette page, depuis le paquet npm publié
 * (`dist/navigateur.js`, servi par jsDelivr). En local (localhost), il est
 * pris à côté du site, pour essayer une version pas encore publiée.
 *
 * L'aperçu est le site statique produit par Humalis, dans un cadre isolé :
 * scripts permis, mais ni réseau, ni formulaire envoyé, ni accès à la page.
 */
import { useEffect, useState } from 'react';

interface Compilateur {
  compiler(source: string): {
    application?: unknown;
    diagnostics: { ligne: number; message: string; gravite: string }[];
  };
  genererProjetStatique(application: unknown, options: { nom: string; source: string }): Map<string, string>;
}

const EN_LOCAL = typeof location !== 'undefined' && ['localhost', '127.0.0.1'].includes(location.hostname);
const ADRESSE_COMPILATEUR = EN_LOCAL ? '/navigateur.js' : 'https://cdn.jsdelivr.net/npm/humalis@1/dist/navigateur.js';

const EXEMPLES = [
  {
    id: 'boutique',
    nom: { fr: 'Boutique', en: 'Shop' },
    code: `theme :
    couleur marque "#0f766e"
    mode clair

style :
    body { background: #f4f7f6; }
    .vitrine { max-width: 760px; margin: 0 auto; padding: 2.5rem 1rem; }
    .produit { background: #fff; border-radius: 1rem; padding: 1.5rem 1rem; text-align: center; font-weight: 600; box-shadow: 0 6px 20px rgb(15 118 110 / 0.08); }
    .commander { display: block; margin: 2rem auto 0; padding: 0.85rem 1.8rem; border: 0; border-radius: 999px; font-weight: 700; }

page "boutique" :
    bloc avec style "vitrine" :
        titre "Nos produits" avec couleur marque
        texte "Livraison offerte dès 30 €."
        variable produits = ["Livre", "Stylo", "Cahier"]
        grille avec colonnes 3 et espacement moyenne :
            pour chaque nom dans produits :
                texte nom avec style "produit"
        bouton "Commander" avec fond marque et texte blanc et style "commander"
    quand l'utilisateur clique sur "Commander" :
        afficher reussite "Merci pour ta commande !"`,
  },
  {
    id: 'compteur',
    nom: { fr: 'Compteur', en: 'Counter' },
    code: `theme :
    couleur marque "#4338ca"
    mode clair

style :
    body { background: #eef0fb; }
    .carte { max-width: 360px; margin: 3rem auto; padding: 2rem; background: #fff; border-radius: 1.25rem; text-align: center; box-shadow: 0 12px 32px rgb(67 56 202 / 0.12); }
    .nombre { font-size: 4rem; font-weight: 800; margin: 0.5rem 0; color: #4338ca; }
    .cliquer { padding: 0.8rem 2rem; border: 0; border-radius: 999px; font-weight: 700; }

page "compteur" :
    variable clics = 0
    bloc avec style "carte" :
        titre "Compteur"
        texte "{clics}" avec style "nombre"
        texte "clics jusqu'ici"
        bouton "Cliquer" avec fond marque et texte blanc et style "cliquer"
    quand l'utilisateur clique sur "Cliquer" :
        changer clics par clics + 1`,
  },
  {
    id: 'formulaire',
    nom: { fr: 'Formulaire', en: 'Form' },
    code: `theme :
    couleur marque "#be185d"
    mode clair

style :
    body { background: #fdf2f6; }
    .carte { max-width: 480px; margin: 2.5rem auto; padding: 2rem; background: #fff; border-radius: 1.25rem; box-shadow: 0 12px 32px rgb(190 24 93 / 0.10); }
    .carte input, .carte textarea { width: 100%; padding: 0.7rem 0.8rem; border: 1px solid #e7d3dc; border-radius: 0.6rem; font: inherit; box-sizing: border-box; }
    .carte button { width: 100%; margin-top: 0.5rem; padding: 0.8rem; border: 0; border-radius: 0.6rem; font-weight: 700; }

page "contact" :
    bloc avec style "carte" :
        titre "Nous écrire" avec couleur marque
        texte "Réponse sous 24 heures."
        formulaire "message" :
            champ "Nom" avec obligatoire
            champ email "Email" avec obligatoire
            champ texte long "Message"
            bouton "Envoyer" avec fond marque et texte blanc
    quand le formulaire "message" est soumis :
        afficher reussite "Message envoyé"`,
  },
  {
    id: 'restaurant',
    nom: { fr: 'Restaurant', en: 'Restaurant' },
    code: `theme :
    couleur marque "#9a3412"
    police titres "Georgia"
    mode clair

style :
    body { background: #fbf7f2; }
    .entete { text-align: center; padding: 2.5rem 1rem 1.5rem; }
    .entete h1 { font-size: 2.6rem; margin: 0; letter-spacing: -0.02em; }
    .entete p { color: #78716c; margin: 0.5rem 0 0; }
    .plat { background: #fff; border-radius: 1rem; padding: 1.25rem; box-shadow: 0 8px 24px rgb(120 53 15 / 0.08); }
    .plat h3 { margin: 0 0 0.25rem; }
    .prix { color: #9a3412; font-weight: 700; margin: 0.5rem 0 0; }
    .reserver { display: block; margin: 2rem auto; padding: 0.85rem 1.6rem; border-radius: 999px; border: 0; font-weight: 700; }

page "accueil" :
    bloc avec style "entete" :
        titre "Le Comptoir" avec couleur marque
        texte "Une cuisine de saison, au cœur de la ville."
    section :
        soustitre "Nos plats"
        grille avec colonnes 3 et espacement moyenne :
            bloc avec style "plat" :
                soustitre "Risotto" avec niveau 3
                texte "Champignons et parmesan"
                texte "16 €" avec style "prix"
            bloc avec style "plat" :
                soustitre "Tarte fine" avec niveau 3
                texte "Légumes du marché"
                texte "14 €" avec style "prix"
            bloc avec style "plat" :
                soustitre "Poisson du jour" avec niveau 3
                texte "Selon la pêche"
                texte "19 €" avec style "prix"
    bouton "Réserver une table" avec fond marque et texte blanc et style "reserver"
    quand l'utilisateur clique sur "Réserver une table" :
        afficher reussite "À bientôt au Comptoir !"`,
  },
  {
    id: 'taches',
    nom: { fr: 'Tâches', en: 'To-do list' },
    code: `theme :
    couleur marque "#1d4ed8"
    mode clair

style :
    body { background: #f1f5fb; }
    .carte { max-width: 520px; margin: 2.5rem auto; padding: 2rem; background: #fff; border-radius: 1.25rem; box-shadow: 0 12px 32px rgb(29 78 216 / 0.10); }
    .tache { justify-content: space-between; align-items: center; padding: 0.6rem 0; border-bottom: 1px solid #e5e9f2; }
    .tache p { margin: 0; }
    .ajouter { margin-bottom: 1rem; padding: 0.7rem 1.4rem; border: 0; border-radius: 999px; font-weight: 700; }

page "taches" :
    variable taches = ["Acheter du pain", "Appeler Sam"]
    variable numero = 0
    calcul combien = nombre de taches
    bloc avec style "carte" :
        titre "Mes tâches" avec couleur marque
        texte "{combien} tâches à faire"
        bouton "Ajouter une tâche" avec fond marque et texte blanc et style "ajouter"
        pour chaque t dans taches :
            ligne avec style "tache" :
                texte t
                bouton "Fait"
                quand l'utilisateur clique sur "Fait" :
                    retirer t de taches
                    afficher reussite "Bravo !"
    quand l'utilisateur clique sur "Ajouter une tâche" :
        changer numero par numero + 1
        ajouter "Tâche n° {numero}" à taches`,
  },
  {
    id: 'bilingue',
    nom: { fr: 'Bilingue', en: 'Bilingual' },
    code: `langues :
    francais
    anglais

theme :
    couleur marque "#b45309"
    mode clair

style :
    body { background: linear-gradient(160deg, #fff7ed, #fef3c7); min-height: 100vh; }
    .accueil { max-width: 560px; margin: 0 auto; padding: 3rem 1rem; text-align: center; }
    .accueil h1 { font-size: 2.8rem; margin: 1.5rem 0 0.5rem; }
    .accueil select { padding: 0.4rem 0.8rem; border: 1px solid #f3d9b1; border-radius: 999px; background: #fff; font: inherit; }
    .bonjour { margin-top: 1.5rem; padding: 0.8rem 1.8rem; border: 0; border-radius: 999px; font-weight: 700; }

page "accueil" :
    bloc avec style "accueil" :
        selecteur de langue
        titre "Bienvenue" en anglais "Welcome" avec couleur marque
        texte "Ce site parle français et anglais." en anglais "This site speaks French and English."
        bouton "Dire bonjour" en anglais "Say hello" avec fond marque et texte blanc et style "bonjour"
    quand l'utilisateur clique sur "Dire bonjour" :
        afficher "Bonjour !" en anglais "Hello!"`,
  },
];

const TEXTES = {
  fr: {
    exemples: 'Exemples',
    code: 'Ton code Humalis',
    apercu: 'Aperçu',
    messages: 'Messages du compilateur',
    aucuneErreur: 'Aucune erreur.',
    corriger: 'Corrige le code pour voir le résultat.',
    cadre: 'Aperçu du site produit par Humalis',
    chargement: 'Chargement du compilateur…',
    indisponible: 'Le compilateur n’a pas pu être chargé. Vérifie ta connexion, puis recharge la page.',
  },
  en: {
    exemples: 'Examples',
    code: 'Your Humalis code',
    apercu: 'Preview',
    messages: 'Compiler messages',
    aucuneErreur: 'No errors.',
    corriger: 'Fix the code to see the result.',
    cadre: 'Preview of the site produced by Humalis',
    chargement: 'Loading the compiler…',
    indisponible: 'The compiler could not be loaded. Check your connection, then reload the page.',
  },
};

/** Le site statique produit, réuni en un seul document pour le cadre isolé. */
function compilerPourLeCadre(humalis: Compilateur, source: string): { messages: { ligne: number; texte: string; erreur: boolean }[]; document: string } {
  const resultat = humalis.compiler(source);
  const messages = resultat.diagnostics.map((d) => ({ ligne: d.ligne, texte: d.message, erreur: d.gravite === 'erreur' }));
  if (!resultat.application || messages.some((m) => m.erreur)) return { messages, document: '' };
  try {
    const fichiers = humalis.genererProjetStatique(resultat.application, { nom: 'bac-a-sable', source: 'bac-a-sable.humalis' });
    let html = fichiers.get('index.html') ?? '';
    html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_balise, chemin: string) =>
      `<style>${(fichiers.get(chemin) ?? '').replace(/<\/style/gi, '<\\/style')}</style>`);
    const scripts: string[] = [];
    html = html.replace(/<script src="([^"]+)" defer><\/script>/g, (_balise, chemin: string) => {
      scripts.push(`<script>${(fichiers.get(chemin) ?? '').replace(/<\/script/gi, '<\\/script')}</script>`);
      return '';
    });
    html = html.replace(
      '<head>',
      `<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'">`,
    );
    // Une fonction : les « $& » du code recopié ne doivent pas être interprétés.
    html = html.replace('</body>', () => `${scripts.join('\n')}</body>`);
    return { messages, document: html };
  } catch (erreur) {
    return { messages: [...messages, { ligne: 0, texte: erreur instanceof Error ? erreur.message : String(erreur), erreur: true }], document: '' };
  }
}

/** La langue du site (l'attribut lang de la page, que Humalis tient à jour). */
function useLangue(): 'fr' | 'en' {
  const [langue, definirLangue] = useState<'fr' | 'en'>('fr');
  useEffect(() => {
    const lire = () => definirLangue(document.documentElement.lang.startsWith('en') ? 'en' : 'fr');
    lire();
    const observation = new MutationObserver(lire);
    observation.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    return () => observation.disconnect();
  }, []);
  return langue;
}

/** `exemple` : l'exemple à ouvrir (« /bac-a-sable?exemple=restaurant »), sinon le premier. */
export default function EditeurHumalis({ exemple }: { exemple?: string | null }) {
  const langue = useLangue();
  const t = TEXTES[langue];
  const [source, definirSource] = useState((EXEMPLES.find((e) => e.id === exemple) ?? EXEMPLES[0]).code);
  // On attend une courte pause dans la frappe avant de recompiler.
  const [aCompiler, definirACompiler] = useState(source);
  useEffect(() => {
    const minuterie = window.setTimeout(() => definirACompiler(source), 250);
    return () => window.clearTimeout(minuterie);
  }, [source]);
  // Le compilateur arrive une fois, à l'ouverture de la page.
  const [humalis, definirHumalis] = useState<Compilateur | null | 'erreur'>(null);
  useEffect(() => {
    import(/* @vite-ignore */ ADRESSE_COMPILATEUR).then(
      (module: Compilateur) => definirHumalis(module),
      () => definirHumalis('erreur'),
    );
  }, []);
  const pret = humalis !== null && humalis !== 'erreur';
  const { messages, document: apercu } = pret ? compilerPourLeCadre(humalis, aCompiler) : { messages: [], document: '' };

  return (
    <div className="bac">
      <div className="bac-exemples" role="group" aria-label={t.exemples}>
        <span className="bac-exemples-titre">{t.exemples}</span>
        {EXEMPLES.map((exemple) => (
          <button key={exemple.id} type="button" className="bac-exemple" aria-pressed={source === exemple.code} onClick={() => definirSource(exemple.code)}>
            {exemple.nom[langue]}
          </button>
        ))}
      </div>
      <div className="bac-panneaux">
        <div className="bac-panneau bac-editeur">
          <label htmlFor="bac-source" className="bac-etiquette">{t.code}</label>
          <textarea
            id="bac-source"
            className="bac-source"
            value={source}
            onChange={(evenement) => definirSource(evenement.target.value)}
            onKeyDown={(evenement) => {
              // Tab écrit quatre espaces, l'indentation de Humalis ; Échap rend Tab à la navigation.
              if (evenement.key !== 'Tab' || evenement.shiftKey) return;
              evenement.preventDefault();
              const zone = evenement.currentTarget;
              const debut = zone.selectionStart;
              const suite = source.slice(0, debut) + '    ' + source.slice(zone.selectionEnd);
              definirSource(suite);
              requestAnimationFrame(() => zone.setSelectionRange(debut + 4, debut + 4));
            }}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
          />
        </div>
        <div className="bac-panneau bac-resultat">
          <span className="bac-etiquette">{t.apercu}</span>
          {apercu ? (
            <iframe className="bac-cadre" title={t.cadre} sandbox="allow-scripts" srcDoc={apercu} />
          ) : (
            <p className="bac-vide">{humalis === null ? t.chargement : humalis === 'erreur' ? t.indisponible : t.corriger}</p>
          )}
        </div>
      </div>
      <div className="bac-messages" role="status" aria-live="polite">
        <span className="bac-etiquette">{t.messages}</span>
        {!pret ? null : messages.length === 0 ? (
          <p className="bac-ok">{t.aucuneErreur}</p>
        ) : (
          <ul>
            {messages.map((message, index) => (
              <li key={index} className={message.erreur ? 'bac-erreur' : 'bac-avertissement'}>
                {message.ligne > 0 ? `${langue === 'en' ? 'Line' : 'Ligne'} ${message.ligne} : ` : ''}
                {message.texte}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
