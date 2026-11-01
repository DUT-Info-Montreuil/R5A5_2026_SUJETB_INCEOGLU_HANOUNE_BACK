# Rapport sur notre usage de l'IA — R5A5, sujet B

Équipe : Zeki Inceoglu (back, puis front en fin de projet), Hanoune (front, début de projet).

## 1. Ce que nous avons utilisé

**Claude Code** (agent en ligne de commande, sur le Mac de Zeki) a écrit la plus grande partie du code
livré, back et front. Nous ne lui avons jamais laissé commiter seul : chaque tâche se terminait par un
`git diff --stat`, un résumé, et un arrêt ; le commit ne partait qu'après relecture du diff.

**Claude (conversation sur claude.ai)** a servi de second regard, en dehors du code : découper le travail,
écrire les prompts donnés à Claude Code, relire les diffs et les rapports de Claude Code avant commit,
lire le sujet et vos cours pour vérifier qu'on ne passait pas à côté d'une exigence, et nous poser des
questions pour rédiger les fiches de décision à partir de nos réponses.

Hanoune a posé le squelette du front (Vite, TanStack Query, découpage par fonctionnalité) en début de
projet ; nous ne savons pas précisément quels outils d'IA il a utilisés pour cette partie.

**Ce que nous avons outillé, et pourquoi :**

- **Un `CLAUDE.md` dans chaque dépôt** (instructions permanentes). Au début, chaque prompt répétait les
  mêmes consignes : commentaires en français, un test de refus par règle d'accès, ne pas commiter. Elles
  sont maintenant dans ce fichier, lu automatiquement à chaque session, avec un résumé des exigences
  B-01 à B-19. Les prompts sont devenus plus courts et les oublis plus rares.
- **Un sous-agent `reviewer`** (`.claude/agents/reviewer.md`) qui relit le diff avant chaque commit,
  sans pouvoir modifier de fichier : failles d'accès, écarts au sujet, tests de refus manquants, données
  sensibles dans les logs. Il a trouvé de vrais problèmes (voir partie 3), et aussi beaucoup de détails
  mineurs qu'il a fallu trier.
- **Deux sessions en parallèle**, une sur le back et une sur le front, pilotées en partie depuis un
  téléphone (Remote Control) pendant la journée, avec relecture des diffs le soir.
- **CodeRabbit** (relecture automatique des PR) : nous avons essayé, mais l'installation sur
  l'organisation GitHub de l'IUT demande l'accord de ses administrateurs. Abandonné.
- **Commits** : les messages sont les nôtres et Claude n'apparaît pas comme co-auteur ; c'est ce
  rapport qui documente ce que l'IA a produit.

## 2. Nos prompts

Les prompts complets sont en annexe. Voici ce que chacun donnait et ce que nous avons changé.

**Prompt 1 — B-06, demandes d'adhésion.** La première version (début octobre) décrivait les routes, les
règles et les tests à écrire. La session a été interrompue en cours de route : quand nous sommes revenus
fin octobre, la branche contenait 730 lignes non commitées dont on ne savait pas si elles étaient
complètes. Plutôt que de tout relancer, nous avons réécrit le prompt : même spécification, mais
« *D'abord : fais-moi un court tableau "exigence → déjà fait / manquant / à corriger" avant de modifier
quoi que ce soit.* » Résultat : un tableau de 12 lignes qui montrait 2 éléments manquants (le setup des
tests sans `.env`, la route `/me/demandes`) et 3 à corriger, et confirmait qu'aucune assertion existante
n'avait été modifiée. Nous avons validé le tableau, puis seulement laissé l'agent compléter.

**Prompt 2 — aligner le front sur le back.** Le front avait été écrit avant que le back existe, sur un
contrat supposé (routes en anglais, `pseudo`, identifiants en texte). Le premier réflexe aurait été de
demander « fais marcher le front ». Nous avons écrit à la place : « *Le back est maintenant la référence :
son repo est à côté […] Aligne tout le front dessus* », et ajouté une ligne après avoir lancé les deux
sessions en même temps : « *une autre session modifie le back en ce moment : NE MODIFIE AUCUN fichier
du back.* » Sans cette ligne, la session front aurait pu « corriger » le back pour l'adapter au front.

**Prompt 3 — la fin de chaque prompt.** Nos premiers prompts se terminaient par « fais X ». Ils se
terminent maintenant tous par : « *npm test, tsc, lance l'agent reviewer, corrige ce qui est fondé,
montre git diff --stat + le rapport du reviewer, et ARRÊTE-TOI sans commit.* » C'est ce qui nous a permis
de relire chaque changement, et de refuser ou de reprendre ce qui ne nous allait pas.

## 3. Ce que nous avons corrigé

**Une faille trouvée par une session sur le code d'une autre.** En testant les écrans d'arbitrage, la
session front a remarqué qu'après un double forfait au lancement, le match gardait ses deux équipes sans
vainqueur, et que le back acceptait encore un résultat ou un forfait dessus : une équipe éliminée pouvait
revenir dans le tournoi. Les tests du back ne le voyaient pas, parce qu'ils testaient ce que l'agent avait
pensé à tester. Correction : 409 sur `/resultat` et `/forfait` si une des deux équipes est éliminée, avec
des tests qui vérifient que les équipes restent éliminées et que l'arbre ne bouge pas.

**Des tests verts… seulement chez nous.** Sans fichier `.env`, 32 tests sur 47 échouaient (connexion en
erreur 500, faute de `JWT_SECRET`). Nous ne l'aurions pas vu avant votre propre `npm test`. Correction :
un fichier de setup jest qui fixe un secret de test seulement s'il est absent.

**Un objet à la place d'un texte.** En relisant la sécurité, nous avons vu que l'envoi d'un message
vérifiait seulement que `contenu` n'était pas vide : `{"contenu": {"a": 1}}` était enregistré et diffusé
à toute l'équipe, et la page de discussion plantait chez chacun. Correction : une fonction de validation
commune (type, vide, longueur maximale) pour tous les textes reçus. Au passage, l'agent a trouvé qu'un
mot de passe qui n'est pas du texte au login faisait planter bcrypt (500 au lieu de 400).

**Un mauvais diagnostic, corrigé par une mesure.** Un test échouait environ une fois sur quatre. Nous
pensions à un test Socket.io trop pressé. L'agent a relancé la suite des dizaines de fois sous charge :
l'échec venait en fait de supertest, qui ouvre et ferme un serveur à chaque requête. La correction
(un serveur unique pour les tests) n'aurait pas été la même si nous avions suivi notre intuition.

**Un détail que les tests ne voyaient pas.** Le niveau de log (`LOG_LEVEL`) écrit dans `.env` était
ignoré : `logger.ts` est importé avant que `app.ts` charge le `.env`. Extrait de la correction :

```ts
// Ce module est importe avant que app.ts n'appelle dotenv.config() : sans ce chargement,
// LOG_LEVEL ecrit dans le fichier .env serait ignore a la creation du logger.
dotenv.config({ quiet: true });
```

**Ce que les tests automatiques ne voyaient pas.** La veille de la livraison, nous avons testé
l'application nous-mêmes, rôle par rôle, avec une liste des exigences B-01 à B-19. Les 141 tests étaient
verts, et pourtant : un administrateur pouvait créer une équipe et en devenir capitaine, alors que c'est
lui qui arbitre ; et deux comptes ouverts dans deux onglets du même navigateur se mélangeaient (le jeton
est partagé par les onglets : un message partait sous le nom de l'autre compte). Les tests vérifiaient
ce qu'on leur avait demandé de vérifier ; il a fallu un humain qui utilise l'application pour voir le
reste. Nous avons fait suivre ce passage d'une série de tests d'attaque à la main (jeton forgé, accès à
l'équipe d'un autre, injection dans le login, limite de connexions), tous refusés comme attendu.

**La migration vers SQLite, faite tard mais sans casse.** Nous avons repoussé la base de données
jusqu'au dernier jour. La migration (schéma, couche d'accès, transactions, jeu de démonstration) a été
écrite par l'agent en une vingtaine de minutes, et c'est la suite de tests qui l'a rendue possible :
la consigne était de garder les 134 tests verts sans toucher à une seule assertion, et c'est ce qui
nous a permis de faire confiance au résultat. Sans ces tests, nous n'aurions pas pris ce risque la
veille de la livraison.

**Et nos propres erreurs avec l'outil.** Deux PR sont parties vers `main` au lieu de `dev` (base par
défaut de GitHub) ; deux sessions qui travaillaient en même temps ont redémarré le serveur l'une sous
l'autre, ce qui a fait échouer des tests manuels ; une session fermée trop tôt a laissé un travail à
moitié fait, qu'il a fallu reprendre avec le prompt 1.

## 4. Bilan

**Ce que ça nous a apporté.** Sans IA, le projet aurait sans doute pu aboutir quand même, mais pas dans
ce délai. Cet été, Zeki a fait exprès ses projets personnels sans IA : ils étaient beaucoup plus petits
que celui-ci et ont pris beaucoup plus de temps. Ici, l'IA a pris en charge le squelette, une bonne
partie du débogage et le code répétitif, ce qui nous a laissé plus de temps pour ce qui demande de
réfléchir : les décisions, la conception du système, savoir quelle donnée vient d'où et qui a le droit
de faire quoi. Le front (équipes, administration, arbre, temps réel) a été écrit et testé en deux jours.
L'IA nous a aussi poussés vers des pratiques que nous n'aurions pas tenues seuls dans ce délai : un test
de refus pour chaque règle, une relecture systématique, des PR petites et décrites.

**Ce que ça nous a coûté.**
- Du temps de relecture : un diff de 900 lignes se relit lentement, et c'est là que se joue la qualité.
- De la vigilance : l'agent écrit des tests qui passent, pas forcément les tests qui manquent
  (la faille du double forfait était « couverte » par des tests verts).
- Le plaisir et la pratique du code écrit à la main. On ne retrouve plus le plaisir de « résoudre le
  puzzle » soi-même, et la capacité à écrire du code sans aide s'émousse. Zeki continue à s'entraîner à
  côté (LeetCode, Advent of Code) : ce n'est pas la même chose qu'écrire des routes Express, mais c'est
  une gymnastique qu'il apprécie. Le temps gagné d'un côté est réinvesti de l'autre.

**Ce que nous ferions autrement.**
- Fixer le contrat de l'API entre front et back dès le début, avant d'écrire l'un ou l'autre.
- Écrire le `CLAUDE.md` et l'agent de relecture dès le premier jour, pas à mi-projet.
- Choisir la base de données en mesurant le coût d'installation et de migration, et la mettre en place
  au début plutôt qu'en fin de projet.
- Mieux organiser notre temps. Avec le blocus, il n'y avait plus de séances à l'IUT et tout s'est fait
  à la maison, sur notre propre temps, ce qui nous a poussés à nous reposer davantage sur l'IA. Nous
  aurions préféré travailler ce projet aux heures de cours et garder le code « à la maison » pour nos
  projets personnels ; à défaut, nous aurions dû nous imposer des horaires comme si les cours avaient lieu.
- Nous n'avons pas de regret sur le fond : ce projet nous a fait beaucoup progresser en développement
  assisté par agents (instructions permanentes, relecture, sessions parallèles), une compétence qui
  nous semble appelée à compter pour les développeurs.

## Annexe — prompts recopiés tels quels

### Prompt 1, version 1 (7 octobre) — extrait

```
B-06:
- types.ts: DemandeAdhesion { id, equipeId, userId, statut: 'en_attente'|'acceptee'|'refusee'|'annulee', createdAt }
- fakeData.ts: demandes: DemandeAdhesion[] = []
- equipes.routes.ts:
  * POST /:id/demandes (requireAuth): 201. 409 si inscriptions fermees, equipe complete (5),
    joueur deja dans une equipe du tournoi (B-07), demande en_attente deja existante pour cette equipe.
  [...]
  * SUPPRIMER POST /:id/membres (adhesion directe sans accord du capitaine = faille).
[...]
A la fin: npm test et npx tsc --noEmit doivent passer. Montre git diff --stat et la liste des
assertions modifiees, puis DUR, ne commit pas. N'ajoute jamais Co-Authored-By ni mention de Claude
dans les commits.
```

### Prompt 1, version 2 (28 octobre) — reprise d'un travail interrompu

```
Lis CLAUDE.md. On est sur feat/demandes-adhesion : un travail B-06 / B-02 non commite est deja
present (git diff). Ne repars pas de zero : verifie-le contre la specification ci-dessous et
complete ce qui manque ou corrige ce qui s'en ecarte.
[... specification identique a la version 1, plus le setup jest et GET /api/auth/me/demandes ...]
D'abord : fais-moi un court tableau "exigence -> deja fait / manquant / a corriger" avant de modifier
quoi que ce soit.
Ensuite complete. Fin : npm test, test sans JWT_SECRET, npx tsc --noEmit, lance l'agent reviewer,
corrige ce qui est fonde, montre git diff --stat + rapport du reviewer, et ARRETE-TOI sans commit.
```

### Prompt 2 — aligner le front sur le back

```
Lis CLAUDE.md. On est deja sur fix/contrat-api.

Le front a ete ecrit avant que le back existe, avec un contrat suppose (anglais, ids string).
Le back est maintenant la reference : son repo est a cote, ../R5A5_2026_SUJETB_INCEOGLU_HANOUNE_BACK
(lis src/routes/*.routes.ts et src/models/types.ts). Aligne tout le front dessus :
[... 5 points : proxy Vite, types, auth, tournois, CONTRAT_API.md ...]

Attention : le repo back a cote est en cours de modification par une autre session (branche
feat/demandes-adhesion, non commitee). Lis-le, ne modifie AUCUN fichier du back.

Teste en lancant le back [...] Fin : npm run build, npm run lint, lance l'agent reviewer, corrige ce
qui est fonde, montre git diff --stat + rapport du reviewer, et ARRETE-TOI sans commit.
```

### Prompt 3 — la fin commune à tous les prompts

```
Fin : npm test, npx tsc --noEmit, lance l'agent reviewer, corrige ce qui est fonde,
git diff --stat + rapport du reviewer, ARRETE-TOI sans commit.
```
