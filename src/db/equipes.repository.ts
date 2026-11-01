import { db, enTransaction } from './connexion';
import { Equipe, MembreEquipe } from '../models/types';

// Acces aux tables equipes et membres. Une Equipe est toujours renvoyee avec ses membres,
// dans leur ordre d'arrivee, et le nom de chaque membre lu dans users.

type LigneEquipe = Omit<Equipe, 'eliminee' | 'membres'> & { eliminee: number };
type LigneMembre = MembreEquipe & { equipeId: number };

const COLONNES_EQUIPE =
  'e.id, e.tournoi_id AS tournoiId, e.nom, e.capitaine_id AS capitaineId, e.eliminee';

const equipeParId = db.prepare(`SELECT ${COLONNES_EQUIPE} FROM equipes e WHERE e.id = ?`);
const equipesDuTournoi = db.prepare(
  `SELECT ${COLONNES_EQUIPE} FROM equipes e WHERE e.tournoi_id = ? ORDER BY e.id`
);
const equipesDuMembre = db.prepare(
  `SELECT ${COLONNES_EQUIPE} FROM equipes e
   JOIN membres m ON m.equipe_id = e.id
   WHERE m.user_id = ? ORDER BY e.id`
);
const nombreDuTournoi = db.prepare('SELECT COUNT(*) AS nombre FROM equipes WHERE tournoi_id = ?');

// Membres de plusieurs equipes en une requete : json_each deroule le tableau d'ids
const membresDesEquipes = db.prepare(
  `SELECT m.equipe_id AS equipeId, m.user_id AS userId, u.nom, m.role_jeu AS roleJeu
   FROM membres m JOIN users u ON u.id = m.user_id
   WHERE m.equipe_id IN (SELECT value FROM json_each(?))
   ORDER BY m.id`
);
const engageSurTournoi = db.prepare('SELECT 1 FROM membres WHERE tournoi_id = ? AND user_id = ?');

const insertionEquipe = db.prepare(
  'INSERT INTO equipes (tournoi_id, nom, capitaine_id, eliminee) VALUES (?, ?, ?, 0)'
);
const insertionMembre = db.prepare(
  // tournoi_id est relu dans equipes : la cle etrangere composee le verifie de toute facon
  `INSERT INTO membres (equipe_id, tournoi_id, user_id, role_jeu)
   SELECT id, tournoi_id, ?, NULL FROM equipes WHERE id = ?`
);
const suppressionMembre = db.prepare('DELETE FROM membres WHERE equipe_id = ? AND user_id = ?');
const majRoleJeu = db.prepare('UPDATE membres SET role_jeu = ? WHERE equipe_id = ? AND user_id = ?');
const majNom = db.prepare('UPDATE equipes SET nom = ? WHERE id = ?');
const majCapitaine = db.prepare('UPDATE equipes SET capitaine_id = ? WHERE id = ?');
const majEliminee = db.prepare('UPDATE equipes SET eliminee = 1 WHERE id = ?');

/** Assemble les lignes d'equipes et leurs membres dans la forme renvoyee par l'API. */
function avecMembres(lignes: LigneEquipe[]): Equipe[] {
  if (lignes.length === 0) return [];

  const membres = membresDesEquipes.all(JSON.stringify(lignes.map((l) => l.id))) as LigneMembre[];
  return lignes.map((ligne) => ({
    id: ligne.id,
    tournoiId: ligne.tournoiId,
    nom: ligne.nom,
    capitaineId: ligne.capitaineId,
    eliminee: ligne.eliminee === 1,
    membres: membres
      .filter((m) => m.equipeId === ligne.id)
      .map(({ userId, nom, roleJeu }) => ({ userId, nom, roleJeu })),
  }));
}

export function trouverEquipe(id: number): Equipe | undefined {
  const ligne = equipeParId.get(id) as LigneEquipe | undefined;
  return ligne ? avecMembres([ligne])[0] : undefined;
}

/** Equipes engagees sur un tournoi, dans l'ordre d'inscription. */
export function listerEquipesDuTournoi(tournoiId: number): Equipe[] {
  return avecMembres(equipesDuTournoi.all(tournoiId) as LigneEquipe[]);
}

/** Equipes dont le joueur est membre (capitaine compris), tous tournois confondus. */
export function listerEquipesDuMembre(userId: number): Equipe[] {
  return avecMembres(equipesDuMembre.all(userId) as LigneEquipe[]);
}

export function compterEquipesDuTournoi(tournoiId: number): number {
  return (nombreDuTournoi.get(tournoiId) as { nombre: number }).nombre;
}

/** B-07 : le joueur est-il deja membre d'une equipe de ce tournoi ? */
export function estEngageSurTournoi(userId: number, tournoiId: number): boolean {
  return engageSurTournoi.get(tournoiId, userId) !== undefined;
}

/** B-05 : cree l'equipe avec son createur comme capitaine et premier membre. */
export function creerEquipe(tournoiId: number, nom: string, capitaineId: number): Equipe {
  return enTransaction(() => {
    const id = Number(insertionEquipe.run(tournoiId, nom, capitaineId).lastInsertRowid);
    insertionMembre.run(capitaineId, id);
    return trouverEquipe(id)!;
  });
}

export function ajouterMembre(equipeId: number, userId: number): void {
  insertionMembre.run(userId, equipeId);
}

/** Renvoie false si le joueur n'etait pas membre de l'equipe. */
export function retirerMembre(equipeId: number, userId: number): boolean {
  return suppressionMembre.run(equipeId, userId).changes > 0;
}

export function definirRoleJeu(equipeId: number, userId: number, roleJeu: string): void {
  majRoleJeu.run(roleJeu, equipeId, userId);
}

export function renommerEquipe(equipeId: number, nom: string): void {
  majNom.run(nom, equipeId);
}

export function definirCapitaine(equipeId: number, userId: number): void {
  majCapitaine.run(userId, equipeId);
}

export function marquerEliminee(equipeId: number): void {
  majEliminee.run(equipeId);
}
