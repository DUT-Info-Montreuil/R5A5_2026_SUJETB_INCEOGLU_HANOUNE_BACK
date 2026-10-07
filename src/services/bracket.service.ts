import { Match } from '../models/types';

// B-12 : le tournoi se joue a huit equipes, soit trois tours (4 + 2 + 1 matchs)
export const NOMBRE_EQUIPES_REQUIS = 8;

// Nombre de matchs par tour, du premier tour a la finale
const MATCHS_PAR_ROUND = [4, 2, 1];

/**
 * Construit l'arbre d'un tournoi a huit equipes (B-12).
 *
 * Fonction pure : elle ne lit ni n'ecrit fakeData, elle se contente de renvoyer les
 * sept matchs a enregistrer. Les ids sont attribues a partir de premierId, dans l'ordre
 * round 1 positions 1 a 4, puis round 2 positions 1 et 2, puis la finale.
 *
 * Les equipes sont placees dans l'ordre recu. L'appelant transmet l'ordre d'inscription
 * (id d'equipe croissant) : a defaut de regle de classement dans le sujet, l'ordre
 * d'inscription est le seul critere objectif et reproductible dont on dispose.
 *
 * Chainage : le match (round r, position p) alimente (round r + 1, position arrondi(p / 2)).
 */
export function genererArbre(tournoiId: number, equipeIds: number[], premierId: number): Match[] {
  if (equipeIds.length !== NOMBRE_EQUIPES_REQUIS) {
    throw new Error(
      `L arbre se genere avec exactement ${NOMBRE_EQUIPES_REQUIS} equipes (recu : ${equipeIds.length})`
    );
  }

  const matchsGeneres: Match[] = [];

  // Id du premier match de chaque round, pour calculer les matchSuivantId
  const premierIdDuRound: number[] = [];
  let idCourant = premierId;
  for (const nombreDeMatchs of MATCHS_PAR_ROUND) {
    premierIdDuRound.push(idCourant);
    idCourant += nombreDeMatchs;
  }

  for (let indexRound = 0; indexRound < MATCHS_PAR_ROUND.length; indexRound++) {
    const round = indexRound + 1;
    const dernierRound = indexRound === MATCHS_PAR_ROUND.length - 1;

    for (let position = 1; position <= MATCHS_PAR_ROUND[indexRound]; position++) {
      // Seul le premier tour connait ses equipes : les suivants se remplissent au fil des resultats (B-14)
      const premierTour = round === 1;
      const equipe1Id = premierTour ? equipeIds[(position - 1) * 2] : null;
      const equipe2Id = premierTour ? equipeIds[(position - 1) * 2 + 1] : null;

      const positionSuivante = Math.ceil(position / 2);
      const matchSuivantId = dernierRound
        ? null
        : premierIdDuRound[indexRound + 1] + (positionSuivante - 1);

      matchsGeneres.push({
        id: premierIdDuRound[indexRound] + (position - 1),
        tournoiId,
        round,
        position,
        equipe1Id,
        equipe2Id,
        vainqueurId: null,
        matchSuivantId,
      });
    }
  }

  return matchsGeneres;
}
