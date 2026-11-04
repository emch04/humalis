import { describe, it, expect } from 'vitest';
import { stripTypeScriptTypes } from 'node:module';
import { compiler } from '../src/compilateur.js';
import { genererProjetServeur } from '../src/cibles/serveur/projet.js';
import { programme } from './analyse/aide.js';

const SERVEUR = [
  'serveur "boutique" :',
  '>donnee produit :',
  '>>prix : nombre',
  '>>photo : image du site',
  '>donnee zone :',
  '>>commune : texte',
  '>>prix : nombre',
  '>donnee suivi :',
  '>>etape : texte',
  '>>total : nombre',
  '>donnee commande :',
  '>>refs : liste de texte',
  '>>photos : liste de texte du site',
  '>>quantite : nombre calcule nombre de refs',
  '>>commune : texte',
  '>>livraison : nombre au plus prix de zone par commune',
  '>>total : nombre calcule somme prix de produit par refs plus livraison',
  '>>suivi : texte',
  '>>statut : texte au depart "en_attente"',
  '>>jour : date au depart aujourd\'hui',
  '>route "produits" :',
  '>>tout le monde peut lire produit',
  '>>seul admin peut modifier produit',
  '>route "zones" :',
  '>>tout le monde peut lire zone',
  '>>seul admin peut modifier zone',
  '>route "suivis" :',
  '>>tout le monde peut lire suivi par identifiant',
  '>>seul admin peut lire suivi',
  '>>seul admin peut modifier suivi',
  '>route "commandes" :',
  '>>tout le monde peut creer commande',
  '>>seul admin peut lire commande',
  '>>seul admin peut modifier commande',
  '>>quand commande est cree :',
  '>>>creer suivi avec etape "en_attente" et total commande.total dans commande.suivi',
];

const application = (...pages: string[]) => compiler(programme(...SERVEUR, '', 'page "accueil" :', '>titre "A"', ...pages));
const fichiers = () => genererProjetServeur(application().application!.serveurs[0], { nom: 'b', source: 'b.humalis' });
const code = () => fichiers().get('src/serveur.ts')!;

describe('ce que le serveur décide — la RI', () => {
  it('garde les règles de champ et la fiche liée', () => {
    const { application: app, diagnostics } = application();
    expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    const ri = app!.serveurs[0];
    const commande = ri.donnees.find((d) => d.nom === 'commande')!;
    const regle = (nom: string) => commande.champs.find((c) => c.nom === nom)?.regle;
    expect(regle('statut')).toEqual({ genre: 'depart', valeur: { genre: 'valeur', valeur: 'en_attente' } });
    expect(regle('jour')).toEqual({ genre: 'depart', valeur: { genre: 'aujourdhui' } });
    expect(regle('photos')).toEqual({ genre: 'site' });
    expect(regle('quantite')).toEqual({ genre: 'nombreDe', liste: 'refs' });
    expect(regle('livraison')).toEqual({ genre: 'auPlus', prix: 'prix', donnee: 'zone', par: 'commune' });
    expect(regle('total')).toEqual({ genre: 'somme', prix: 'prix', donnee: 'produit', liste: 'refs', plus: 'livraison' });
    const routes = Object.fromEntries(ri.routes.map((r) => [r.adresse, r]));
    expect(routes.suivis.droits).toMatchObject({ lire: 'admin', lireUn: 'tout_le_monde' });
    expect(routes.commandes.creations).toEqual([
      { donnee: 'suivi', valeurs: [{ champ: 'etape', valeur: { genre: 'valeur', valeur: 'en_attente' } }, { champ: 'total', valeur: { genre: 'champ', champ: 'total' } }], dans: 'suivi' },
    ]);
  });
});

describe('ce que le serveur décide — la page', () => {
  const envoi = (...lignes: string[]) => ['page "envoi" :', '>titre "E"', '>variable fiche = rien', '>bouton "Go"', '>quand l\'utilisateur clique sur "Go" :', ...lignes.map((l) => `>>${l}`)];

  it('une page qui envoie un champ du serveur est refusée à la compilation', () => {
    const { diagnostics } = application(...envoi('envoyer requete vers "commandes" avec statut = "livree"'));
    expect(diagnostics.find((d) => d.gravite === 'erreur')?.message).toContain('le serveur décide lui-même du champ « statut »');
  });

  it('« dans commande.suivi » : l\'envoi ne peut pas désigner un autre suivi', () => {
    const route = fichiers().get('src/serveur.ts')!;
    expect(route).toContain('duServeur: ["quantite","total","suivi","statut","jour"]');
  });

  it('une lecture par identifiant ne prévient de rien ; la liste, si', () => {
    const avecId = application(...envoi('envoyer requete vers "suivis" avec id "abc" dans fiche'));
    expect(avecId.diagnostics.map((d) => d.message).join()).not.toContain('admin peut lire « suivi »');
    const liste = application(...envoi('envoyer requete vers "suivis" dans fiche'));
    expect(liste.diagnostics.map((d) => d.message).join()).toContain('seul un admin peut lire « suivi »');
  });
});

describe('ce que le serveur décide — le serveur produit', () => {
  it('la lecture par identifiant a son droit, sans cache ; la liste garde le sien', () => {
    const route = code();
    expect(route).toContain("routeSuivis.get('/', lecturePrivee, ...acces.seulAdmin,");
    expect(route).toContain("routeSuivis.get('/:id', lecturePrivee, ...acces.toutLeMonde,");
  });

  it('calcule tout avant de créer, et la fiche liée d\'abord', () => {
    const route = code();
    const corps = route.slice(route.indexOf('completerCommande(envoi.valeur)'));
    const ordre = ['completerCommande(envoi.valeur)', 'stockages.suivi.creer(', 'recue["suivi"] = creee0.id;', 'stockages.commande.creer(recue)'].map((t) => corps.indexOf(t));
    expect(ordre.every((p) => p >= 0)).toBe(true);
    expect([...ordre].sort((a, b) => a - b)).toEqual(ordre);
    expect(route).toContain('fiche["statut"] = "en_attente";');
    expect(route).toContain('fiche["jour"] = new Date().toISOString().slice(0, 10);');
    expect(route).toContain('fiche["total"] = sommeTotal + Number(fiche["livraison"]);');
  });

  it('écoute et en-tête', () => {
    expect(code()).toContain("disable('x-powered-by')");
    const f = fichiers();
    expect(f.get('src/demarrer.ts')).toContain('process.env.HUMALIS_ECOUTE');
    expect(f.get('.env.exemple')).toContain('HUMALIS_ECOUTE=');
    expect(f.get('.env.exemple')).toContain('HUMALIS_ADRESSE_SITE=');
  });

  it('sans ces règles, verifierEnvoi reste appelé comme avant', () => {
    const app = compiler(programme('serveur "s" :', '>donnee d :', '>>nom : texte', '>route "d" :', '>>tout le monde peut lire d', '>>seul admin peut modifier d')).application!;
    const route = genererProjetServeur(app.serveurs[0], { nom: 'b', source: 'b.humalis' }).get('src/serveur.ts')!;
    expect(route).toContain('const envoi = verifierEnvoi(SCHEMA_D, req.body, true);');
    expect(route).toContain('res.status(201).json(await stockages.d.creer(envoi.valeur));');
    expect(route).not.toContain('completer');
  });
});

describe('estDuSite, exécuté', () => {
  const module = async () => {
    const source = stripTypeScriptTypes(fichiers().get('src/humalis/verifier.ts')!).replace(/^import .*$/m, '');
    return (await import(`data:text/javascript,${encodeURIComponent(source)}`)) as { estDuSite: (v: unknown, s?: string) => boolean; verifierEnvoi: (...a: unknown[]) => { erreur?: string; valeur?: Record<string, unknown> } };
  };

  it('accepte ce site, refuse le reste', async () => {
    const { estDuSite } = await module();
    for (const bon of ['/a.png', '/images/b.jpg?v=2', '', null, ['/a.png'], 'https://site.cd/a.png', 'data:image/png;base64,AAAA']) expect(estDuSite(bon, 'https://site.cd/'), String(bon)).toBe(true);
    for (const mauvais of ['https://evil.example/a.png', '//evil.example/a.png', '/\\evil.example/a.png', 'https://site.cd.evil.example/a.png', 'javascript:alert(1)', 'a.png', ['/a.png', 'https://evil.example/b.png'], 12, 'data:text/html;base64,AAAA']) expect(estDuSite(mauvais, 'https://site.cd'), String(mauvais)).toBe(false);
    expect(estDuSite('https://site.cd/a.png')).toBe(false);
  });

  it('refuse à l\'envoi ce que le serveur décide, sans l\'exiger', async () => {
    const { verifierEnvoi } = await module();
    const schema = { nom: 'texte', statut: 'texte' };
    expect(verifierEnvoi(schema, { nom: 'A', statut: 'livree' }, true, { duServeur: ['statut'] }).erreur).toContain('donné par le serveur');
    expect(verifierEnvoi(schema, { nom: 'A' }, true, { duServeur: ['statut'] }).valeur).toEqual({ nom: 'A' });
    // À la modification, le droit de la route décide.
    expect(verifierEnvoi(schema, { statut: 'livree' }, false, { duServeur: ['statut'] }).valeur).toEqual({ statut: 'livree' });
  });
});
