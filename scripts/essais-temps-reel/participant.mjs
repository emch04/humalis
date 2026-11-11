#!/usr/bin/env node
// L'autre personne d'un essai sur un appareil (iPhone, Android, Windows) : un navigateur à caméra simulée,
// branché sur un serveur laissé ouvert par scripts/essai-reunions.mjs --garder. Il dit ce qu'il voit.
//
// node scripts/essais-temps-reel/participant.mjs <adresse du site> <email> discussion|appel|appeler|reunion [secondes]
import { chargerPlaywright } from '../outils-essai.mjs';

const [adresse, email, mode, duree = '180'] = process.argv.slice(2);
const MOT = 'Essai-Solide-2026!';
const { chromium } = chargerPlaywright();
const navigateur = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const page = await (await navigateur.newContext({ permissions: ['camera', 'microphone'] })).newPage();
const fin = Date.now() + Number(duree) * 1000;
const dire = (texte) => console.log(`[${new Date().toLocaleTimeString('fr-FR')}] ${texte}`);
await page.goto(adresse);
const statut = await page.evaluate(async ([e, m]) => (await fetch('/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: e, password: m }) })).status, [email, MOT]);
dire(`connexion de ${email} : ${statut}`);
const etat = () => page.evaluate(() => ({ texte: document.body.innerText.slice(0, 600), images: [...document.querySelectorAll('humalis-reunion figure')].map((f) => [f.textContent, f.querySelector('video')?.videoWidth ?? 0]), pistes: globalThis.humalisReunion?.() }));
try {
  if (mode === 'discussion') {
    await page.goto(`${adresse}/support`);
    await page.getByRole('button', { name: 'Ouvrir' }).first().waitFor({ timeout: 60000 }).catch(() => undefined);
    await page.getByRole('button', { name: 'Ouvrir' }).first().click().catch(() => undefined);
    await page.getByLabel('Message').fill('Bonjour depuis le navigateur');
    await page.getByRole('button', { name: 'Envoyer', exact: true }).click();
    dire('message envoyé');
    while (Date.now() < fin) {
      const lu = (await etat()).texte;
      dire(`vu : ${lu.replace(/\s+/g, ' ').slice(0, 300)}`);
      if (/depuis l.iPhone|depuis Android|depuis Windows/i.test(lu)) break;
      await page.waitForTimeout(5000);
    }
  } else if (mode === 'appeler') {
    // Appelle la première personne de la liste (Awa), puis dit ce qu'il voit.
    await page.goto(adresse);
    await page.getByRole('button', { name: 'Appeler' }).first().click();
    while (Date.now() < fin) {
      dire(`appel lancé : ${JSON.stringify(await etat().then((x) => [x.images, x.pistes]))}`);
      await page.waitForTimeout(5000);
    }
  } else if (mode === 'appel') {
    await page.goto(adresse);
    await page.getByText(/Appel de/).first().waitFor({ timeout: Number(duree) * 1000 });
    dire('la sonnerie apparaît');
    await page.getByRole('button', { name: 'Décrocher' }).click();
    while (Date.now() < fin) {
      dire(`appel : ${JSON.stringify(await etat().then((x) => [x.images, x.pistes]))}`);
      await page.waitForTimeout(5000);
    }
  } else {
    await page.goto(`${adresse}/conseil`);
    await page.getByRole('button', { name: 'Rejoindre' }).click();
    while (Date.now() < fin) {
      const x = await etat();
      dire(`réunion : ${JSON.stringify([x.images, x.pistes])} ; ${x.texte.replace(/\s+/g, ' ').match(/Présent[^]*$/)?.[0]?.slice(0, 200) ?? ''}`);
      await page.waitForTimeout(5000);
    }
  }
} catch (erreur) {
  dire(`arrêt : ${String(erreur).slice(0, 300)}`);
}
await navigateur.close();
