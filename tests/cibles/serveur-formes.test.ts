import { describe, it, expect } from 'vitest';
import { compiler } from '../../src/compilateur.js';
import { genererProjetServeur } from '../../src/cibles/serveur/projet.js';
import { verifierFormesPourLaCible } from '../../src/cibles/formes.js';

const SOURCE = `activite en direct "livraison" :
    titre "En route"
serveur "boutique" :
    roles gerant
    donnee commande :
        total : nombre
        client : texte
    route "commandes" :
        seul gerant peut lire commande
        seul gerant peut modifier commande
        seul gerant peut faire "valider" sur commande :
            envoyer notification aux gerant avec titre "Nouvelle" et texte "Commande" et boutons "Accepter" et "Refuser"
            mettre a jour activite "livraison" pour gerant
        seul gerant peut faire "suivre" sur commande :
            mettre a jour activite "livraison" pour commande.client
quand l'utilisateur touche "Accepter" dans une notification :
    afficher "Acceptée"
page "a" :
    titre "A"
`;

const { application, diagnostics } = compiler(SOURCE);
const fichiers = genererProjetServeur(application!.serveurs[0]!, { nom: 'boutique', source: 'boutique.humalis' });
const serveur = fichiers.get('src/serveur.ts')!;
const notifications = fichiers.get('src/humalis/notifications.ts')!;

describe('cible serveur — activité en direct et boutons des notifications', () => {
  it('le serveur écrit les deux formes : rien n’y est plus refusé', () => {
    expect(diagnostics.filter((d) => d.gravite === 'erreur')).toEqual([]);
    expect(verifierFormesPourLaCible(application!, 'serveur')).toEqual([]);
  });

  it('« et boutons » : les boutons partent avec la notification', () => {
    expect(serveur).toContain('const envoi = { titre: "Nouvelle", texte: "Commande", boutons: ["Accepter","Refuser"] };');
    expect(notifications).toContain('boutons?: string[];');
  });

  it('APNs : la catégorie de la notification, que l’application déclare avec un bouton par texte', () => {
    expect(notifications).toContain("const categorie = (boutons: string[]) => 'humalis.boutons.' + boutons.join('|');");
    expect(notifications).toContain('category: categorie(boutons)');
    expect(notifications).toContain('n.boutons?.slice(0, 3)');
  });

  it('FCM : une notification à boutons part en message de données, que l’application construit', () => {
    expect(notifications).toContain("{ data: { humalis: 'notification', titre: n.titre, texte: n.texte, boutons: JSON.stringify(boutons) } }");
    expect(notifications).toContain(": { notification: { title: n.titre, body: n.texte } };");
    expect(notifications).toContain("android: { priority: 'high' }");
  });

  it('« mettre a jour activite » : après la transaction, aux comptes visés', () => {
    expect(serveur).toContain('travail.apres.push(() => notifications.activiteADesRoles(["gerant"], "livraison", groupe));');
    expect(serveur).toMatch(/const compte = enTexte\(f_commande\["client"\]\);\s*travail\.apres\.push\(\(\) => notifications\.activiteAUnCompte\(compte, "livraison"\)\);/);
  });

  it('APNs : la Live Activity reçoit sa mise à jour par son propre jeton, avec le type liveactivity', () => {
    expect(notifications).toContain("'apns-topic': genre === 'liveactivity' ? sujet + '.push-type.liveactivity' : sujet");
    expect(notifications).toContain("'apns-push-type': genre");
    expect(notifications).toContain("aps: { timestamp: maintenant, event: 'update', 'content-state': { maj: maintenant } }");
    // Le jeton de l'activité, envoyé par l'iPhone ; oublié à la fin de l'activité.
    expect(serveur).toContain("routeActivites.post('/', ...acces.connecte, csrfMiddleware, notifications.inscrireActivite);");
    expect(serveur).toContain("app.use('/auth/activites', routeActivites);");
    expect(notifications).toContain("await appareils.creer({ genre: 'activite', cle: corps.apple, nom: corps.nom, compte });");
    expect(notifications).toContain('if (statut === 410 || statut === 400) await appareils.supprimer(a.id);');
  });

  it('FCM : sur Android, la mise à jour est un message de données que l’application relit', () => {
    expect(notifications).toContain("envoyerFCM(jeton, { data: { humalis: 'activite', nom } })");
  });

  it('une activité seule suffit à brancher les notifications', () => {
    const seule = compiler(SOURCE.replace(/            envoyer notification.*\n/, '')).application!;
    const f = genererProjetServeur(seule.serveurs[0]!, { nom: 'boutique', source: 'b.humalis' });
    expect(f.has('src/humalis/notifications.ts')).toBe(true);
  });
});
