import { Request, Response, NextFunction } from 'express';
import { logger } from '../logger';

// Journalise chaque requete terminee (sans le corps ni les en-tetes)
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const debut = Date.now();

  res.on('finish', () => {
    const statut = res.statusCode;
    const niveau = statut >= 500 ? 'error' : statut >= 400 ? 'warn' : 'info';

    logger.log(niveau, 'Requete HTTP', {
      methode: req.method,
      chemin: req.originalUrl.split('?')[0],
      statut,
      dureeMs: Date.now() - debut,
      userId: req.user?.userId,
    });
  });

  next();
}
