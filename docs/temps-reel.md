# Temps reel (Socket.io)

Exigences couvertes : B-16 (messages en temps reel), B-17 (un exclu perd immediatement l'acces),
B-18 (espace d'une equipe eliminee ferme, sauf pour l'administrateur), B-19 (le tournoi avance sans recharger).

## Principe

- **Toute ecriture passe par l'API REST.** Ses controles d'acces restent la seule porte d'entree.
- **Socket.io ne fait que diffuser.** Le client ne peut que rejoindre ou quitter des rooms ;
  aucun evenement client ne modifie de donnee.
- Socket.io partage le serveur HTTP d'Express : meme URL, meme port (`http://localhost:3000` en dev).
- CORS : seule l'origine `FRONT_URL` est autorisee, comme pour l'API.

Code : `src/realtime/socket.ts` (connexion, rooms) et `src/realtime/diffusion.ts` (emissions appelees par les routes).

## Connexion

```ts
import { io } from 'socket.io-client';

// Visiteur : pas de token
const socket = io('http://localhost:3000');

// Utilisateur connecte : le JWT obtenu par POST /api/auth/login
const socket = io('http://localhost:3000', { auth: { token } });

socket.on('connect_error', (err) => {
  // err.message === 'Token invalide ou expire' : se reconnecter via /api/auth/login
});
```

| Cas | Resultat |
|---|---|
| Pas de `auth.token` | Connexion acceptee en **visiteur** : rooms tournoi seulement |
| `auth.token` valide | Connexion acceptee ; rejoint automatiquement sa room personnelle `utilisateur:<userId>` |
| `auth.token` present mais invalide ou expire | Connexion **refusee** : `connect_error` avec `Token invalide ou expire` |

## Rooms

| Room | Qui peut y entrer | Comment |
|---|---|---|
| `tournoi:<tournoiId>` | Tout le monde, visiteurs compris (B-19) | `tournoi:rejoindre` |
| `equipe:<equipeId>` | Membre de l'equipe, ou administrateur. Equipe eliminee : administrateur seulement (B-16, B-18) | `equipe:rejoindre` |
| `utilisateur:<userId>` | L'utilisateur lui-meme | Automatique a la connexion avec token |

Les regles de `equipe:<id>` sont celles de `GET /api/equipes/:id/messages`, et sont reverifiees
a chaque demande d'entree : un joueur exclu ou parti ne peut pas revenir (B-17).
Le jeton n'etant verifie qu'au handshake, `equipe:rejoindre` controle aussi son expiration :
une socket dont le jeton a expire est refusee puis deconnectee, comme le REST repondrait 401.

## Evenements client → serveur

Tous acceptent un accuse de reception (ack) : `{ ok: true }` ou `{ ok: false, message }`.

| Evenement | Payload | Refus possibles (`message`) |
|---|---|---|
| `tournoi:rejoindre` | `{ tournoiId: number }` | `tournoiId invalide`, `Tournoi introuvable` |
| `tournoi:quitter` | `{ tournoiId: number }` | `tournoiId invalide` |
| `equipe:rejoindre` | `{ equipeId: number }` | `Authentification requise` (visiteur), `Token invalide ou expire` (jeton expire depuis la connexion : la socket est aussi deconnectee), `equipeId invalide`, `Equipe introuvable`, `Acces refuse` (non membre), `Espace ferme, equipe eliminee` (membre d'une equipe eliminee) |
| `equipe:quitter` | `{ equipeId: number }` | `equipeId invalide` |

```ts
const reponse = await socket.timeout(5000).emitWithAck('equipe:rejoindre', { equipeId: 4 });
if (!reponse.ok) afficherErreur(reponse.message);
```

Apres une reconnexion, le client doit rejoindre a nouveau ses rooms `tournoi:` et `equipe:`
(la room `utilisateur:` est rejointe automatiquement).

## Evenements serveur → client

| Evenement | Room | Payload | Declencheur |
|---|---|---|---|
| `message:nouveau` | `equipe:<id>` | `Message` + `nomAuteur: string \| null` | `POST /api/equipes/:id/messages` (B-16) |
| `equipe:maj` | `equipe:<id>` et `tournoi:<tournoiId>` | `Equipe` | Creation, renommage, role attribue, capitaine change, demande acceptee, exclusion, depart, elimination |
| `equipe:exclu` | `utilisateur:<userId>` (l'exclu) | `{ equipeId: number, motif: 'exclusion' \| 'depart' }` | `DELETE /api/equipes/:id/membres/:userId` (B-17) |
| `demande:nouvelle` | `utilisateur:<capitaineId>` | `DemandeAdhesion` + `nomJoueur: string \| null` | `POST /api/equipes/:id/demandes` (B-06) |
| `demande:maj` | `utilisateur:<auteurId>`, et aussi `utilisateur:<capitaineId>` pour une annulation | `DemandeAdhesion` (statut `acceptee`, `refusee` ou `annulee`) | Decision du capitaine (auteur seul), annulation par l'auteur ou annulation automatique B-07 (auteur et capitaine de l'equipe visee) |
| `tournoi:maj` | `tournoi:<id>` | `Tournoi` | Cloture des inscriptions, lancement, fin du tournoi (B-19) |
| `tournoi:matchs` | `tournoi:<id>` | `Match[]` (tous les matchs du tournoi) | Cloture (arbre genere), lancement (forfaits B-04), resultat, forfait, qualifications d'office (B-19) |

`tournoi:matchs` est emis **une seule fois par requete**, apres toute la cascade
(avancement du gagnant, qualifications d'office, fin du tournoi) : le client recoit un arbre coherent
et peut simplement remplacer celui qu'il affiche.

Les types (`Message`, `Equipe`, `DemandeAdhesion`, `Tournoi`, `Match`) sont ceux de l'API REST
(`src/models/types.ts`, schemas Swagger sur `/api-docs`).

## Regles de securite

- **B-17 — exclusion ou depart** : le joueur recoit `equipe:exclu`, puis **tous ses sockets**
  (tous ses onglets et appareils) sont retires de `equipe:<id>` dans la meme requete.
  Le message suivant ne lui parvient donc plus, et il ne peut plus rejoindre la room.
- **B-18 — elimination** : les membres recoivent un dernier `equipe:maj` (`eliminee: true`),
  puis tous les sockets non administrateurs sont retires de `equipe:<id>`.
  L'administrateur reste dans la room et peut toujours y entrer.
- Un refus d'entree dans une room ne revele pas l'elimination a un non-membre : `Acces refuse` est prioritaire.

## Journalisation

| Evenement | Niveau | Champs |
|---|---|---|
| Connexion, deconnexion | info | `socketId`, `userId` ou `visiteur`, `raison` (deconnexion) |
| Connexion refusee | warn | `socketId`, `motif` (`token_invalide`, `token_expire`) |
| Room rejointe | info | `socketId`, `userId` ou `visiteur`, `tournoiId` ou `equipeId` |
| Room quittee | info | `socketId`, `userId` ou `visiteur`, `tournoiId` ou `equipeId` |
| Room refusee | warn | `socketId`, `userId` ou `visiteur`, `equipeId`, `motif` (`non_authentifie`, `token_expire`, `non_membre`, `equipe_eliminee`) |
| Retrait de room (B-17, B-18) | info | `equipeId`, `userId`, `motif` |

Jamais de token ni de contenu de message dans les logs.
