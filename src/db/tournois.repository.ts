import { db } from './connexion';
import { EtatTournoi, Tournoi } from '../models/types';

// Acces a la table tournois.

const COLONNES = 'id, nom, jeu, etat';

const parId = db.prepare(`SELECT ${COLONNES} FROM tournois WHERE id = ?`);
// Un filtre a null est ignore : une seule requete couvre toutes les combinaisons
const filtres = db.prepare(
  `SELECT ${COLONNES} FROM tournois
   WHERE (@jeu IS NULL OR jeu = @jeu) AND (@etat IS NULL OR etat = @etat)
   ORDER BY id`
);
const insertion = db.prepare("INSERT INTO tournois (nom, jeu, etat) VALUES (?, ?, 'inscriptions_ouvertes')");
const majEtat = db.prepare('UPDATE tournois SET etat = ? WHERE id = ?');

export function trouverTournoi(id: number): Tournoi | undefined {
  return parId.get(id) as Tournoi | undefined;
}

/** Tournois dans l'ordre de creation, filtres sur le jeu et l'etat exacts s'ils sont fournis. */
export function listerTournois(filtre: { jeu?: string; etat?: string }): Tournoi[] {
  return filtres.all({ jeu: filtre.jeu ?? null, etat: filtre.etat ?? null }) as Tournoi[];
}

export function creerTournoi(nom: string, jeu: string): Tournoi {
  const { lastInsertRowid } = insertion.run(nom, jeu);
  return trouverTournoi(Number(lastInsertRowid))!;
}

export function changerEtatTournoi(id: number, etat: EtatTournoi): void {
  majEtat.run(etat, id);
}
