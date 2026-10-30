import { Request, Response } from 'express';
import { logger } from './logger';

// Regle de journalisation : tout refus 401/403/409/429 laisse une ligne warn.
// 401 et 403 de role : middleware/auth.ts. 401 de connexion : routes/auth.routes.ts.
// 429 : middleware/limiteur.ts, branche sur POST /api/auth/login.
// 403 de droits et 409 des routes : les deux fonctions ci-dessous.

// Ids metier concernes par le refus (equipeId, tournoiId, matchId, demandeId...)
type Ids = Record<string, number | undefined>;

function contexte(req: Request) {
  return {
    userId: req.user?.userId,
    methode: req.method,
    chemin: req.originalUrl.split('?')[0],
  };
}

// Authentifie mais pas autorise sur cette ressource : journalise puis repond 403
export function refuser(req: Request, res: Response, ids: Ids, action: string) {
  logger.warn('Acces refuse : droits insuffisants', { ...contexte(req), ...ids, action });
  return res.status(403).json({ message: 'Acces refuse' });
}

// Requete valide mais incompatible avec l'etat actuel : journalise puis repond 409.
// motif : code stable pour les logs ; message : texte destine au client.
export function refuserConflit(req: Request, res: Response, ids: Ids, motif: string, message: string) {
  logger.warn('Requete refusee : etat incompatible', { ...contexte(req), ...ids, motif });
  return res.status(409).json({ message });
}
