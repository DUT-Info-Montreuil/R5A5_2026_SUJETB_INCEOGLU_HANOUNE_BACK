import { db, enTransaction } from './connexion';
import { User } from '../models/types';

// Acces aux tables users et credentials.
// Le hash du mot de passe n'est lu que par hashDuMotDePasse : aucune autre requete ne le
// selectionne, un User renvoye a l'API ne peut donc pas le contenir.

const COLONNES_USER = 'id, nom, email, role';

const parId = db.prepare(`SELECT ${COLONNES_USER} FROM users WHERE id = ?`);
const parEmail = db.prepare(`SELECT ${COLONNES_USER} FROM users WHERE email = ?`);
const hashParUser = db.prepare('SELECT password_hash AS passwordHash FROM credentials WHERE user_id = ?');
const insertionUser = db.prepare("INSERT INTO users (nom, email, role) VALUES (?, ?, 'joueur')");
const insertionCredential = db.prepare('INSERT INTO credentials (user_id, password_hash) VALUES (?, ?)');

export function trouverUtilisateur(id: number): User | undefined {
  return parId.get(id) as User | undefined;
}

export function trouverUtilisateurParEmail(email: string): User | undefined {
  return parEmail.get(email) as User | undefined;
}

export function hashDuMotDePasse(userId: number): string | undefined {
  return (hashParUser.get(userId) as { passwordHash: string } | undefined)?.passwordHash;
}

/** Cree un compte joueur et son mot de passe ensemble : jamais de compte sans identifiants. */
export function creerJoueur(nom: string, email: string, passwordHash: string): User {
  return enTransaction(() => {
    const { lastInsertRowid } = insertionUser.run(nom, email);
    const id = Number(lastInsertRowid);
    insertionCredential.run(id, passwordHash);
    return trouverUtilisateur(id)!;
  });
}
