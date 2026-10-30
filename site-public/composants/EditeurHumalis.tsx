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
    nom: { fr: 'Boutique', en: 'Shop' },
    code: `page "boutique" :
    titre "Nos produits"
    variable produits = ["Livre", "Stylo", "Cahier"]
    pour chaque nom dans produits :
        texte nom
    bouton "Commander"
    quand l'utilisateur clique sur "Commander" :
        afficher "Merci pour ta commande !"`,
  },
  {
    nom: { fr: 'Compteur', en: 'Counter' },
    code: `page "compteur" :
    variable clics = 0
    titre "Compteur"
    texte "Tu as cliqué {clics} fois"
    bouton "Cliquer"
    quand l'utilisateur clique sur "Cliquer" :
        changer clics par clics + 1`,
  },
  {
    nom: { fr: 'Formulaire', en: 'Form' },
    code: `page "contact" :
    titre "Nous écrire"
    formulaire "message" :
        champ "Nom" avec obligatoire
        champ email "Email" avec obligatoire
        champ texte long "Message"
        bouton "Envoyer"
    quand le formulaire "message" est soumis :
        afficher reussite "Message envoyé"`,
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

export default function EditeurHumalis() {
  const langue = useLangue();
  const t = TEXTES[langue];
  const [source, definirSource] = useState(EXEMPLES[0].code);
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
          <button key={exemple.nom.fr} type="button" className="bac-exemple" aria-pressed={source === exemple.code} onClick={() => definirSource(exemple.code)}>
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
