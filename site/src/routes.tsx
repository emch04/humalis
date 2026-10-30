import type { RouteObject } from 'react-router';
import { Page } from './composants/Page';
import { BacASable } from './pages/BacASable';
import { Accueil } from './pages/Accueil';
import { Introuvable } from './pages/Introuvable';
import { Sommaire } from './pages/documentation/Sommaire';
import { PriseEnMain } from './pages/documentation/PriseEnMain';
import { CreerTonSiteWeb } from './pages/documentation/CreerTonSiteWeb';
import { Principes } from './pages/documentation/Principes';
import { Pages } from './pages/documentation/Pages';
import { Elements } from './pages/documentation/Elements';
import { Styles } from './pages/documentation/Styles';
import { Evenements } from './pages/documentation/Evenements';
import { Actions } from './pages/documentation/Actions';
import { Variables } from './pages/documentation/Variables';
import { Conditions } from './pages/documentation/Conditions';
import { ListesEtBoucles } from './pages/documentation/ListesEtBoucles';
import { Requetes } from './pages/documentation/Requetes';
import { Partage } from './pages/documentation/Partage';
import { MiseEnPage } from './pages/documentation/MiseEnPage';
import { ElementsEcran } from './pages/documentation/ElementsEcran';
import { PlusieursFichiers } from './pages/documentation/PlusieursFichiers';
import { Composants } from './pages/documentation/Composants';
import { HumalisDansReact } from './pages/documentation/HumalisDansReact';
import { Serveur } from './pages/documentation/Serveur';
import { RelierAuServeur } from './pages/documentation/RelierAuServeur';
import { TonApplicationMobile } from './pages/documentation/TonApplicationMobile';
import { TonApplicationDeBureau } from './pages/documentation/TonApplicationDeBureau';
import { TonSiteStatique } from './pages/documentation/TonSiteStatique';
import { Vocabulaire } from './pages/documentation/Vocabulaire';
import { Erreurs } from './pages/documentation/Erreurs';

/** Les routes à la main : une par page. Le chemin de chaque page de documentation vient du sommaire. */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Page />,
    children: [
      { index: true, element: <Accueil /> },
      { path: 'bac-a-sable', element: <BacASable /> },
      { path: 'documentation', element: <Sommaire /> },
      { path: 'documentation/prise-en-main', element: <PriseEnMain /> },
      { path: 'documentation/creer-ton-site-web', element: <CreerTonSiteWeb /> },
      { path: 'documentation/ton-application-mobile', element: <TonApplicationMobile /> },
      { path: 'documentation/ton-application-de-bureau', element: <TonApplicationDeBureau /> },
      { path: 'documentation/ton-site-statique', element: <TonSiteStatique /> },
      { path: 'documentation/principes', element: <Principes /> },
      { path: 'documentation/pages', element: <Pages /> },
      { path: 'documentation/elements', element: <Elements /> },
      { path: 'documentation/styles', element: <Styles /> },
      { path: 'documentation/mise-en-page', element: <MiseEnPage /> },
      { path: 'documentation/elements-ecran', element: <ElementsEcran /> },
      { path: 'documentation/evenements', element: <Evenements /> },
      { path: 'documentation/actions', element: <Actions /> },
      { path: 'documentation/variables', element: <Variables /> },
      { path: 'documentation/conditions', element: <Conditions /> },
      { path: 'documentation/listes-et-boucles', element: <ListesEtBoucles /> },
      { path: 'documentation/requetes', element: <Requetes /> },
      { path: 'documentation/partager-entre-les-pages', element: <Partage /> },
      { path: 'documentation/plusieurs-fichiers', element: <PlusieursFichiers /> },
      { path: 'documentation/composants', element: <Composants /> },
      { path: 'documentation/humalis-dans-react', element: <HumalisDansReact /> },
      { path: 'documentation/le-serveur', element: <Serveur /> },
      { path: 'documentation/relier-au-serveur', element: <RelierAuServeur /> },
      { path: 'documentation/vocabulaire', element: <Vocabulaire /> },
      { path: 'documentation/erreurs', element: <Erreurs /> },
      { path: '*', element: <Introuvable /> },
    ],
  },
];
