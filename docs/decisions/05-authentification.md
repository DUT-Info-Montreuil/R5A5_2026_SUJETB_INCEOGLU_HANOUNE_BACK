# Fiche de décision 5 — Authentification et autorisation

## Le problème

Deux questions à chaque requête : **qui êtes-vous ?** (authentification, 401 si on ne sait pas) et
**que pouvez-vous faire ?** (autorisation, 403 si vous n'avez pas le droit). La deuxième est la plus
riche dans notre sujet : être administrateur ne suffit pas à décrire les droits, il faut aussi savoir
si l'on est capitaine ou membre de l'équipe concernée (B-09, B-10, B-13, B-16).

Contraintes : le front et l'API sont deux applications séparées, et la même identité doit servir à la
fois pour les requêtes REST et pour la connexion Socket.io du temps réel.

## Les options

- **Session côté serveur + cookie (stateful)** : le serveur garde la session et peut l'invalider
  à tout moment. Mais il faut stocker les sessions (en mémoire, ou dans Redis si plusieurs serveurs),
  et protéger l'application contre le CSRF puisque le cookie part automatiquement.
- **JWT (stateless)** : le serveur signe un jeton que le client renvoie à chaque requête ; rien à
  stocker côté serveur. En contrepartie, un jeton ne peut pas être invalidé avant son expiration.
- **Connexion par un service tiers (OAuth/OpenID), magic link, MFA** : utiles, mais hors de notre
  besoin (pas de fournisseur imposé, pas d'envoi d'e-mail dans le périmètre) et plus longs à mettre
  en place.

## Ce que nous avons choisi

**Login / mot de passe, puis un JWT envoyé dans l'en-tête `Authorization: Bearer`.**

- Le JWT (signé HMAC avec `JWT_SECRET`, valable 24 h) ne contient que l'identifiant et le rôle :
  aucune donnée sensible, puisqu'un JWT est lisible par n'importe qui.
- Le même jeton authentifie la connexion Socket.io au moment du handshake : une seule identité pour
  les deux canaux, ce qui n'aurait pas été aussi simple avec des cookies.
- Les mots de passe sont hachés avec **bcrypt** (sel intégré, coût réglable), jamais renvoyés ni
  journalisés. 8 caractères minimum ; au-delà de 72 octets, bcrypt les ignorerait, donc on refuse.
- **Autorisation en deux niveaux** : `requireAuth` (401) et `requireRole('administrateur')` (403) pour
  les routes d'administration, puis dans chaque route des contrôles d'appartenance (capitaine, membre)
  faits **avant** toute action. Chaque règle a son test de refus qui vérifie aussi que rien n'a changé.
- **Protections autour du login** : 10 échecs maximum par IP en 10 minutes (429), même message
  d'erreur que l'e-mail ou le mot de passe soit faux, rôle toujours forcé à `joueur` à l'inscription
  (impossible de s'inscrire administrateur), serveur qui refuse de démarrer sans `JWT_SECRET`.

## Ce que ça coûte

- **Pas de révocation** : un jeton reste valable jusqu'à son expiration, même après déconnexion
  (la déconnexion efface seulement le jeton côté front). Le « freshness pattern » (access token court
  + refresh token révocable en base) réglerait ce point, au prix d'une table de plus.
- **Jeton dans le `localStorage`** : accessible en JavaScript, donc volable en cas de faille XSS.
  Le risque est réduit (React échappe tout le texte affiché, aucun `dangerouslySetInnerHTML`), mais un
  cookie `httpOnly` serait plus sûr, avec une protection CSRF à ajouter.
- **24 h, c'est long** : un compromis entre sécurité et confort (on ne se reconnecte pas pendant un
  tournoi). Plus court, il faudrait le refresh token ci-dessus.
- **Socket.io ne vérifie le jeton qu'à la connexion** : une connexion ouverte survit à l'expiration
  du jeton jusqu'à la prochaine reconnexion.
- **L'inscription révèle si un e-mail existe déjà** (409) : une petite fuite d'information, acceptée
  pour garder un message clair à l'utilisateur.
- **Tout repose sur HTTPS en production** : sans lui, mot de passe et jeton circulent en clair.
