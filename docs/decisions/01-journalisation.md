# Fiche de décision 1 — Format et destination de la journalisation

## Le problème

Le jour du tournoi, l'administrateur saisit les résultats à la chaîne. Si un résultat est mal enregistré
ou si une équipe se retrouve éliminée sans raison apparente (c'est ce qui est arrivé à l'association
avec le tableur), il faut pouvoir remonter le fil : quel match, quel vainqueur, quelle requête, à quelle
heure, et ce que le serveur en a fait ensuite (qualification d'office, forfait automatique, fin du tournoi).

Les logs doivent aussi garder la trace des refus d'accès : un joueur qui essaie d'agir sur une équipe qui
n'est pas la sienne doit laisser une ligne, sans que l'on stocke pour autant des données sensibles.

## Les options

**Format**
- **Texte brut** : une ligne lisible par un humain, mais difficile à filtrer automatiquement.
- **JSON** : une ligne = un objet ; un peu moins agréable à l'œil, mais chaque champ se filtre
  (`matchId`, `userId`, `motif`) et le format est compris par les outils d'analyse.
- **XML / YAML** : structurés aussi, mais plus lourds à produire et sans avantage pour nous.

**Destination**
- **Console** : immédiate en développement, mais perdue à la fermeture du terminal.
- **Fichiers** : simples, conservés, suffisants pour une application qui tourne sur un serveur.
- **Base de données / plateforme centralisée (ELK, Sentry…) / service cloud** : recherche et alertes
  puissantes, mais une infrastructure de plus à installer et à payer, disproportionnée ici.

**Outil** : `console.log` (ni niveaux ni fichiers), morgan (requêtes HTTP seulement, pas les
événements métier), Winston ou Pino (vrais loggers, niveaux, plusieurs destinations).

## Ce que nous avons choisi

**Winston**, après avoir comparé Winston et Pino sur leurs sites et lu quelques articles : à notre
échelle la différence de performance de Pino ne compte pas, et nous avons trouvé plus facilement
des exemples pour Winston.

- **Format JSON**, une ligne par événement. C'est le format que nous manipulons déjà dans nos projets ;
  chaque ligne a les mêmes champs (`level`, `message`, `timestamp`, puis des identifiants), ce qui
  permet de filtrer, par exemple, toutes les lignes d'un `matchId` ou d'un `userId`.
- **Deux destinations** : la console (pour le développement) et un fichier par jour
  `logs/app-AAAA-MM-JJ.log`, compressé une fois archivé, conservé 14 jours, découpé au-delà de 20 Mo.
- **Niveaux** : `info` pour la vie normale de l'application, `warn` pour tout refus, `error` pour
  les erreurs serveur (avec le message et la pile d'appel, qui ne partent jamais au client).
- **Ce qui est journalisé** : chaque requête HTTP (méthode, chemin sans paramètres, statut, durée,
  utilisateur), les actions métier (création, clôture, lancement, résultat, forfait, qualification
  d'office, demandes d'adhésion), les connexions Socket.io et **tous les refus** (401, 403, 409, 429)
  avec les mêmes champs : utilisateur, méthode, chemin, identifiants concernés, motif.
- **Ce qui ne l'est jamais** : mots de passe, hash, jetons JWT, e-mail d'une connexion ratée,
  contenu des messages d'équipe, corps des requêtes. L'adresse IP non plus (RGPD).
- **Bruit retiré** : `/health` et `/api-docs` ne sont journalisés qu'en cas d'erreur serveur.
- **Niveau réglable** par la variable `LOG_LEVEL` (défaut `info`) ; une valeur inconnue est signalée.

## Ce que ça coûte

- **Les logs restent sur la machine.** Si le service informatique déploie l'application dans un
  conteneur sans volume, ou sur plusieurs serveurs, les fichiers sont perdus ou éparpillés. Il faudrait
  alors envoyer les logs vers un service centralisé : nous ne l'avons pas fait.
- **14 jours seulement.** Un litige signalé trois semaines après le tournoi ne pourra plus être retracé.
  C'est un compromis avec la place disque, réglable dans `logger.ts`.
- **Moins lisible à l'œil nu** : le JSON se lit mal dans un terminal ; il faut un outil (`jq`, un
  `grep`) pour chercher.
- **Une discipline à tenir** : rien n'empêche techniquement d'écrire une donnée sensible dans un log.
  La règle est écrite dans le code et dans nos instructions, mais elle repose sur la relecture.
- **Ce ne sont pas des preuves** : le sujet exclut « la trace de qui a saisi un résultat ». Nos logs
  indiquent l'utilisateur à titre de diagnostic, mais ils ne sont ni affichés dans l'application ni
  protégés contre la modification : ce n'est pas un historique officiel.
