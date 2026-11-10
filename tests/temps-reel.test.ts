import { describe, it, expect } from 'vitest';
import { compiler } from '../src/compilateur.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';
import { genererProjetMoteur } from '../src/cibles/moteur/projet.js';
import { verifierTempsReelPourLaCible } from '../src/cibles/temps-reel.js';

const SERVEUR = `serveur "agence" :
    roles client et agent
    discussion "support" entre client et agent
    discussion "equipe" entre membre
    salle "conseil" pour membre animee par agent
`;
const programme = (corps: string) => `${SERVEUR}\npage "accueil" :\n    titre "Accueil"\n${corps}`;
const sans = (source: string) => {
  const { application, diagnostics } = compiler(source);
  expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
  return { application: application!, diagnostics };
};
const erreurs = (source: string) => compiler(source).diagnostics.filter((d) => d.gravite === 'erreur').map((d) => d.message);

describe('le temps réel : les phrases', () => {
  it('discussion et salle se déclarent dans le serveur, sans avertissement sur leurs routes cachées', () => {
    const { application, diagnostics } = sans(programme('    discussion "support"'));
    const s = application.serveurs[0]!;
    expect(s.discussions?.map((d) => d.nom)).toEqual(['support', 'equipe']);
    expect(s.salles?.[0]).toMatchObject({ nom: 'conseil', pour: ['membre'], animateurs: ['agent'] });
    expect(s.routes.filter((r) => r.interne === 'discussion:support').length).toBeGreaterThan(3);
    expect(diagnostics.filter((d) => d.gravite === 'avertissement').filter((d) => /discussions_|message_support|hd_/.test(d.message))).toEqual([]);
  });

  it('une page montre la discussion, avec sa lecture en direct', () => {
    const { application } = sans(programme('    discussion "support"'));
    const texte = JSON.stringify(application.ecrans[0]);
    expect(texte).toContain('"adresse":"/api/discussions_support_vue"');
    expect(texte).toContain('"direct":true');
    expect(texte).toContain('"genre":"fichier"');
  });

  it('« sans pieces jointes » retire le choix de fichier', () => {
    expect(JSON.stringify(sans(programme('    discussion "support" sans pieces jointes')).application.ecrans[0])).not.toContain('"genre":"fichier"');
  });

  it('les gestes de la réunion et ses états', () => {
    const { application } = sans(programme(`    reunion "conseil"\n    si micro est coupe :\n        texte "Coupé"\n    si camera est coupee :\n        texte "Sans image"\n    si main est levee :\n        texte "Main"\n    bouton "Go"\n    quand l'utilisateur clique sur "Go" :\n        couper micro\n        activer micro\n        couper camera\n        activer camera\n        partager ecran\n        arreter partage\n        lever la main\n        baisser la main`));
    const texte = JSON.stringify(application.ecrans[0]);
    for (const g of ['couperMicro', 'activerMicro', 'couperCamera', 'activerCamera', 'partagerEcran', 'arreterPartage', 'leverMain', 'baisserMain', 'rejoindre', 'quitter']) expect(texte).toContain(`"geste":"${g}"`);
    expect(texte).toContain('"genre":"reunion"');
  });

  it('la modération passe par le serveur', () => {
    const { application } = sans(programme('    pour chaque p dans participants de reunion "conseil" :\n        bouton "Couper"\n        quand l\'utilisateur clique sur "Couper" :\n            couper micro de p\n        bouton "Exclure"\n        quand l\'utilisateur clique sur "Exclure" :\n            exclure p'));
    const texte = JSON.stringify(application.ecrans[0]);
    expect(texte).toContain('"adresse":"/api/salles_geste"');
    expect(texte).toContain('couper_micro');
    expect(texte).toContain('exclure');
  });

  it('un appel ajoute sa page, et la sonnerie à chaque page', () => {
    const { application } = sans(programme('    bouton "Go"\n    quand l\'utilisateur clique sur "Go" :\n        appeler en video "compte-1"'));
    expect(application.ecrans.map((e) => e.nom)).toContain('appel_en_cours');
    expect(JSON.stringify(application.ecrans[0])).toContain('hdAppelEntrant'.length ? 'hd_appel_entrant' : '');
  });

  it('« quand un appel arrive » remplace la sonnerie par défaut', () => {
    const { application } = sans(programme('    quand un appel arrive :\n        afficher appel.auteur_nom\n        decrocher'));
    expect(JSON.stringify(application.ecrans[0])).not.toContain('Appel de');
  });

  it('« quand un message arrive » et « non lus »', () => {
    const texte = JSON.stringify(sans(programme('    badge non lus de "support"\n    quand un message arrive dans "support" :\n        afficher message.texte')).application.ecrans[0]);
    expect(texte).toContain('discussions_support_non_lus');
    expect(texte).toContain('"suite":');
  });

  it('« est en ligne » accepte un identifiant ou une fiche', () => {
    sans(`serveur "a" :\n    roles client et agent\n    discussion "s" entre client et agent\n    donnee contact :\n        nom : texte\n    route "contacts" :\n        connecte peut lire contact\n\npage "accueil" :\n    variable contacts = []\n    titre "A"\n    quand la page se charge :\n        envoyer requete vers "contacts" dans contacts\n    pour chaque c dans contacts :\n        si c est en ligne :\n            texte "Oui"`);
  });

  it('les noms et les rôles sont vérifiés', () => {
    expect(erreurs(programme('    discussion "autre"'))[0]).toContain('n’est pas déclarée');
    expect(erreurs(programme('    reunion "autre"'))[0]).toContain('n’est pas déclarée');
    expect(erreurs('serveur "a" :\n    discussion "s" entre client\n\npage "b" :\n    titre "c"')[0]).toContain('qui n\'est pas déclaré');
  });
});

describe('le temps réel : le serveur', () => {
  const { application } = sans(programme('    discussion "support"\n    reunion "conseil"\n    bouton "Go"\n    quand l\'utilisateur clique sur "Go" :\n        appeler en audio "compte-1"'));
  const fichiers = genererProjetServeur(application.serveurs[0]!, { nom: 'a', source: 'a.humalis' });
  const code = fichiers.get('src/humalis/temps-reel.ts')!;

  it('monte ses routes à part, et garde le canal en direct', () => {
    expect(fichiers.get('src/serveur.ts')).toContain('monterTempsReel(app, {');
    expect(fichiers.has('src/humalis/direct.ts')).toBe(true);
    expect(fichiers.get('src/serveur.ts')).not.toContain('/api/discussions_support_vue');
  });

  it('ne crée pas de table pour une réponse', () => {
    const demarrer = fichiers.get('src/demarrer.ts')!;
    expect(demarrer).toContain('messageSupport');
    expect(demarrer).not.toContain('vueSupport');
  });

  it('les clés de LiveKit viennent de l\'environnement', () => {
    expect(code).toContain('process.env.LIVEKIT_API_SECRET');
    expect(JSON.parse(fichiers.get('package.json')!).dependencies['livekit-server-sdk']).toBeTruthy();
    expect(fichiers.get('.env.exemple')).toContain('LIVEKIT_URL=');
  });

  it('une pièce jointe se télécharge, jamais ne s\'exécute, et son lien est signé', () => {
    expect(code).toContain("'Content-Disposition': 'attachment;");
    expect(code).toContain('timingSafeEqual');
  });

  it('un rôle « membre » devient celui du pack', () => {
    expect(fichiers.get('src/serveur.ts')).toContain('"entre":["user"]');
  });
});

describe('le temps réel : les cibles', () => {
  const { application } = sans(programme('    discussion "support"'));

  it('le moteur porte la réunion seulement si le programme en a une', () => {
    expect(genererProjetMoteur(application, { nom: 'a', source: 'a.humalis' }).has('src/humalis/reunion.js')).toBe(false);
    const avec = sans(programme('    reunion "conseil"')).application;
    const f = genererProjetMoteur(avec, { nom: 'a', source: 'a.humalis' });
    expect(f.get('src/humalis/reunion.js')).toContain("from 'livekit-client'");
    expect(JSON.parse(f.get('package.json')!).dependencies['livekit-client']).toBeTruthy();
  });

  it('Expo, les pages statiques et React refusent clairement', () => {
    expect(verifierTempsReelPourLaCible(application, 'mobile', undefined)[0]!.message).toContain('--cible apple');
    expect(verifierTempsReelPourLaCible(application, 'statique', undefined)[0]!.message).toContain('--cible web');
    expect(verifierTempsReelPourLaCible(application, 'web', 'react')[0]!.message).toContain('--moteur react');
    expect(verifierTempsReelPourLaCible(application, 'web', 'humalis')).toEqual([]);
    expect(verifierTempsReelPourLaCible(application, 'apple', undefined)).toEqual([]);
  });
});
