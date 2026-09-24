import { matchs, equipes, tournois } from '../models/fakeData';
import { Match } from '../models/types';

/**
 * Enregistre le vainqueur d'un match et en tire toutes les consequences (B-14, B-18) :
 * - le perdant est elimine ;
 * - le vainqueur avance dans le match suivant s'il y en a un ;
 * - sinon le match etait la finale, le tournoi est termine.
 *
 * Appelee par la saisie de resultat (B-13) comme par le forfait (B-15) : les deux
 * designent un vainqueur, seule la facon de le determiner change.
 * L'appelant a deja verifie que le tournoi est en cours, que les deux equipes sont
 * connues et que le match n'a pas encore de vainqueur.
 */
export function enregistrerVainqueur(match: Match, vainqueurId: number): void {
  match.vainqueurId = vainqueurId;

  // Le perdant est l'autre equipe du match (B-18)
  const perdantId = vainqueurId === match.equipe1Id ? match.equipe2Id : match.equipe1Id;
  const perdant = equipes.find((e) => e.id === perdantId);
  if (perdant) perdant.eliminee = true;

  if (match.matchSuivantId) {
    // B-14 : faire avancer le gagnant dans le tour suivant
    const suivant = matchs.find((m) => m.id === match.matchSuivantId);
    if (suivant) {
      if (!suivant.equipe1Id) suivant.equipe1Id = vainqueurId;
      else if (!suivant.equipe2Id) suivant.equipe2Id = vainqueurId;
    }
    return;
  }

  // Pas de match suivant : c'etait la finale, le tournoi est termine
  const tournoi = tournois.find((t) => t.id === match.tournoiId);
  if (tournoi) tournoi.etat = 'termine';
}
