# Plateforme de tournois — API (R5A5, sujet B)

API Express + TypeScript + Socket.io. Front associe : `R5A5_2026_SUJETB_INCEOGLU_HANOUNE_FRONT`.

## Prerequis

- **Node.js 22 minimum** (exige par better-sqlite3 13, module natif ; Express 5, bcrypt 6 et Jest 30
  demandent 18). Teste avec Node 26.8.2.
- npm (fourni avec Node). Aucun serveur de base de donnees a installer : SQLite est un fichier
  (voir [Base de donnees](#base-de-donnees)).

## Installation et lancement

```bash
npm install
cp .env.example .env      # valeurs par defaut utilisables telles quelles en local
npm run dev               # http://localhost:3000
```

Verification : `curl http://localhost:3000/health` renvoie `{"status":"ok"}`.

### Avertissements de `npm install`

Une installation propre (npm 11.19, novembre 2026) se termine par trois messages, sans consequence
sur le lancement ni sur les tests :

- **`22 vulnerabilities (1 low, 21 moderate)`** : l'alerte `low` vient de `deepmerge` (pollution de
  prototype), installe uniquement par Jest (`jest` → `@jest/core` → `jest-config`) : outil de test,
  absent du serveur. Les 21 `moderate` sont detaillees dans [Limites connues](#limites-connues).
  Ces chiffres suivent la base d'alertes de npm et peuvent evoluer avec le temps.
- **`npm warn deprecated glob@10.5.0`** : dependance indirecte des outils de developpement et de test.
- **`npm warn install-scripts 6 packages have install scripts not yet covered by allowScripts`** :
  npm 11 n'execute plus les scripts d'installation des dependances sans autorisation. C'est normal :
  `better-sqlite3` et `bcrypt` (modules natifs) contiennent deja des binaires precompiles pour macOS,
  Windows et Linux (x64 et arm64), utilises sans compilation. Les autres paquets cites viennent de
  Jest (`@parcel/watcher`, `unrs-resolver`), de `swagger-ui-dist` (`@scarf/scarf`, statistiques
  d'usage) ou ne servent que sous macOS (`fsevents`) : ils fonctionnent sans leur script.
  Verifie sur un clone propre : `npm run dev` et les 144 tests passent sans rien autoriser.

  Si le serveur ou les tests echouent pourtant au chargement de `better-sqlite3` ou de `bcrypt`
  (ex. `Cannot find module '.../better_sqlite3.node'`, `No native build was found`) — machine sans
  binaire precompile, typiquement sous Windows ou Linux hors x64/arm64 — autoriser leurs scripts
  puis les recompiler :

  ```bash
  npm install-scripts approve better-sqlite3 bcrypt   # ajoute "allowScripts" dans package.json
  npm rebuild better-sqlite3 bcrypt
  ```

  La recompilation demande les outils de compilation C++ : Python 3 et `make` + `g++` sous Linux
  (`build-essential`), « Desktop development with C++ » de Visual Studio Build Tools sous Windows,
  Xcode Command Line Tools sous macOS. La modification de `package.json` et `package-lock.json`
  est locale et n'a pas a etre commitee.

| Commande | Role |
|---|---|
| `npm run dev` | Serveur avec rechargement automatique |
| `npm test` | Tests Jest + Supertest (144 tests), sur une base en memoire. Ne demande pas de `.env` |
| `npx tsc --noEmit` | Verification des types |
| `npm run build` puis `npm start` | Compilation dans `dist/` puis lancement sans ts-node |

## Variables d'environnement (`.env`)

| Variable | Role | Valeur de `.env.example` | Si absente |
|---|---|---|---|
| `PORT` | Port HTTP, partage par l'API et Socket.io | `3000` | `3000` |
| `JWT_SECRET` | Cle de signature des jetons JWT | `votre_secret_jwt` | **Le serveur refuse de demarrer** (les tests utilisent une valeur de test) |
| `DB_PATH` | Fichier de la base SQLite (relatif au dossier de lancement), ou `:memory:` | `data/tournois.db` | `data/tournois.db` a la racine du projet |
| `FRONT_URL` | Seule origine autorisee par CORS (API et Socket.io) | `http://localhost:5173` | Aucune origine navigateur autorisee |
| `LOG_LEVEL` | Niveau de journalisation : `error`, `warn`, `info`, `http`, `verbose`, `debug`, `silly` | `info` | `info` (valeur inconnue : `info` + avertissement dans les logs) |
| `LIMITE_CONNEXIONS` | Connexions echouees autorisees par IP et par tranche de 10 minutes sur `POST /api/auth/login` ; au-dela : 429, meme avec le bon mot de passe, jusqu'a la fin de la tranche. Les connexions reussies ne comptent pas | commentee (`# LIMITE_CONNEXIONS=10`) | `10` (pendant `npm test` : `100000`) |

## Base de donnees

SQLite via `better-sqlite3`, requetes SQL ecrites a la main, sans ORM
([fiche de decision 03](docs/decisions/03-base-de-donnees.md)).

- **Fichier** : `data/tournois.db` (ou `DB_PATH`). Le dossier et le fichier sont crees au premier
  demarrage, puis remplis avec le [jeu de demonstration](#donnees-de-depart). Ignores par git.
- **Persistance** : comptes, equipes, demandes, resultats et messages survivent au redemarrage
  du serveur (y compris aux redemarrages automatiques de `npm run dev`).
- **Reinitialiser** : arreter le serveur, supprimer le fichier, relancer. La base est recreee
  avec le jeu de demonstration.
  ```bash
  rm data/tournois.db       # Windows : del data\tournois.db
  npm run dev
  ```
- **Sauvegarder** : copier le fichier, serveur arrete.
- **Schema** : [src/db/schema.sql](src/db/schema.sql), applique a chaque demarrage (sans effet sur une
  base existante). Cles etrangeres activees (`PRAGMA foreign_keys = ON`), et regles garanties par la
  base elle-meme : etats du tournoi, roles, statuts de demande, un joueur une seule fois par equipe et
  une seule equipe par joueur et par tournoi (B-07), vainqueur forcement une des deux equipes du match.
- **Transactions** : les operations en plusieurs ecritures sont appliquees en entier ou pas du tout
  (inscription : compte et mot de passe ; creation d'une equipe et de son capitaine ;
  acceptation d'une demande et annulation des autres, cloture et generation de l'arbre, lancement et
  forfaits, resultat ou forfait et toute sa cascade dans l'arbre).
- **Tests** : chaque fichier de test a sa propre base `:memory:`, vide puis remplie du jeu de
  demonstration ; `data/tournois.db` n'est jamais touche.
- Le schema n'est pas versionne (pas de migrations) : apres une modification de `schema.sql`,
  supprimer la base pour la recreer.

## Documentation de l'API (Swagger)

http://localhost:3000/api-docs — se connecter via `POST /api/auth/login`, cliquer sur **Authorize**
et coller le `token` recu. Chaque route y decrit ses codes de retour (400, 401, 403, 404, 409).

Connexion en ligne de commande :

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@iut.fr","password":"motdepasse"}'
# -> {"token":"eyJ...","user":{"id":1,"nom":"Admin","email":"admin@iut.fr","role":"administrateur"}}
```

Le `token` s'envoie ensuite dans l'en-tete `Authorization: Bearer <token>`.

Lectures publiques (sans connexion) :

- les equipes d'un tournoi : `GET /api/tournois/:id/equipes` (ex. `curl http://localhost:3000/api/tournois/1/equipes`) ;
- l'arbre : `GET /api/tournois/:id/matchs` (ex. `curl http://localhost:3000/api/tournois/2/matchs`).

## Comptes de test

Mot de passe commun : **`motdepasse`**. Email : `<identifiant>@iut.fr`.

| Compte | Situation | Permet de tester |
|---|---|---|
| `admin` | Administrateur : il organise, il ne joue pas | Creer, clore, lancer un tournoi ; saisir resultats et forfaits ; lire l'espace d'une equipe eliminee (B-01, B-03, B-04, B-13, B-15, B-18). Refus (403) de creer une equipe ou de demander a en rejoindre une |
| `zeki` | Capitaine de *Les Montreuillois* (tournoi 1) | Actions de capitaine : renommer, roles, exclure, passer la main, traiter les demandes (B-09, B-10) |
| `hanoune` | Membre simple de *Les Montreuillois* | Refus des actions reservees au capitaine ; quitter l'equipe (B-06, B-10) |
| `lea` | Capitaine de *Team Paris 8* (tournoi 1) | Refus d'agir sur une equipe dont on n'est pas membre (B-10, B-16) |
| `sami` | Joueur sans equipe | Creer une equipe, demander a en rejoindre une, une seule equipe par tournoi (B-05, B-06, B-07) |
| `joueur6` a `joueur45` | 8 equipes de 5 du tournoi 2 (equipe 3 = joueur6 a joueur10, etc.) ; capitaines : joueur6, 11, 16, 21, 26, 31, 36, 41 | Messagerie d'equipe en temps reel, elimination puis fermeture de l'espace (B-16 a B-18) |
| `joueur46` a `joueur84` | 8 equipes du tournoi 3, roles de jeu attribues : 7 equipes de 5 (equipe 11 = joueur46 a joueur50, etc.) et *Demo Hotel* (equipe 18) a 4 joueurs, joueur81 a joueur84 ; capitaines : joueur46, 51, 56, 61, 66, 71, 76, 81 | Avec `admin` : clore (arbre genere), lancer (*Demo Hotel* forfait au premier match), saisir les resultats (B-03, B-04, B-12 a B-15) |

## Donnees de depart

- **Tournoi 1** « Coupe IUT Automne » (Valorant) : inscriptions **ouvertes**, 2 equipes incompletes.
- **Tournoi 2** « Tournoi inter-IUT » (League of Legends) : **en cours**, 8 equipes completes,
  arbre genere (matchs 1 a 4 en premier tour, aucun resultat saisi).
- **Tournoi 3** « Coupe de demonstration » (Valorant) : inscriptions **ouvertes**, 8 equipes deja
  inscrites (7 completes, *Demo Hotel* a 4 joueurs). Pret a etre clos puis lance par `admin` :
  la cloture genere l'arbre, le lancement declare *Demo Hotel* forfait. Le jeu de demonstration
  n'est insere que dans une base vide : sur une base existante, la [reinitialiser](#base-de-donnees).

## Architecture

```
src/
  index.ts          demarrage : serveur HTTP partage Express + Socket.io
  app.ts            middlewares (CORS, logs), routes, Swagger, gestion d'erreurs
  routes/           une route = controles d'acces + validation + appel au service (+ doc @openapi)
  services/         logique metier : bracket (arbre), match (resultats, forfaits)
  middleware/       requireAuth (401), requireRole (403), journalisation des requetes
  realtime/         Socket.io : rooms (socket.ts) et diffusions (diffusion.ts)
  db/               SQLite : connexion, schema.sql, seed.ts (jeu de demonstration), un repository par entite
  models/           types partages
  logger.ts         Winston ; swagger.ts : configuration OpenAPI
tests/              un fichier par domaine ; helpers.ts cree les donnees via l'API
```

## Temps reel

Socket.io sur le meme port que l'API. Rooms, evenements et regles d'acces : [docs/temps-reel.md](docs/temps-reel.md).

## Journalisation

- Winston, format JSON, vers la console **et** `logs/app-AAAA-MM-JJ.log` (un fichier par jour,
  archive compressee, conservation 14 jours). Dossier `logs/` cree au premier demarrage, ignore par git.
- Niveau reglable par `LOG_LEVEL` (ex. `LOG_LEVEL=warn` : refus et erreurs seulement).
- Actions metier en `info`, refus d'acces en `warn`, erreurs serveur en `error`. Chaque requete
  est tracee (methode, chemin, statut, duree, userId) en `info`, `warn` (4xx) ou `error` (5xx),
  sauf `/health` et `/api-docs`.
- Jamais de mot de passe, hash, JWT ni contenu de message dans les logs.
- Pendant `npm test`, aucun log n'est ecrit.

## Limites connues

- **SQLite, un seul serveur** : SQLite serialise les ecritures et la base est un fichier local ;
  l'application ne peut pas tourner sur plusieurs serveurs partageant la meme base.
- **`npm audit`** : alertes moderees restantes sur `glob` et `minimatch` (deni de service par motif
  de fichier). En production, ils ne viennent que de `swagger-jsdoc`, qui lit les commentaires `@openapi`
  une seule fois au demarrage, sur nos propres fichiers, sans entree utilisateur ; le correctif impose une
  version cassante, il n'est donc pas applique. Les autres alertes restantes (`deepmerge`, `glob`,
  `minimatch` sous Jest et ts-node-dev) ne concernent que les outils de developpement et de test.
- Hors perimetre du sujet : correction d'un resultat deja saisi, trace de qui a saisi un resultat,
  echanges entre equipes.

## Usage de l'IA

Notre usage de l'IA pendant le projet est decrit dans [docs/ia/rapport-ia.md](docs/ia/rapport-ia.md).

## Dossier de decisions

Les choix de conception sont consignes dans [docs/decisions/](docs/decisions/) :

1. [Format et destination de la journalisation](docs/decisions/01-journalisation.md)
2. [Regles de l'arbre et des forfaits](docs/decisions/02-regles-arbre.md)
3. [Base de donnees](docs/decisions/03-base-de-donnees.md)
4. [Mecanisme de temps reel](docs/decisions/04-temps-reel.md)
5. [Authentification et autorisation](docs/decisions/05-authentification.md)
