import rateLimit from 'express-rate-limit';
import { logger } from '../logger';

// Limite les connexions echouees par IP, contre le test de mots de passe en rafale.
// Les connexions reussies ne comptent pas : plusieurs joueurs derriere une meme IP
// (NAT du reseau de l'IUT) ne se bloquent pas entre eux.
// Pendant les tests, la suite se connecte des centaines de fois depuis la meme IP : la limite
// y est tres haute. LIMITE_CONNEXIONS permet de la fixer, notamment pour tester le refus.
// Lu au chargement du module : .env est deja charge, par l'import du logger ci-dessus
const FENETRE_MS = 10 * 60 * 1000;
const LIMITE_PAR_DEFAUT = process.env.NODE_ENV === 'test' ? 100000 : 10;
const limite = Number(process.env.LIMITE_CONNEXIONS) || LIMITE_PAR_DEFAUT;

export const limiteurConnexion = rateLimit({
  windowMs: FENETRE_MS,
  limit: limite,
  // Seuls les echecs (statut >= 400) sont comptes ; une fois la limite atteinte,
  // meme le bon mot de passe est refuse jusqu'a la fin de la fenetre
  skipSuccessfulRequests: true,
  // En-tetes RateLimit-* standard, sans les anciens X-RateLimit-*
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res) => {
    // Ni l'email ni le mot de passe tentes : seulement de quoi reperer la rafale
    logger.warn('Acces refuse : trop de tentatives de connexion', {
      motif: 'limite_connexions',
      ip: req.ip,
      methode: req.method,
      chemin: req.originalUrl.split('?')[0],
    });
    res.status(429).json({ message: 'Trop de tentatives de connexion, reessayez plus tard' });
  },
});
