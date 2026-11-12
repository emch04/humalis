import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { compiler } from '../src/compilateur.js';
import { genererProjetMoteur } from '../src/cibles/moteur/projet.js';
import { genererProjetStatique } from '../src/cibles/statique/projet.js';
import { entetesDuSite, politiqueDeContenu } from '../src/cibles/commun/entetes-site.js';

/**
 * La politique de contenu du site produit (revue du 12 novembre 2026) : le fichier « _headers », lu par
 * Cloudflare Pages et Netlify, dit au navigateur de ne charger et de n'exécuter que ce qui vient du site.
 */
const SOURCE = 'page "accueil" :\n    titre "Bonjour"\n    bouton "Thème"\n    quand l\'utilisateur clique sur "Thème" :\n        basculer theme\n';
const application = () => compiler(SOURCE).application!;
const scriptsEnLigne = (html: string) => [...html.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="application\/(?:ld\+)?json")[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const empreinte = (code: string) => `'sha256-${createHash('sha256').update(code).digest('base64')}'`;

describe('la politique de contenu du site produit', () => {
  it('n’autorise que le site lui-même, sans script ni objet venus d’ailleurs', () => {
    const csp = politiqueDeContenu(new Map([['index.html', '<html></html>']]));
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  });

  it('chaque script écrit dans une page est autorisé par son empreinte, et lui seul', () => {
    const fichiers = new Map([['index.html', '<script>var a = 1;</script><script src="/x.js"></script><script type="application/ld+json">{}</script>'], ['b/index.html', '<script>var b = 2;</script><script>var a = 1;</script>']]);
    const csp = politiqueDeContenu(fichiers);
    expect(csp).toContain(empreinte('var a = 1;'));
    expect(csp).toContain(empreinte('var b = 2;'));
    expect(csp.match(/sha256-/g)).toHaveLength(2);
  });

  it('la connexion avec Apple autorise le script d’Apple, et rien de plus', () => {
    expect(politiqueDeContenu(new Map(), { apple: true })).toContain("script-src 'self' https://appleid.cdn-apple.com");
    expect(politiqueDeContenu(new Map())).not.toContain('apple');
  });

  it('le fichier _headers vaut pour toutes les adresses et ajoute les en-têtes de base', () => {
    const texte = entetesDuSite(new Map([['index.html', '<script>var a = 1;</script>']]));
    expect(texte.startsWith('/*\n')).toBe(true);
    expect(texte).toContain('  Content-Security-Policy: default-src');
    expect(texte).toContain('  X-Content-Type-Options: nosniff');
    expect(texte).toContain('  Referrer-Policy: strict-origin-when-cross-origin');
  });

  it('le site web produit porte public/_headers, avec l’empreinte de chacun de ses scripts en ligne', () => {
    const fichiers = genererProjetMoteur(application(), { nom: 'essai', source: 'essai.humalis' });
    const entetes = fichiers.get('public/_headers')!;
    expect(entetes).toBeDefined();
    const scripts = [...fichiers].filter(([nom]) => nom.endsWith('.html')).flatMap(([, html]) => scriptsEnLigne(html as string));
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) expect(entetes).toContain(empreinte(script));
  });

  it('le site statique produit porte _headers à sa racine, avec l’empreinte de chacun de ses scripts en ligne', () => {
    const fichiers = genererProjetStatique(application(), { nom: 'essai', source: 'essai.humalis' });
    const entetes = fichiers.get('_headers')!;
    expect(entetes).toBeDefined();
    const scripts = [...fichiers].filter(([nom]) => nom.endsWith('.html')).flatMap(([, html]) => scriptsEnLigne(html as string));
    for (const script of scripts) expect(entetes).toContain(empreinte(script));
  });
});

describe('la sauvegarde du téléphone Android', () => {
  it('le coffre, chiffré par une clé qui ne quitte pas l’appareil, n’est ni sauvegardé ni transféré', async () => {
    const { genererProjetAndroid } = await import('../src/cibles/android/projet.js');
    const { fichiers } = genererProjetAndroid(application(), { nom: 'essai', source: 'essai.humalis' } as never);
    const manifeste = fichiers.get('app/src/main/AndroidManifest.xml')!;
    expect(manifeste).toContain('android:fullBackupContent="@xml/sauvegarde"');
    expect(manifeste).toContain('android:dataExtractionRules="@xml/extraction_donnees"');
    expect(fichiers.get('app/src/main/res/xml/sauvegarde.xml')).toContain('<exclude domain="sharedpref" path="humalis.coffre.xml" />');
    const extraction = fichiers.get('app/src/main/res/xml/extraction_donnees.xml')!;
    expect(extraction.match(/<exclude domain="sharedpref" path="humalis.coffre.xml" \/>/g)).toHaveLength(2);
  });
});
