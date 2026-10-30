import { useState } from 'react';
import { compiler } from '../../../src/compilateur';
import { genererProjetStatique } from '../../../src/cibles/statique/projet';
import { EXEMPLES } from '../contenu/exemples';
import { useTitre } from '../composants/useTitre';

const identifiants = ['pages-simple', 'elements-titre-texte', 'pages-deux'];
export const EXEMPLES_BAC = identifiants.map((id) => {
  const exemple = EXEMPLES.find((entree) => entree.id === id && entree.mode === 'programme');
  if (!exemple) throw new Error(`Exemple vérifié absent : ${id}`);
  return { id, code: exemple.code };
});

/** Réunit les fichiers du site statique en un document pour le cadre isolé. */
export function compilerPourBac(source: string): { diagnostics: string[]; srcdoc: string } {
  const resultat = compiler(source);
  const diagnostics = resultat.diagnostics.map((d) => `Ligne ${d.ligne} : ${d.message}`);
  if (!resultat.application) return { diagnostics, srcdoc: '' };
  try {
    const fichiers = genererProjetStatique(resultat.application, { nom: 'essai', source: 'bac-a-sable.humalis' });
    let html = fichiers.get('index.html') ?? '';
    html = html.replace(/<link rel="stylesheet" href="([^"]+)">/g, (_balise, chemin: string) =>
      `<style>${(fichiers.get(chemin) ?? '').replace(/<\/style/gi, '<\\/style')}</style>`);
    const scripts: string[] = [];
    html = html.replace(/<script src="([^"]+)" defer><\/script>/g, (_balise, chemin: string) => {
      scripts.push(`<script>${(fichiers.get(chemin) ?? '').replace(/<\/script/gi, '<\\/script')}</script>`);
      return '';
    });
    html = html.replace('<head>', '<head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; connect-src \'none\'; form-action \'none\'">');
    // Une fonction, et non un texte de remplacement : les « $& » ou « $' » du code recopié ne doivent pas être interprétés.
    html = html.replace('</body>', () => `${scripts.join('\n')}</body>`);
    return { diagnostics, srcdoc: html };
  } catch (erreur) {
    return { diagnostics: [...diagnostics, erreur instanceof Error ? erreur.message : String(erreur)], srcdoc: '' };
  }
}

export function BacASable() {
  useTitre('Bac à sable');
  const [source, definirSource] = useState(EXEMPLES_BAC[0].code);
  const { diagnostics, srcdoc } = compilerPourBac(source);
  return <article className="article">
    <h1>Bac à sable</h1>
    <p>Écris du Humalis et vois le résultat au fil de la frappe. Tout se passe dans ton navigateur.</p>
    <p>Charge un exemple : {' '}{EXEMPLES_BAC.map((exemple) =>
      <button type="button" key={exemple.id} onClick={() => definirSource(exemple.code)}>{exemple.id}</button>)}</p>
    <label htmlFor="source-humalis">Code Humalis</label>
    <textarea id="source-humalis" value={source} onChange={(evenement) => definirSource(evenement.target.value)} rows={18} spellCheck={false} style={{ width: '100%', fontFamily: 'monospace' }} />
    <h2>Messages</h2>
    <div role="status" aria-live="polite">{diagnostics.length ? <ul>{diagnostics.map((message, index) => <li key={index}>{message}</li>)}</ul> : <p>Aucune erreur.</p>}</div>
    <h2>Résultat</h2>
    {srcdoc ? <iframe title="Aperçu du site Humalis" sandbox="allow-scripts" srcDoc={srcdoc} style={{ width: '100%', minHeight: 360, border: '1px solid currentColor' }} /> : <p>Corrige le code pour voir le résultat.</p>}
  </article>;
}
