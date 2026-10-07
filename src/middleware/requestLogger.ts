import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';

// Routes techniques appelees en boucle (sondes de sante, page Swagger) : les journaliser
// noierait les vraies requetes. Elles ne sont tracees qu'en cas d'erreur serveur.
const CHEMINS_IGNORES = ['/health', '/api-docs'];

function estIgnore(chemin: string): boolean {
  return CHEMINS_IGNORES.some((ignore) => chemin === ignore || chemin.startsWith(`${ignore}/`));
}

// Journalise chaque requete terminee (sans le corps ni les en-tetes)
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const debut = Date.now();

  res.on('finish', () => {
    const statut = res.statusCode;
    const chemin = req.originalUrl.split('?')[0];

    if (estIgnore(chemin) && statut < 500) return;

    const niveau = statut >= 500 ? 'error' : statut >= 400 ? 'warn' : 'info';

    logger.log(niveau, 'Requete HTTP', {
      methode: req.method,
      chemin,
      statut,
      dureeMs: Date.now() - debut,
      userId: req.user?.userId,
    });
  });

  next();
}
