# Back — plateforme de tournois (R5A5, sujet B)

API Express + TypeScript. Front associe : R5A5_2026_SUJETB_INCEOGLU_HANOUNE_FRONT.
Le sujet est note sur : droits d'acces, temps reel, journalisation, documentation, tests, lisibilite.
Le perimetre livre est un coefficient de la note : une exigence manquante coute cher.

## Commandes
- `npm run dev` : serveur sur http://localhost:3000 (Swagger : /api-docs)
- `npm test` : jest + supertest. Doit rester vert avant toute proposition de commit.
- `npx tsc --noEmit` : verification des types.

## Structure
- `src/routes/*.routes.ts` : une route = controles d'acces + validation + appel au service. Doc Swagger en `@openapi` au-dessus de chaque route.
- `src/services/` : logique metier (bracket.service = generation de l'arbre, match.service = resultats et forfaits).
- `src/models/fakeData.ts` : donnees en memoire (pas encore de base). `types.ts` : types partages.
- `src/middleware/auth.ts` : `requireAuth` (401) et `requireRole` (403). Les refus 403 passent par `refuser()` qui journalise.
- `src/logger.ts` : Winston, JSON, console + fichier quotidien.
- `tests/helpers.ts` : comptes de test et fonctions qui construisent les donnees VIA L'API.

## Conventions
- Code, noms et commentaires en francais, sans accents dans le code (comme l'existant).
- Chaque route sensible commence par les controles d'acces, avant toute lecture du corps.
- Codes : 400 corps invalide, 401 non authentifie, 403 pas le droit, 404 introuvable, 409 etat incompatible.
- Erreurs : `{ message: '...' }`. Jamais de stack ni de detail interne au client.
- Journaliser les actions metier (logger.info) et les refus (logger.warn) avec des ids.
  JAMAIS de mot de passe, hash, JWT ni contenu de message d'equipe dans les logs.
- Citer l'exigence dans un commentaire quand une regle en vient (ex. `// B-11 : ...`).

## Tests
- On teste la SECURITE : pour chaque regle d'acces, un test montre qu'un utilisateur non autorise est refuse,
  ET que l'etat n'a pas change apres le refus. Le cas nominal vient en plus, pas a la place.
- Un test cree ses propres donnees via l'API (helpers), il ne modifie jamais fakeData directement
  et ne depend pas de l'ordre d'execution.
- Ne jamais modifier une assertion existante pour faire passer un test sans le signaler explicitement.

## Exigences du sujet (resume)
B-01 admin cree un tournoi et ouvre les inscriptions. B-02 tout le monde cherche un tournoi et voit son avancement.
B-03 admin clot les inscriptions (fige les equipes). B-04 admin lance ; equipes incompletes forfait au premier match.
B-05 un joueur cree une equipe et en devient capitaine. B-06 un joueur DEMANDE a rejoindre une equipe ; il peut la quitter tant que les inscriptions sont ouvertes.
B-07 une seule equipe par joueur et par tournoi. B-08 5 joueurs, chacun avec un role de jeu.
B-09 le capitaine renomme, attribue les roles, exclut, passe la main. B-10 seul le capitaine touche a la composition ; personne n'agit sur une equipe dont il n'est pas membre.
B-11 inscriptions closes = effectif et roles figes. B-12 arbre genere a la cloture a partir de 8 equipes.
B-13 seul l'admin saisit un resultat. B-14 un resultat fait avancer le gagnant ; un match n'est jouable qu'avec ses deux equipes.
B-15 l'admin declare un forfait, ce qui qualifie l'adversaire.
B-16 espace d'echange reserve aux membres, messages en temps reel. B-17 un exclu perd immediatement l'acces.
B-18 equipe eliminee : espace ferme, l'admin peut toujours le consulter. B-19 tout le monde voit le tournoi avancer sans recharger.
Hors perimetre : correction d'un resultat valide, trace de qui a saisi un resultat, echanges entre equipes.

## Git
- Flux : branche `feat/...`, `fix/...` ou `chore/...` depuis `dev` → PR → `dev`.
- Ne JAMAIS commit ni push sans accord explicite. A la fin d'une tache : `git diff --stat`, resume, puis attendre.
- Messages de commit en francais, format `type: description`.
- N'ajouter AUCUNE ligne Co-Authored-By ni mention de Claude dans les commits ou les PR.
