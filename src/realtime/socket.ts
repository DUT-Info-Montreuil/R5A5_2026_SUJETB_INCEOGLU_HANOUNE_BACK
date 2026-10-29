import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { equipes, tournois } from '../models/fakeData';
import { logger } from '../logger';
import { definirServeur, roomEquipe, roomTournoi, roomUtilisateur } from './diffusion';

// Le client ne peut QUE rejoindre ou quitter des rooms : toute ecriture passe par l'API REST,
// dont les controles d'acces restent la seule porte d'entree.

type Ack = (reponse: { ok: true } | { ok: false; message: string }) => void;

// exp : expiration du JWT (secondes), pour ne pas laisser vivre une socket au-dela de son jeton
type UtilisateurSocket = { userId: number; role: string; exp: number };

// L'ack est optionnel cote client : on ne l'appelle que s'il a ete fourni
function repondre(ack: unknown, reponse: Parameters<Ack>[0]): void {
  if (typeof ack === 'function') (ack as Ack)(reponse);
}

function identifiant(payload: unknown, champ: 'tournoiId' | 'equipeId'): number | null {
  const valeur = Number((payload as Record<string, unknown> | null)?.[champ]);
  return Number.isInteger(valeur) && valeur > 0 ? valeur : null;
}

function refuserRoom(socket: Socket, ack: unknown, equipeId: number | null, motif: string, message: string) {
  logger.warn('Temps reel : acces a la room refuse', {
    socketId: socket.id,
    userId: socket.data.user?.userId ?? 'visiteur',
    equipeId,
    motif,
  });
  repondre(ack, { ok: false, message });
}

export function initialiserTempsReel(httpServer: HttpServer): Server {
  // Meme origine autorisee que l'API Express
  const io = new Server(httpServer, { cors: { origin: process.env.FRONT_URL } });

  // Handshake : sans token, visiteur (rooms tournoi seulement) ; token invalide, connexion refusee
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (token === undefined || token === null) return next();

    try {
      const payload = jwt.verify(String(token), process.env.JWT_SECRET as string) as UtilisateurSocket;
      socket.data.user = { userId: payload.userId, role: payload.role, exp: payload.exp };
      next();
    } catch (err) {
      // On journalise le motif, jamais le token lui-meme
      logger.warn('Temps reel : connexion refusee', {
        socketId: socket.id,
        motif: err instanceof jwt.TokenExpiredError ? 'token_expire' : 'token_invalide',
      });
      next(new Error('Token invalide ou expire'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.data.user as UtilisateurSocket | undefined;
    logger.info('Temps reel : connexion', { socketId: socket.id, userId: user?.userId ?? 'visiteur' });

    // Room personnelle : demandes d'adhesion, exclusion (B-06, B-17)
    if (user) socket.join(roomUtilisateur(user.userId));

    // B-19 : suivre un tournoi est public
    socket.on('tournoi:rejoindre', (payload, ack) => {
      const tournoiId = identifiant(payload, 'tournoiId');
      if (!tournoiId) return repondre(ack, { ok: false, message: 'tournoiId invalide' });
      if (!tournois.some((t) => t.id === tournoiId)) {
        return repondre(ack, { ok: false, message: 'Tournoi introuvable' });
      }

      socket.join(roomTournoi(tournoiId));
      logger.info('Temps reel : room rejointe', { socketId: socket.id, userId: user?.userId ?? 'visiteur', tournoiId });
      repondre(ack, { ok: true });
    });

    socket.on('tournoi:quitter', (payload, ack) => {
      const tournoiId = identifiant(payload, 'tournoiId');
      if (!tournoiId) return repondre(ack, { ok: false, message: 'tournoiId invalide' });
      socket.leave(roomTournoi(tournoiId));
      logger.info('Temps reel : room quittee', { socketId: socket.id, userId: user?.userId ?? 'visiteur', tournoiId });
      repondre(ack, { ok: true });
    });

    // B-16 / B-18 : memes regles que GET /api/equipes/:id/messages
    socket.on('equipe:rejoindre', (payload, ack) => {
      // Controle d'acces d'abord : l'id n'est lu que pour la journalisation du refus
      if (!user) {
        return refuserRoom(socket, ack, identifiant(payload, 'equipeId'), 'non_authentifie', 'Authentification requise');
      }

      // Le jeton n'est verifie qu'au handshake : une socket ouverte plus longtemps que lui
      // ne doit pas garder l'acces que le REST refuserait deja (401). jsonwebtoken considere
      // le jeton expire des que l'instant atteint exp.
      if (Date.now() / 1000 >= user.exp) {
        refuserRoom(socket, ack, identifiant(payload, 'equipeId'), 'token_expire', 'Token invalide ou expire');
        return socket.disconnect(true);
      }

      const equipeId = identifiant(payload, 'equipeId');
      if (!equipeId) return repondre(ack, { ok: false, message: 'equipeId invalide' });

      const equipe = equipes.find((e) => e.id === equipeId);
      if (!equipe) return repondre(ack, { ok: false, message: 'Equipe introuvable' });

      // l administrateur peut toujours consulter, meme apres elimination (B-18)
      if (user.role !== 'administrateur') {
        // B-16 : membres uniquement. Teste avant l'elimination, pour ne pas reveler
        // l'elimination d'une equipe a quelqu un qui n'y a pas sa place.
        // B-17 : un exclu n'est plus dans membres, il ne peut donc pas revenir.
        const estMembre = equipe.membres.some((m) => m.userId === user.userId);
        if (!estMembre) return refuserRoom(socket, ack, equipeId, 'non_membre', 'Acces refuse');

        // B-18 : espace ferme pour les membres d'une equipe eliminee
        if (equipe.eliminee) {
          return refuserRoom(socket, ack, equipeId, 'equipe_eliminee', 'Espace ferme, equipe eliminee');
        }
      }

      socket.join(roomEquipe(equipeId));
      logger.info('Temps reel : room rejointe', { socketId: socket.id, userId: user.userId, equipeId });
      repondre(ack, { ok: true });
    });

    socket.on('equipe:quitter', (payload, ack) => {
      const equipeId = identifiant(payload, 'equipeId');
      if (!equipeId) return repondre(ack, { ok: false, message: 'equipeId invalide' });
      socket.leave(roomEquipe(equipeId));
      logger.info('Temps reel : room quittee', { socketId: socket.id, userId: user?.userId ?? 'visiteur', equipeId });
      repondre(ack, { ok: true });
    });

    socket.on('disconnect', (raison) => {
      logger.info('Temps reel : deconnexion', { socketId: socket.id, userId: user?.userId ?? 'visiteur', raison });
    });
  });

  definirServeur(io);
  return io;
}
