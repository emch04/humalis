// Un projet React écrit à la main, qui n'est PAS produit par Humalis :
// il importe les pages de la boutique, compilées avec
// « humalis compile exemples/boutique.humalis --cible web --composants src/humalis-boutique ».
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Route, Routes } from 'react-router';
import { HumalisRacine } from './humalis-boutique/humalis/racine';
import Boutique from './humalis-boutique/pages/Boutique';
import Panier from './humalis-boutique/pages/Panier';

function EnTete() {
  return (
    <header style={{ padding: '1rem', borderBottom: '1px solid #ccc' }}>
      <strong>Projet React hôte</strong> · <Link to="/">Boutique</Link> · <Link to="/panier">Panier</Link>
    </header>
  );
}

createRoot(document.getElementById('racine')!).render(
  <StrictMode>
    <BrowserRouter>
      <HumalisRacine>
        <EnTete />
        <Routes>
          <Route path="/" element={<Boutique />} />
          <Route path="/panier" element={<Panier />} />
        </Routes>
      </HumalisRacine>
    </BrowserRouter>
  </StrictMode>,
);
