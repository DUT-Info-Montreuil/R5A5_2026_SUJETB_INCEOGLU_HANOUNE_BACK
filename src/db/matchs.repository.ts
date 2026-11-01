import { db } from './connexion';
import { Match } from '../models/types';

// Acces a la table matchs.

const COLONNES = `id, tournoi_id AS tournoiId, round, position, equipe1_id AS equipe1Id,
  equipe2_id AS equipe2Id, vainqueur_id AS vainqueurId, match_suivant_id AS matchSuivantId`;

const parId = db.prepare(`SELECT ${COLONNES} FROM matchs WHERE id = ?`);
const duTournoi = db.prepare(`SELECT ${COLONNES} FROM matchs WHERE tournoi_id = ? ORDER BY id`);
const parPlace = db.prepare(
  `SELECT ${COLONNES} FROM matchs WHERE tournoi_id = ? AND round = ? AND position = ?`
);
const prochainId = db.prepare('SELECT COALESCE(MAX(id), 0) + 1 AS id FROM matchs');
const insertion = db.prepare(
  `INSERT INTO matchs (id, tournoi_id, round, position, equipe1_id, equipe2_id, vainqueur_id, match_suivant_id)
   VALUES (@id, @tournoiId, @round, @position, @equipe1Id, @equipe2Id, @vainqueurId, @matchSuivantId)`
);
const majVainqueur = db.prepare('UPDATE matchs SET vainqueur_id = ? WHERE id = ?');
const majEquipe1 = db.prepare('UPDATE matchs SET equipe1_id = ? WHERE id = ?');
const majEquipe2 = db.prepare('UPDATE matchs SET equipe2_id = ? WHERE id = ?');

export function trouverMatch(id: number): Match | undefined {
  return parId.get(id) as Match | undefined;
}

/** Arbre d'un tournoi, dans l'ordre de generation (round 1 position 1 a la finale). */
export function listerMatchsDuTournoi(tournoiId: number): Match[] {
  return duTournoi.all(tournoiId) as Match[];
}

export function trouverMatchParPlace(tournoiId: number, round: number, position: number): Match | undefined {
  return parPlace.get(tournoiId, round, position) as Match | undefined;
}

/** Premier id libre, a passer a genererArbre (qui calcule les matchSuivantId a partir des ids). */
export function prochainIdDeMatch(): number {
  return (prochainId.get() as { id: number }).id;
}

/**
 * Insere un arbre genere par genererArbre. A appeler dans une transaction : les
 * match_suivant_id visent des matchs inseres apres, la cle etrangere est verifiee au commit.
 */
export function insererMatchs(matchs: Match[]): void {
  for (const match of matchs) insertion.run(match);
}

export function definirVainqueur(matchId: number, vainqueurId: number): void {
  majVainqueur.run(vainqueurId, matchId);
}

/** Place une equipe dans le creneau 1 (equipe1Id) ou 2 (equipe2Id) d'un match. */
export function placerEquipe(matchId: number, creneau: 1 | 2, equipeId: number): void {
  (creneau === 1 ? majEquipe1 : majEquipe2).run(equipeId, matchId);
}
