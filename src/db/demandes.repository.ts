import { db } from './connexion';
import { DemandeAdhesion, StatutDemande } from '../models/types';

// Acces a la table demandes (B-06).

const COLONNES = 'd.id, d.equipe_id AS equipeId, d.user_id AS userId, d.statut, d.created_at AS createdAt';

const parId = db.prepare(`SELECT ${COLONNES} FROM demandes d WHERE d.id = ?`);
// La demande doit viser cette equipe : un capitaine ne traite pas les demandes des autres
const parIdEtEquipe = db.prepare(`SELECT ${COLONNES} FROM demandes d WHERE d.id = ? AND d.equipe_id = ?`);
const enAttenteDeLEquipe = db.prepare(
  `SELECT ${COLONNES}, u.nom AS nomJoueur
   FROM demandes d LEFT JOIN users u ON u.id = d.user_id
   WHERE d.equipe_id = ? AND d.statut = 'en_attente' ORDER BY d.id`
);
const duJoueur = db.prepare(
  `SELECT ${COLONNES}, e.nom AS nomEquipe, e.tournoi_id AS tournoiId
   FROM demandes d LEFT JOIN equipes e ON e.id = d.equipe_id
   WHERE d.user_id = ? ORDER BY d.id`
);
const enAttenteExiste = db.prepare(
  "SELECT 1 FROM demandes WHERE equipe_id = ? AND user_id = ? AND statut = 'en_attente'"
);
const enAttenteSurTournoi = db.prepare(
  `SELECT ${COLONNES} FROM demandes d JOIN equipes e ON e.id = d.equipe_id
   WHERE d.user_id = ? AND e.tournoi_id = ? AND d.statut = 'en_attente' ORDER BY d.id`
);
const insertion = db.prepare(
  "INSERT INTO demandes (equipe_id, user_id, statut, created_at) VALUES (?, ?, 'en_attente', ?)"
);
const majStatut = db.prepare('UPDATE demandes SET statut = ? WHERE id = ?');

export function trouverDemandeDeLEquipe(demandeId: number, equipeId: number): DemandeAdhesion | undefined {
  return parIdEtEquipe.get(demandeId, equipeId) as DemandeAdhesion | undefined;
}

/** Demandes en attente sur l'equipe, avec le nom du joueur : le capitaine decide sur un nom. */
export function listerDemandesEnAttente(equipeId: number): (DemandeAdhesion & { nomJoueur: string | null })[] {
  return enAttenteDeLEquipe.all(equipeId) as (DemandeAdhesion & { nomJoueur: string | null })[];
}

/** Toutes les demandes du joueur, quel que soit leur statut, avec l'equipe visee et son tournoi. */
export function listerDemandesDuJoueur(
  userId: number
): (DemandeAdhesion & { nomEquipe: string | null; tournoiId: number | null })[] {
  return duJoueur.all(userId) as (DemandeAdhesion & { nomEquipe: string | null; tournoiId: number | null })[];
}

export function aDemandeEnAttente(equipeId: number, userId: number): boolean {
  return enAttenteExiste.get(equipeId, userId) !== undefined;
}

/** Demandes encore en attente du joueur sur les equipes d'un tournoi (B-07). */
export function listerDemandesEnAttenteSurTournoi(userId: number, tournoiId: number): DemandeAdhesion[] {
  return enAttenteSurTournoi.all(userId, tournoiId) as DemandeAdhesion[];
}

export function creerDemande(equipeId: number, userId: number): DemandeAdhesion {
  const { lastInsertRowid } = insertion.run(equipeId, userId, new Date().toISOString());
  return parId.get(Number(lastInsertRowid)) as DemandeAdhesion;
}

/** Change le statut et renvoie la demande a jour. */
export function changerStatutDemande(demandeId: number, statut: StatutDemande): DemandeAdhesion {
  majStatut.run(statut, demandeId);
  return parId.get(demandeId) as DemandeAdhesion;
}
