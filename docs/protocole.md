# Le protocole du serveur produit

Ce document décrit ce que répond le serveur que Humalis produit (`humalis compile … --cible serveur`),
pour qui veut brancher un autre client que les pages Humalis, ou auditer le serveur. Chaque réponse
citée ici a été relevée sur un vrai serveur produit, le 12 novembre 2026.

Les pages Humalis (web, Apple, Android, Windows, bureau) parlent ce protocole sans que tu aies à le
connaître : ce document ne sert que hors de Humalis.

## En bref

- Tout est en JSON, en UTF-8. Les routes des données sont sous `/api/`, la connexion sous `/auth/`.
- Une route déclarée `route "produits" :` donne `/api/produits`.
- Les droits écrits dans le programme (`tout le monde peut lire`, `seul admin peut creer`…) décident de
  chaque réponse. Sans règle, l'action est refusée à tout le monde.
- Une erreur d'une route des données a la forme `{ "erreur": "…" }`, en français. Une erreur de la
  connexion (`/auth/…`) a la forme du pack Astratra : `{ "success": false, "message": "…" }`, en anglais.

## La santé

`GET /sante` répond sans session, et n'est jamais gardée en cache.

```
200 {"etat":"pret"}           le serveur et sa base répondent
503 {"etat":"indisponible"}   la base ne répond pas, ou le serveur s'arrête
```

## Se connecter

| Requête | Corps | Réponse |
|---|---|---|
| `POST /auth/login` | `{"email":"…","password":"…"}` | 200, le jeton et le compte ; 401 si les identifiants sont faux |
| `GET /auth/me` | | 200, le compte de la session ; 401 sans session |
| `POST /auth/refresh` | | 200, un nouveau jeton, tant que la personne revient |
| `POST /auth/logout` | | 200, la session est fermée sur tous les exemplaires du serveur |

```
POST /auth/login
200 {"success":true,"message":"Login successful","data":{"token":"<jeton>","user":{"id":"…","email":"…","role":"admin"}},"timestamp":"…"}
401 {"success":false,"message":"Invalid credentials.","data":null,"timestamp":"…","error":"Invalid credentials."}
```

La connexion donne la session de deux façons, au choix du client :

- **un jeton**, à renvoyer dans l'en-tête `Authorization: Bearer <jeton>` (applications natives,
  scripts). Il dure 15 minutes par défaut (`HUMALIS_SESSION`).
- **des cookies**, posés par la réponse (navigateurs) : `astratra_session` (le jeton, `HttpOnly`) et
  `humalis_renouvellement` (limité à `/auth`, `HttpOnly`), qui sert à `POST /auth/refresh`.

Les tentatives de connexion sont limitées par adresse (10 par quart d'heure par défaut,
`HUMALIS_LIMITE_CONNEXION`).

### La garde CSRF

Elle ne concerne que les sessions par cookie. Toute réponse pose le cookie `astratra_csrf` ; une
écriture (`POST`, `PATCH`, `DELETE`) faite avec les cookies doit renvoyer sa valeur dans l'en-tête
`x-csrf-token`.

```
POST /api/produits avec les cookies, sans l'en-tête   403 {"success":false,"message":"Invalid CSRF token."}
POST /api/produits avec les cookies et l'en-tête      201 {"nom":"Carnet","prix":3,"id":"…"}
```

Avec `Authorization: Bearer`, l'en-tête n'est pas demandé.

## Les données

Pour `route "produits" :` sur `donnee produit` :

| Requête | Ce qu'elle fait | Réponses |
|---|---|---|
| `GET /api/produits` | la liste | 200, un tableau de fiches |
| `GET /api/produits/<id>` | une fiche | 200, la fiche ; 404 |
| `POST /api/produits` | crée une fiche | 201, la fiche créée ; 400 |
| `PATCH /api/produits/<id>` | change les champs envoyés | 200, la fiche ; 400 ; 404 |
| `DELETE /api/produits/<id>` | supprime | 204 ; 404 |

Une fiche porte ses champs et son `id`, donné par le serveur :

```
{"nom":"Robe","prix":60,"id":"873bdb76-53e2-42a8-9f0f-8e05497768d2"}
```

Les champs que le serveur écrit seul (`auteur`, le groupe d'une donnée `par compte` ou `par boutique`,
`paye`, un champ `calcule`) reviennent dans la fiche, mais ne s'envoient pas.

### Lire une liste

- `?champ=valeur` ne rend que les fiches dont le champ a exactement cette valeur (texte, nombre, vrai ou
  faux). Une clé qui n'est pas un champ est ignorée.
- `?limite=20&depuis=40` découpe la liste, après les droits : chaque personne ne compte que ce qu'elle
  peut lire. Les fiches viennent de la plus ancienne à la plus récente, toujours dans le même ordre.
- Une lecture ne rend jamais plus de 1 000 fiches (`HUMALIS_LISTE_MAX`).
- Une lecture que tout le monde peut faire se garde un court moment
  (`Cache-Control: private, max-age=30, stale-while-revalidate=300`) ; une lecture réservée, jamais.

```
GET /api/produits?limite=2&depuis=1
200 [{"nom":"Robe","prix":60,"id":"…"},{"nom":"Sac","prix":40,"id":"…"}]
```

### Écrire

Le corps est un objet JSON avec les champs de la donnée. À la création, chaque champ est demandé, sauf
ceux que le serveur écrit. À la modification, seuls les champs envoyés changent.

```
POST /api/produits {"nom":"Foulard","prix":15}             201 {"nom":"Foulard","prix":15,"id":"…"}
POST /api/produits {"nom":"F","prix":15}                   400 {"erreur":"le champ « nom » doit avoir entre 2 et 40 caractères"}
POST /api/produits {"nom":"F","prix":5000,"couleur":"x"}   400 {"erreur":"le champ « couleur » n'existe pas. Champs : nom, prix"}
GET  /api/produits/inconnu                                 404 {"erreur":"aucun « produit » avec cet identifiant"}
POST /api/produits sans session                            401 {"success":false,"message":"Unauthorized."}
```

Un compte dont le rôle n'a pas le droit est refusé. Une fiche d'un autre groupe ou d'un autre compte
n'est ni rendue, ni modifiée, ni supprimée.

### Rejouer un envoi sans le doubler

Un client qui n'a pas reçu la réponse d'un `POST` peut le renvoyer avec le même en-tête
`X-Humalis-Envoi: <clé>` (une clé au hasard, propre à cet envoi) : le serveur ne refait pas le travail,
il renvoie la première réponse, avec `X-Humalis-Rejoue: 1`.

```
POST /api/notes  X-Humalis-Envoi: essai-0001-aaaa-bbbb     201 {"titre":"a","lu":false,"compte":"…","id":"734f…"}
POST /api/notes  X-Humalis-Envoi: essai-0001-aaaa-bbbb     201, X-Humalis-Rejoue: 1, la même fiche
```

### Le pare-feu

Une adresse ou un envoi qui ressemble à une attaque reçoit 403, avec ce qui est refusé :

```
403 {"erreur":"le champ « texte » contient « <script> », que le serveur refuse par sécurité"}
403 {"erreur":"cette adresse est refusée par sécurité : elle contient « … »"}
```

`HUMALIS_PARE_FEU=adresses` laisse passer dans les textes envoyés ce qui ne vise qu'un affichage (balise
de script, `javascript:`, `${…}`) ; les injections SQL et les adresses piégées restent refusées.

## En direct

Pour une route lue `en direct`, `GET /api/produits/direct` ouvre un flux d'événements
(`text/event-stream`) avec les droits de la lecture. Le serveur y annonce qu'une fiche a changé ; le
client relit alors la liste. Le flux commence par un commentaire `: ouvert`.

## La synchronisation

Pour une donnée de l'appareil `synchronisee avec "notes"` :

- `GET /api/notes/synchro?depuis=<curseur>` rend ce qui a changé depuis ce curseur (0 la première fois).

```
200 {"changements":[{"id":"…","supprime":false,"valeurs":{"titre":"a","lu":false,"compte":"…"},"version":1}],
     "curseur":1,"encore":false,"reinitialiser":false,"heure":1794507619218}
```

`encore` : il reste des changements, à relire avec le nouveau `curseur`. `reinitialiser` : le curseur est
trop ancien, la copie de l'appareil se relit en entier. `heure` : l'horloge du serveur, en millisecondes.

- `POST /api/notes/synchro` envoie un lot de changements faits hors ligne :

```
{"heure": <horloge de l'appareil>, "envois": [{"operation":"<clé unique>","id":"<id de la fiche>","modifieLe":<quand>,"valeurs":{…}}]}
{"heure": …, "envois": [{"operation":"…","id":"…","modifieLe":…,"supprime":true}]}
```

Chaque envoi repasse par les droits et les vérifications de la route. La réponse donne un résultat par
envoi (`applique`, `ignore` quand une modification plus récente existe déjà, `refuse` avec sa raison et
la fiche telle qu'elle est sur le serveur). Un lot renvoyé avec les mêmes `operation` n'est pas refait.

## Ce qui dépend du programme

D'autres adresses n'existent que si le programme les demande, et suivent les mêmes règles (droits,
garde CSRF, erreurs `{ "erreur": … }`) :

| Phrase du programme | Adresse |
|---|---|
| `payer total pour c` | `POST /api/<route>/payer/<champ>/<id>`, et `POST /paiements/webhook` pour le relais de paiement |
| `seul gerant peut faire "rembourser" sur commande :` | sous `/api/<route>/faire/<action>` |
| `seul gerant peut lire "resume" de commande :` | `GET /api/<route>/<resume>` |
| `telecharger bon` | `GET /api/<route>/<id>/bon` |
| une source à jeton secret | `/api/passerelle/<source>/…` |
| le coffre des clés de service | `/auth/cles`, admin seulement |

Leur forme exacte se lit dans `src/serveur.ts` du serveur produit, et les tests produits
(`tests/regles.test.ts`, `tests/attaques.test.ts`) montrent des appels complets.
