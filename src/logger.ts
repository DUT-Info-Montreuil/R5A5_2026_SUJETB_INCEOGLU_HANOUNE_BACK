import winston from 'winston';

// Logger applicatif : JSON structure, vers la console et logs/app.log
// Ne jamais y ecrire de mot de passe, hash, jeton JWT ni contenu de message d'equipe
export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/app.log' }),
  ],
});
