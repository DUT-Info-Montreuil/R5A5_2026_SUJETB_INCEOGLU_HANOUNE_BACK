import dotenv from 'dotenv';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

// Ce module est importe avant que app.ts n'appelle dotenv.config() : sans ce chargement,
// LOG_LEVEL ecrit dans le fichier .env serait ignore a la creation du logger.
dotenv.config({ quiet: true });

const NIVEAU_PAR_DEFAUT = 'info';
const NIVEAUX_VALIDES = Object.keys(winston.config.npm.levels);

/** Niveau de log demande par LOG_LEVEL, ou 'info' si absent ou inconnu. */
export function resoudreNiveau(valeur: string | undefined): string {
  const niveau = valeur?.trim().toLowerCase();
  return niveau && NIVEAUX_VALIDES.includes(niveau) ? niveau : NIVEAU_PAR_DEFAUT;
}

const transports: winston.transport[] = [new winston.transports.Console()];

// Pas de fichier pendant les tests : on ne pollue pas logs/ avec des fichiers de test
if (process.env.NODE_ENV !== 'test') {
  transports.push(
    // Un fichier par jour, compresse une fois archive. Sans rotation, un fichier unique
    // grossit sans limite et finit par remplir le disque du serveur.
    new DailyRotateFile({
      dirname: 'logs',
      filename: 'app-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
    })
  );
}

// Logger applicatif : JSON structure, vers la console et logs/app-AAAA-MM-JJ.log
// Ne jamais y ecrire de mot de passe, hash, jeton JWT ni contenu de message d'equipe
export const logger = winston.createLogger({
  level: resoudreNiveau(process.env.LOG_LEVEL),
  // Pendant les tests, on ne pollue pas la sortie de jest
  silent: process.env.NODE_ENV === 'test',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports,
});

// Une faute de frappe dans LOG_LEVEL ne doit pas passer inapercue
if (process.env.LOG_LEVEL && resoudreNiveau(process.env.LOG_LEVEL) !== process.env.LOG_LEVEL.trim().toLowerCase()) {
  logger.warn('LOG_LEVEL inconnu, niveau par defaut utilise', {
    valeur: process.env.LOG_LEVEL,
    niveau: NIVEAU_PAR_DEFAUT,
    niveauxValides: NIVEAUX_VALIDES,
  });
}
