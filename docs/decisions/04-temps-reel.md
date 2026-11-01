# Fiche de décision 4 — Mécanisme de temps réel

## Le problème

Le jour du tournoi, tout le monde a besoin de voir les choses bouger sans recharger la page :
les capitaines suivent l'état de leur équipe et les messages de leurs joueurs, les joueurs savent
quand ils passent, l'administrateur voit l'arbre avancer à chaque résultat qu'il saisit, et les
spectateurs (même non connectés) ont une vue fiable de l'avancement (B-16, B-19).

Le temps réel touche aussi à la sécurité : un joueur exclu doit perdre l'accès à l'espace de son
équipe immédiatement (B-17), et l'espace d'une équipe éliminée doit se fermer (B-18). Il ne suffit
donc pas de « pousser des données », il faut contrôler qui les reçoit, et pouvoir retirer quelqu'un
en cours de route.

## Les options

- **Polling** : le navigateur redemande les données toutes les X secondes. Simple, mais en retard
  de X secondes, et beaucoup de requêtes pour rien ; un exclu continuerait à voir les messages
  jusqu'au prochain appel.
- **SSE (Server-Sent Events)** : le serveur pousse vers le navigateur sur une connexion HTTP.
  Léger, mais à sens unique : le client ne peut pas demander à rejoindre une room sur la même
  connexion, il faudrait une connexion par sujet suivi.
- **WebSocket natif** : connexion bidirectionnelle, mais tout est à écrire à la main : rooms,
  reconnexion automatique, accusés de réception.
- **Socket.io** : surcouche de WebSocket qui fournit déjà les rooms, la reconnexion, les accusés de
  réception et une authentification au moment de la connexion.

## Ce que nous avons choisi

**Socket.io.** Nous connaissions déjà son système de rooms grâce à un projet personnel (une carte
musicale collaborative), et les rooms correspondent exactement à notre besoin : une room par
tournoi, une par équipe, une par utilisateur.

- **Les écritures restent en REST.** Envoyer un message, saisir un résultat, accepter une demande :
  tout passe par l'API, avec ses contrôles d'accès et ses tests. Socket.io ne sert qu'à **diffuser**
  ce qui vient de se passer. Il n'y a donc qu'une seule porte d'entrée à sécuriser.
- **Authentification à la connexion** avec le même JWT que l'API. Sans jeton, on est visiteur et on
  ne peut rejoindre que les rooms de tournoi (B-19). Un jeton invalide est refusé.
- **Contrôle à l'entrée des rooms** : seuls les membres de l'équipe (et l'administrateur) entrent
  dans `equipe:<id>`. Une équipe éliminée est fermée aux membres, l'administrateur garde la lecture.
- **Retrait immédiat** : à l'exclusion ou au départ d'un joueur, et à l'élimination d'une équipe, le
  serveur retire lui-même les connexions concernées de la room.
- Côté front, les événements mettent à jour le cache des données déjà affichées ; après une coupure,
  la page relit les données pour rattraper ce qui a été diffusé pendant l'absence.
- La liste des rooms et des événements est documentée dans `docs/temps-reel.md`.

## Ce que ça coûte

- **Un seul serveur.** Les rooms vivent dans la mémoire du processus Node. Avec plusieurs serveurs,
  il faudrait un adaptateur partagé (Redis par exemple) pour que tous voient les mêmes rooms.
- **Des connexions ouvertes en permanence**, une par onglet, à garder en vie, et un proxy à
  configurer pour les WebSocket (fait dans Vite pour le développement, à refaire en production).
- **Deux canaux à garder cohérents** : chaque route qui modifie quelque chose doit penser à diffuser.
  Un oubli ne casse rien, mais l'écran reste en retard jusqu'au prochain rechargement.
- **Un événement manqué est perdu** : Socket.io ne rejoue pas les messages pendant une coupure,
  d'où la relecture des données à la reconnexion.
- **Le jeton n'est vérifié qu'à la connexion** : une connexion ouverte reste valable même si le jeton
  expire pendant ce temps, jusqu'à la prochaine reconnexion. Les retraits de room couvrent les cas
  du sujet (exclusion, élimination), pas une révocation générale.
- Une dépendance de plus de chaque côté (serveur et client), plus lourde qu'un WebSocket natif.
