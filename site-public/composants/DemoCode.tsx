import { useEffect, useState } from 'react';

// La frappe synchronisée avec l'aperçu est la seule interaction hors Humalis.
const source = `page "boutique" :
    titre "Nos produits"
    variable produits = ["Livre", "Stylo", "Cahier"]
    pour chaque nom dans produits :
        texte nom
    bouton "Commander"
    quand l'utilisateur clique sur "Commander" :
        afficher "Merci pour ta commande !"`;

export default function DemoCode() {
  const [nombre, definirNombre] = useState(0);
  const [commande, definirCommande] = useState(false);
  const [anglais, definirAnglais] = useState(false);

  useEffect(() => {
    const mettreAJour = () => definirAnglais(document.documentElement.lang.startsWith('en'));
    mettreAJour();
    const observation = new MutationObserver(mettreAJour);
    observation.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    return () => observation.disconnect();
  }, []);

  useEffect(() => {
    const reduit = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduit.matches) { definirNombre(source.length); return; }
    const minuterie = window.setInterval(() => definirNombre(valeur => {
      if (valeur >= source.length) { window.clearInterval(minuterie); return valeur; }
      return valeur + 1;
    }), 24);
    return () => window.clearInterval(minuterie);
  }, []);

  const courant = source.slice(0, nombre);
  const afficheListe = courant.includes('texte nom');
  return <div className="demo-shell" aria-label={anglais ? 'Humalis code and live preview' : 'Code Humalis et aperçu en direct'}>
    <div className="demo-grid">
      <div className="editor-pane">
        <div className="pane-top"><span className="dots" aria-hidden="true"><i /><i /><i /></span><span>boutique.humalis</span><span>● {anglais ? 'live' : 'en direct'}</span></div>
        <pre className="editor-code"><code>{courant}</code><span className="typing-cursor" aria-hidden="true" /></pre>
      </div>
      <div className="preview-pane">
        <div className="pane-top"><span>{anglais ? 'Web preview' : 'Aperçu web'}</span><span>↗</span></div>
        <div className="preview-body"><span className="preview-caption">{anglais ? 'My shop' : 'Ma boutique'}</span>
          <h3>{courant.includes('titre "Nos produits"') ? anglais ? 'Our products' : 'Nos produits' : ''}</h3>
          <div className="preview-list">{afficheListe && [anglais ? 'Book' : 'Livre', anglais ? 'Pen' : 'Stylo', anglais ? 'Notebook' : 'Cahier'].map(nom => <div className="preview-item show" key={nom}>{nom}</div>)}</div>
          {courant.includes('bouton "Commander"') && <button className="preview-order show" onClick={() => definirCommande(true)}>{anglais ? 'Order' : 'Commander'}</button>}
          <p className="preview-message" role="status">{commande ? anglais ? 'Thank you for your order!' : 'Merci pour ta commande !' : ''}</p>
        </div>
      </div>
    </div>
  </div>;
}
