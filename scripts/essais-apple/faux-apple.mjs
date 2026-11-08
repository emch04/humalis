// Chargé avant le serveur : les clés publiques d'Apple et de Google sont remplacées par celles de l'essai.
// Toute la vérification d'Astratra reste la vraie : signature, émetteur, audience, nonce.
import { readFileSync } from 'node:fs';

const vraiFetch = globalThis.fetch;
globalThis.fetch = async (adresse, options) => {
  if (['https://appleid.apple.com/auth/keys', 'https://www.googleapis.com/oauth2/v3/certs'].includes(String(adresse))) {
    return new Response(readFileSync(process.env.HUMALIS_FAUX_JWKS, 'utf8'), { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'max-age=60' } });
  }
  return vraiFetch(adresse, options);
};
