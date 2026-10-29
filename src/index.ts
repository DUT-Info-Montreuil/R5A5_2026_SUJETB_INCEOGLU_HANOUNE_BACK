import http from 'http';
import app from './app';
import { logger } from './logger';
import { initialiserTempsReel } from './realtime/socket';

// Sans secret JWT, les jetons seraient signes avec une valeur indefinie :
// on refuse de demarrer plutot que d'exposer une authentification inoperante.
if (!process.env.JWT_SECRET) {
  logger.error('Demarrage impossible : la variable d environnement JWT_SECRET est absente');
  process.exit(1);
}

// Express et Socket.io partagent le meme serveur HTTP, donc le meme port
const serveur = http.createServer(app);
initialiserTempsReel(serveur);

const PORT = process.env.PORT || 3000;
serveur.listen(PORT, () => logger.info('Serveur demarre', { port: PORT }));
