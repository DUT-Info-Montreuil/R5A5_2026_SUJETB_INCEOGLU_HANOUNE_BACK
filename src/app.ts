import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './swagger';
import tournoisRoutes from './routes/tournoi.routes';
import equipesRoutes from './routes/equipes.routes';
import matchsRoutes from './routes/match.routes';
import authRoutes from './routes/auth.routes';
import { requestLogger } from './middleware/requestLogger';
import { logger } from './logger';

dotenv.config();

const app = express();
// Seul le front declare dans FRONT_URL est autorise a appeler l'API depuis un navigateur
app.use(cors({ origin: process.env.FRONT_URL }));
app.use(requestLogger);
app.use(express.json());

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/tournois', tournoisRoutes);
app.use('/api/equipes', equipesRoutes);
app.use('/api/matchs', matchsRoutes);

// Gestion des erreurs non traitees : on journalise le detail, le client ne recoit qu'un message generique
app.use((err: Error & { status?: number }, req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) return next(err);

  // Erreur client (ex. JSON mal forme) : le message peut contenir un extrait du corps
  // (donc un mot de passe), on ne le journalise pas. Le requestLogger trace deja le 4xx.
  if (err.status && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ message: 'Requete invalide' });
  }

  logger.error('Erreur non geree', {
    erreur: err.message,
    stack: err.stack,
    methode: req.method,
    chemin: req.originalUrl.split('?')[0],
    userId: req.user?.userId,
  });
  res.status(500).json({ message: 'Erreur interne du serveur' });
});

export default app;
