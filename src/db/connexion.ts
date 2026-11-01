import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import { logger } from '../logger';
import { insererDonneesDeDemonstration } from './seed';

// Connexion unique a la base SQLite (fiche de decision 03), ouverte au premier import.
// better-sqlite3 est synchrone : les routes et services restent synchrones.
//
// DB_PATH : chemin du fichier, relatif au dossier de lancement, ou ':memory:'.
// Par defaut data/tournois.db a la racine du projet. Les tests (tests/setupEnv.ts) imposent
// ':memory:' : jest donnant a chaque fichier de test son propre registre de modules,
// chaque fichier a sa propre base, vide puis remplie du jeu de demonstration.

// Ce module peut etre importe avant app.ts (qui charge aussi .env) : DB_PATH doit etre connu ici
dotenv.config({ quiet: true });

const CHEMIN_PAR_DEFAUT = path.join(__dirname, '..', '..', 'data', 'tournois.db');

function cheminDeLaBase(): string {
  const configure = process.env.DB_PATH?.trim();
  if (configure === ':memory:') return configure;
  return configure ? path.resolve(configure) : CHEMIN_PAR_DEFAUT;
}

function ouvrir(): Database.Database {
  const chemin = cheminDeLaBase();
  if (chemin !== ':memory:') fs.mkdirSync(path.dirname(chemin), { recursive: true });

  const base = new Database(chemin);
  // SQLite ne verifie les cles etrangeres que si on le demande, a chaque connexion
  base.pragma('foreign_keys = ON');

  // Le schema est idempotent (IF NOT EXISTS) : sans effet sur une base deja creee
  base.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));

  const { nombre } = base.prepare('SELECT COUNT(*) AS nombre FROM users').get() as { nombre: number };
  if (nombre === 0) {
    insererDonneesDeDemonstration(base);
    if (chemin !== ':memory:') logger.info('Base de donnees initialisee avec le jeu de demonstration', { chemin });
  } else {
    logger.info('Base de donnees ouverte', { chemin });
  }

  return base;
}

export const db = ouvrir();

/**
 * Execute fn dans une transaction : toutes ses ecritures sont appliquees, ou aucune si
 * elle leve une exception. Appelee a l'interieur d'une autre transaction, elle devient un
 * point de sauvegarde (savepoint) de celle-ci.
 */
export function enTransaction<T>(fn: () => T): T {
  return db.transaction(fn)();
}
