import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { CasTest } from '../parser/ast.js';
import { libelleEtape, messageEchec } from './rapport-tests.js';

export interface ResultatVerification { fichier: string; test: string; page: string; ligne: number; succes: boolean; message: string }

/** Chaque cas repart d'un contexte isolé. */
export async function executerDansChromium(sortie: string, adresse: string, cas: { fichier: string; test: CasTest }[], detail = false): Promise<ResultatVerification[]> {
  const require = createRequire(join(sortie, 'package.json'));
  const { chromium } = require('playwright') as { chromium: { launch: () => Promise<any> } };
  const navigateur = await chromium.launch();
  const resultats: ResultatVerification[] = [];
  try {
    for (const { fichier, test } of cas) {
      const contexte = await navigateur.newContext();
      try {
        const page = await contexte.newPage();
        try { await page.goto(`${adresse}/${test.page === 'accueil' ? '' : test.page}`, { waitUntil: 'networkidle', timeout: 5000 }); }
        catch (erreur) {
          resultats.push({ fichier, test: test.nom, page: test.page, ligne: test.ligne, succes: false, message: `la page « ${test.page} » ne s’est pas chargée (attendu 5 secondes)${detail ? `\n${(erreur as Error).message}` : ''}` });
          continue;
        }
        for (const etape of test.etapes) {
          let obtenu: string | undefined;
          try {
            if (etape.type === 'Cliquer') await page.getByRole('button', { name: etape.cible, exact: true }).or(page.getByRole('link', { name: etape.cible, exact: true })).click({ timeout: 5000 });
            else if (etape.type === 'RemplirChamp') await page.getByLabel(etape.cible, { exact: true }).fill(etape.valeur, { timeout: 5000 });
            else if (etape.type === 'AllerVers') await page.goto(`${adresse}/${etape.cible === 'accueil' ? '' : etape.cible}`, { waitUntil: 'networkidle', timeout: 5000 });
            else if (etape.type === 'VerifierTexteVisible') await page.getByText(etape.cible, { exact: true }).waitFor({ state: 'visible', timeout: 5000 });
            else if (etape.type === 'VerifierTexteAbsent') await page.getByText(etape.cible, { exact: true }).waitFor({ state: 'hidden', timeout: 5000 });
            else if (etape.type === 'VerifierPage') {
              obtenu = new URL(page.url()).pathname.replace(/^\//u, '') || 'accueil';
              if (obtenu !== etape.cible) throw new Error(`page attendue « ${etape.cible} », obtenue « ${obtenu} »`);
            } else if (etape.type === 'VerifierChamp') {
              obtenu = await page.getByLabel(etape.cible, { exact: true }).inputValue({ timeout: 5000 });
              if (obtenu !== etape.valeur) throw new Error(`valeur attendue « ${etape.valeur} », obtenue « ${obtenu} »`);
            }
            resultats.push({ fichier, test: test.nom, page: test.page, ligne: etape.ligne, succes: true, message: libelleEtape(etape) });
          } catch (erreur) {
            resultats.push({ fichier, test: test.nom, page: test.page, ligne: etape.ligne, succes: false, message: `${libelleEtape(etape)} : ${messageEchec(etape, erreur as Error, obtenu, detail)}` });
            break;
          }
        }
      } finally { await contexte.close(); }
    }
  } finally { await navigateur.close(); }
  return resultats;
}
