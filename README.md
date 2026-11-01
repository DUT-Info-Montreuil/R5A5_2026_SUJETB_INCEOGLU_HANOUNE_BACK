# Plateforme de tournois — API (R5A5, sujet B)

API Express + TypeScript + Socket.io. Front associe : `R5A5_2026_SUJETB_INCEOGLU_HANOUNE_FRONT`.

## Prerequis

- **Node.js 18 minimum** (exige par Express 5, bcrypt 6 et Jest 30). Teste avec Node 26.8.2.
- npm (fourni avec Node). Aucune base de donnees a installer.

## Installation et lancement

```bash
npm install
cp .env.example .env      # valeurs par defaut utilisables telles quelles en local
npm run dev               # http://localhost:3000
```

Verification : `curl http://localhost:3000/health` renvoie `{"status":"ok"}`.

| Commande | Role |
|---|---|
| `npm run dev` | Serveur avec rechargement automatique |
| `npm test` | Tests Jest + Supertest (92 tests). Ne demande pas de `.env` |
| `npx tsc --noEmit` | Verification des types |
| `npm run build` puis `npm start` | Compilation dans `dist/` puis lancement sans ts-node |

## Variables d'environnement (`.env`)

| Variable | Role | Valeur de `.env.example` | Si absente |
|---|---|---|---|
| `PORT` | Port HTTP, partage par l'API et Socket.io | `3000` | `3000` |
| `JWT_SECRET` | Cle de signature des jetons JWT | `votre_secret_jwt` | **Le serveur refuse de demarrer** (les tests utilisent une valeur de test) |
| `DATABASE_URL` | Prevue pour une future base PostgreSQL | `postgresql://...` | Sans effet : **non utilisee** pour l'instant |
| `FRONT_URL` | Seule origine autorisee par CORS (API et Socket.io) | `http://localhost:5173` | Aucune origine navigateur autorisee |
| `LOG_LEVEL` | Niveau de journalisation : `error`, `warn`, `info`, `http`, `verbose`, `debug`, `silly` | `info` | `info` (valeur inconnue : `info` + avertissement dans les logs) |

## Documentation de l'API (Swagger)

http://localhost:3000/api-docs — se connecter via `POST /api/auth/login`, cliquer sur **Authorize**
et coller le `token` recu. Chaque route y decrit ses codes de retour (400, 401, 403, 404, 409).

## Comptes de test

Mot de passe commun : **`motdepasse`**. Email : `<identifiant>@iut.fr`.

| Compte | Situation | Permet de tester |
|---|---|---|
| `admin` | Administrateur | Creer, clore, lancer un tournoi ; saisir resultats et forfaits ; lire l'espace d'une equipe eliminee (B-01, B-03, B-04, B-13, B-15, B-18) |
| `zeki` | Capitaine de *Les Montreuillois* (tournoi 1) | Actions de capitaine : renommer, roles, exclure, passer la main, traiter les demandes (B-09, B-10) |
| `hanoune` | Membre simple de *Les Montreuillois* | Refus des actions reservees au capitaine ; quitter l'equipe (B-06, B-10) |
| `lea` | Capitaine de *Team Paris 8* (tournoi 1) | Refus d'agir sur une equipe dont on n'est pas membre (B-10, B-16) |
| `sami` | Joueur sans equipe | Creer une equipe, demander a en rejoindre une, une seule equipe par tournoi (B-05, B-06, B-07) |
| `joueur6` a `joueur45` | 8 equipes de 5 du tournoi 2 (equipe 3 = joueur6 a joueur10, etc.) ; capitaines : joueur6, 11, 16, 21, 26, 31, 36, 41 | Messagerie d'equipe en temps reel, elimination puis fermeture de l'espace (B-16 a B-18) |

## Donnees de depart

- **Tournoi 1** « Coupe IUT Automne » (Valorant) : inscriptions **ouvertes**, 2 equipes incompletes.
- **Tournoi 2** « Tournoi inter-IUT » (League of Legends) : **en cours**, 8 equipes completes,
  arbre genere (matchs 1 a 4 en premier tour, aucun resultat saisi).

## Architecture

```
src/
  index.ts          demarrage : serveur HTTP partage Express + Socket.io
  app.ts            middlewares (CORS, logs), routes, Swagger, gestion d'erreurs
  routes/           une route = controles d'acces + validation + appel au service (+ doc @openapi)
  services/         logique metier : bracket (arbre), match (resultats, forfaits)
  middleware/       requireAuth (401), requireRole (403), journalisation des requetes
  realtime/         Socket.io : rooms (socket.ts) et diffusions (diffusion.ts)
  models/           donnees en memoire (fakeData.ts) et types partages
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

- **Donnees en memoire** : tout ce qui est cree (comptes, equipes, resultats, messages) est
  **perdu au redemarrage** ; le serveur repart du jeu de donnees ci-dessus. En `npm run dev`,
  chaque modification d'un fichier source redemarre le serveur.
- Hors perimetre du sujet : correction d'un resultat deja saisi, trace de qui a saisi un resultat,
  echanges entre equipes.

## Decisions

Les choix de conception sont consignes dans [docs/decisions/](docs/decisions/).
