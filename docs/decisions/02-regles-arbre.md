# Fiche de décision 2 — Règles de l'arbre et des forfaits

## Le problème

Le sujet fixe le cadre (B-04, B-12, B-14, B-15) : l'arbre se construit à la clôture à partir de huit
équipes, les équipes incomplètes au lancement sont forfait sur leur premier match, un résultat fait
avancer le gagnant. Mais plusieurs cas ne sont pas décrits, et il fallait trancher pour que le tournoi
ne se bloque jamais et qu'on ne puisse plus « éliminer une équipe par erreur » :

1. Que faire s'il n'y a pas huit équipes au moment de clôturer ?
2. Dans quel ordre placer les équipes dans l'arbre ?
3. Que se passe-t-il quand les deux équipes d'un même match sont forfait ?
4. Dans quelle case du match suivant va le gagnant ?

## Les options et ce que nous avons choisi

**1. Moins (ou plus) de huit équipes.** On pouvait accepter un arbre incomplet en donnant un
« bye » (une équipe passe le premier tour sans jouer), ou refuser. **Choix : refuser.** La clôture
renvoie une erreur 409 tant qu'il n'y a pas exactement huit équipes, et une neuvième équipe ne peut
pas s'inscrire. C'est la lecture la plus directe de B-12, et un arbre à « byes » ajoutait des cas à
gérer partout ailleurs.

**2. Placement dans l'arbre.** On a hésité entre un tirage au sort et l'ordre d'inscription. Le tirage
au sort nous semblait plus juste. **Choix : l'ordre d'inscription** (identifiant d'équipe croissant),
parce qu'il donne toujours le même arbre pour les mêmes inscriptions : on peut le vérifier dans les
tests et l'expliquer à une équipe qui conteste son placement. La génération est une fonction pure
(`genererArbre`), réutilisée aussi pour le jeu de données de démonstration.

**3. Double forfait.** On pouvait faire avancer une des deux équipes au hasard, ou n'en faire avancer
aucune. **Choix : aucune.** Les deux équipes sont éliminées et leur case au tour suivant reste vide ;
l'équipe qui les attendait est qualifiée d'office dès qu'elle est connue, et la situation remonte dans
l'arbre si besoin. Si plus aucune équipe ne peut atteindre la finale, le tournoi passe à « terminé »
sans vainqueur plutôt que de rester bloqué « en cours ».

**4. Case du gagnant.** Au départ, le gagnant prenait la première case libre du match suivant :
l'arbre changeait selon l'ordre dans lequel l'administrateur saisissait les résultats. **Choix : la
case dépend de la position du match** (position impaire → équipe 1, paire → équipe 2). L'arbre
affiché est donc toujours le même.

## Ce que ça coûte

- **Un tournoi à sept équipes ne peut pas démarrer.** L'administrateur doit attendre une huitième
  équipe : c'est une question que nous voulons encore poser à l'enseignant.
- **L'ordre d'inscription se manipule** : deux équipes amies peuvent s'inscrire l'une après l'autre
  pour se rencontrer (ou s'éviter) au premier tour. Un tirage au sort réglerait ce problème au prix de
  tests moins simples.
- **Une équipe peut avancer sans jouer**, parfois deux tours de suite en cas de forfaits en cascade.
  C'est étrange sportivement, mais moins injuste qu'un tirage au sort entre deux équipes forfait.
- **Ces règles sont les nôtres** : si l'association en voulait d'autres, il faudrait modifier
  `bracket.service.ts` et `match.service.ts`, et les tests qui les vérifient.
