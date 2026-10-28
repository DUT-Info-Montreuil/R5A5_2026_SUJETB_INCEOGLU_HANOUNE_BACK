import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../logger';

// Verifie le JWT de l'en-tete "Authorization: Bearer <token>" et remplit req.user
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    logger.warn('Acces refuse : non authentifie', {
      motif: header ? 'format_entete_invalide' : 'entete_absent',
      methode: req.method,
      chemin: req.originalUrl.split('?')[0],
    });
    return res.status(401).json({ message: 'Authentification requise' });
  }

  const token = header.slice('Bearer '.length);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string) as { userId: number; role: string };
    req.user = { userId: payload.userId, role: payload.role };
    next();
  } catch (err) {
    // On journalise le motif, jamais le token lui-meme
    logger.warn('Acces refuse : token rejete', {
      motif: err instanceof jwt.TokenExpiredError ? 'token_expire' : 'token_invalide',
      methode: req.method,
      chemin: req.originalUrl.split('?')[0],
    });
    return res.status(401).json({ message: 'Token invalide ou expire' });
  }
}

// Renvoie un middleware qui exige un role donne
// 401 : non authentifie, 403 : authentifie mais pas le bon role
export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      logger.warn('Acces refuse : non authentifie', {
        motif: 'utilisateur_absent',
        methode: req.method,
        chemin: req.originalUrl.split('?')[0],
      });
      return res.status(401).json({ message: 'Authentification requise' });
    }
    if (req.user.role !== role) {
      logger.warn('Acces refuse : role insuffisant', {
        userId: req.user.userId,
        roleUtilisateur: req.user.role,
        roleRequis: role,
        methode: req.method,
        chemin: req.originalUrl.split('?')[0],
      });
      return res.status(403).json({ message: 'Acces refuse' });
    }
    next();
  };
}
