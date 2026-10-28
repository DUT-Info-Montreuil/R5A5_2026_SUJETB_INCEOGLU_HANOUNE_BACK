import app from './app';
import { logger } from './logger';

// Sans secret JWT, les jetons seraient signes avec une valeur indefinie :
// on refuse de demarrer plutot que d'exposer une authentification inoperante.
if (!process.env.JWT_SECRET) {
  logger.error('Demarrage impossible : la variable d environnement JWT_SECRET est absente');
  process.exit(1);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => logger.info('Serveur demarre', { port: PORT }));
