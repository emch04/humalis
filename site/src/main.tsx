import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { routes } from './routes';
import './styles/global.css';

const routeur = createBrowserRouter(routes, { basename: import.meta.env.BASE_URL.replace(/\/$/, '') || undefined });

createRoot(document.getElementById('racine')!).render(
  <StrictMode>
    <RouterProvider router={routeur} />
  </StrictMode>,
);
