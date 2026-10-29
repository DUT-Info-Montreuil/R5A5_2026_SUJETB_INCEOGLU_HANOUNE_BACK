import { Server } from 'socket.io';
import { matchs, users } from '../models/fakeData';
import { DemandeAdhesion, Equipe, Message, Tournoi } from '../models/types';
import { logger } from '../logger';

// Fonctions d'emission appelees par les routes, APRES que l'API REST a verifie les droits
// et applique la modification. Socket.io ne fait que diffuser : aucune ecriture ne passe par lui.
//
// Tant que Socket.io n'est pas initialise (tests HTTP qui utilisent app sans serveur),
// ces fonctions ne font rien.
let io: Server | null = null;

export function definirServeur(serveur: Server): void {
  io = serveur;
}

// Noms des rooms, partages avec src/realtime/socket.ts
export const roomTournoi = (tournoiId: number) => `tournoi:${tournoiId}`;
export const roomEquipe = (equipeId: number) => `equipe:${equipeId}`;
export const roomUtilisateur = (userId: number) => `utilisateur:${userId}`;

function nomUtilisateur(userId: number): string | null {
  return users.find((u) => u.id === userId)?.nom ?? null;
}

/** Message tel que le client l'affiche : meme forme en REST (GET messages) et en temps reel. */
export function avecNomAuteur(message: Message): Message & { nomAuteur: string | null } {
  return { ...message, nomAuteur: nomUtilisateur(message.userId) };
}

/** B-16 : nouveau message vers les membres connectes de l'equipe. */
export function diffuserMessage(message: Message): void {
  io?.to(roomEquipe(message.equipeId)).emit('message:nouveau', avecNomAuteur(message));
}

/** Composition, nom, roles ou capitaine modifies : l'equipe et la page du tournoi sont a jour (B-19). */
export function diffuserEquipe(equipe: Equipe): void {
  io?.to([roomEquipe(equipe.id), roomTournoi(equipe.tournoiId)]).emit('equipe:maj', equipe);
}

/** B-06 : le capitaine est prevenu d'une demande d'adhesion. */
export function diffuserNouvelleDemande(demande: DemandeAdhesion, capitaineId: number): void {
  io?.to(roomUtilisateur(capitaineId)).emit('demande:nouvelle', {
    ...demande,
    nomJoueur: nomUtilisateur(demande.userId),
  });
}

/**
 * B-06 : l'auteur de la demande apprend qu'elle est acceptee, refusee ou annulee.
 * capitaineId est fourni quand la demande est annulee (par son auteur ou automatiquement, B-07) :
 * le capitaine n'en est pas a l'origine et doit voir sa liste de demandes a jour.
 */
export function diffuserDemande(demande: DemandeAdhesion, capitaineId?: number): void {
  const rooms = [roomUtilisateur(demande.userId)];
  if (capitaineId !== undefined) rooms.push(roomUtilisateur(capitaineId));
  io?.to(rooms).emit('demande:maj', demande);
}

/**
 * B-17 : le joueur exclu (ou qui quitte l'equipe) perd immediatement l'acces a l'espace
 * d'echange : tous ses sockets, sur tous ses appareils, sortent de la room de l'equipe.
 * Le prochain message:nouveau ne lui parvient donc plus.
 */
export function exclureDeLEquipe(equipeId: number, userId: number, motif: 'exclusion' | 'depart'): void {
  if (!io) return;
  io.to(roomUtilisateur(userId)).emit('equipe:exclu', { equipeId, motif });
  io.in(roomUtilisateur(userId)).socketsLeave(roomEquipe(equipeId));
  logger.info('Temps reel : sockets retires de la room equipe', { equipeId, userId, motif });
}

/**
 * B-18 : equipe eliminee. Les membres recoivent une derniere fois l'equipe (eliminee: true)
 * puis sortent de la room ; seuls les administrateurs y restent pour consulter l'espace.
 */
export function fermerEspaceEquipe(equipe: Equipe): void {
  if (!io) return;
  diffuserEquipe(equipe);

  const room = roomEquipe(equipe.id);
  // Parcours synchrone (adaptateur en memoire) : personne ne peut recevoir un evenement
  // de la room entre l'elimination et le retrait.
  const socketIds = io.sockets.adapter.rooms.get(room) ?? new Set<string>();
  for (const socketId of [...socketIds]) {
    const socket = io.sockets.sockets.get(socketId);
    if (socket && socket.data.user?.role !== 'administrateur') socket.leave(room);
  }
  logger.info('Temps reel : espace d equipe ferme', { equipeId: equipe.id, motif: 'equipe_eliminee' });
}

/** B-19 : changement d'etat du tournoi (cloture, lancement, fin). */
export function diffuserTournoi(tournoi: Tournoi): void {
  io?.to(roomTournoi(tournoi.id)).emit('tournoi:maj', tournoi);
}

/**
 * B-19 : l'arbre complet du tournoi. Appele une seule fois par requete, apres toute la
 * cascade (resultat, forfait, qualifications d'office) : le client recoit un etat coherent.
 */
export function diffuserMatchs(tournoiId: number): void {
  io?.to(roomTournoi(tournoiId)).emit(
    'tournoi:matchs',
    matchs.filter((m) => m.tournoiId === tournoiId)
  );
}
