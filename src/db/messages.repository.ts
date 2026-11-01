import { db } from './connexion';
import { Message } from '../models/types';

// Acces a la table messages (B-16).

const COLONNES = 'id, equipe_id AS equipeId, user_id AS userId, contenu, created_at AS createdAt';

const parId = db.prepare(`SELECT ${COLONNES} FROM messages WHERE id = ?`);
const deLEquipe = db.prepare(`SELECT ${COLONNES} FROM messages WHERE equipe_id = ? ORDER BY id`);
const insertion = db.prepare('INSERT INTO messages (equipe_id, user_id, contenu, created_at) VALUES (?, ?, ?, ?)');

/** Messages de l'equipe, du plus ancien au plus recent. */
export function listerMessagesDeLEquipe(equipeId: number): Message[] {
  return deLEquipe.all(equipeId) as Message[];
}

export function creerMessage(equipeId: number, userId: number, contenu: string): Message {
  const { lastInsertRowid } = insertion.run(equipeId, userId, contenu, new Date().toISOString());
  return parId.get(Number(lastInsertRowid)) as Message;
}
