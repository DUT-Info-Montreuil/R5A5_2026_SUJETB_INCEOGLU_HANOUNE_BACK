# Fiche de décision 3 — Base de données

## Le problème

L'application manipule des données très liées entre elles : un tournoi a des équipes, une équipe a
des membres qui sont des utilisateurs, un match oppose deux équipes et alimente le match suivant,
un mot de passe appartient à un utilisateur, une demande d'adhésion relie un joueur à une équipe.
Il faut que ces liens restent cohérents (pas de membre qui pointe vers un utilisateur supprimé,
pas de match vers une équipe inexistante) et que les données survivent à un redémarrage du serveur.

Deux contraintes pratiques en plus : l'enseignant doit pouvoir installer et lancer le projet sans nous
appeler, et nos tests doivent pouvoir repartir d'une base propre à chaque fois.

## Les options

- **Base NoSQL (MongoDB…)** : souple, mais les liens entre documents ne sont pas vérifiés par la base.
  Avec des clés étrangères partout, il aurait fallu recoder cette cohérence nous-mêmes. Écartée.
- **PostgreSQL** : notre premier choix en septembre. Base relationnelle complète, clés étrangères,
  transactions. Mais il faut un serveur : Docker ou une installation locale chez l'enseignant.
- **SQLite** : relationnelle aussi (clés étrangères avec `PRAGMA foreign_keys = ON`, transactions,
  SQL standard), mais la base est un simple fichier. Rien à installer à part `npm install`.
- **Garder les données en mémoire** (ce que nous avons fait pendant le développement, `fakeData.ts`) :
  le plus rapide à écrire, mais tout est perdu à chaque redémarrage.

Pour l'accès aux données, nous avons aussi comparé un **ORM (Prisma)** et du **SQL écrit à la main**.
Nous n'avions jamais utilisé Prisma : le temps d'apprentissage et la « magie » qu'il ajoute ne se
justifiaient pas pour une dizaine de tables. Le SQL à la main reste lisible et nous savons ce qui part
vers la base.

## Ce que nous avons choisi

**SQLite avec `better-sqlite3` et des requêtes SQL écrites à la main.**

- Les liens entre nos données sont exactement ce qu'une base relationnelle sait garantir.
- Aucune installation de serveur : le projet se lance avec `npm install` puis `npm run dev`.
- Chaque fichier de test peut ouvrir sa propre base en mémoire (`:memory:`), vide et isolée.
- `better-sqlite3` est synchrone, comme notre code actuel sur les tableaux en mémoire : le passage à la
  base ne demande pas de réécrire toutes les routes en asynchrone, contrairement au client `pg`.

Nous sommes donc revenus sur PostgreSQL quand nous avons mesuré ce qu'il coûtait en installation et
en réécriture, pour un besoin (une association, quelques tournois par semestre) que SQLite couvre.

## Ce que ça coûte

- **Un seul écrivain à la fois** : SQLite sérialise les écritures. Sans importance à notre échelle, mais
  l'application ne pourrait pas tourner sur plusieurs serveurs partageant la même base.
- **Moins d'outils d'administration** qu'un vrai serveur (droits par utilisateur, sauvegardes à chaud,
  supervision). La sauvegarde se fait en copiant le fichier.
- **Changer de base plus tard** reste possible (le SQL est standard), mais demanderait de reprendre
  la couche d'accès aux données.

## État à la livraison

<!-- A COMPLETER le 31/10 : soit "migration faite", soit le paragraphe ci-dessous. -->
Faute de temps, la migration vers SQLite n'est pas terminée : les données sont encore gardées en
mémoire. Conséquence concrète : si le serveur redémarre pendant un tournoi, les comptes créés, les
équipes et tous les résultats saisis sont perdus. C'est la première chose que nous ferions avec une
journée de plus.
