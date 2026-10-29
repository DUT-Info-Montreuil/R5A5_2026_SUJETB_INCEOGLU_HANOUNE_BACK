import http from 'http';
import { AddressInfo } from 'net';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import app from '../src/app';
import { initialiserTempsReel } from '../src/realtime/socket';
import {
  COMPTES,
  cloturerInscriptions,
  connexion,
  creerEquipe,
  creerTournoi,
  creerTournoiAHuitEquipes,
  deposerDemande,
  lancerTournoi,
  match,
  prechargerVivier,
  rejoindreEquipe,
} from './helpers';

// Securite du temps reel : Socket.io ne fait que diffuser, et les rooms d'equipe
// obeissent aux memes regles que l'espace d'echange REST (B-16, B-17, B-18).
// Un vrai serveur ecoute sur un port libre ; les donnees sont construites via l'API.

// Delai laisse a un evenement pour arriver avant de conclure qu'il n'arrivera pas
const DELAI_ABSENCE_MS = 300;

let io: Server;
let url: string;
const clients: ClientSocket[] = [];

beforeAll(async () => {
  const serveur = http.createServer(app);
  io = initialiserTempsReel(serveur);
  await new Promise<void>((resolve) => serveur.listen(0, resolve));
  url = `http://localhost:${(serveur.address() as AddressInfo).port}`;
});

afterAll(async () => {
  clients.forEach((client) => client.disconnect());
  // Ferme aussi le serveur HTTP sous-jacent
  await new Promise<void>((resolve) => io.close(() => resolve()));
});

// Connexion d'un client ; sans jeton, le client est un visiteur
function connecter(jeton?: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const client = ioClient(url, {
      auth: jeton === undefined ? {} : { token: jeton },
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
    });
    clients.push(client);
    client.once('connect', () => resolve(client));
    client.once('connect_error', reject);
  });
}

type Ack = { ok: boolean; message?: string };

function rejoindre(client: ClientSocket, evenement: string, payload: object): Promise<Ack> {
  return client.timeout(2000).emitWithAck(evenement, payload);
}

// Enregistre tout ce que le client recoit pour un evenement donne
function ecouter<T = unknown>(client: ClientSocket, evenement: string): T[] {
  const recus: T[] = [];
  client.on(evenement, (payload: T) => recus.push(payload));
  return recus;
}

function attendre<T = unknown>(client: ClientSocket, evenement: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const minuteur = setTimeout(() => reject(new Error(`${evenement} non recu`)), 2000);
    client.once(evenement, (payload: T) => {
      clearTimeout(minuteur);
      resolve(payload);
    });
  });
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Etat cote serveur : ids des sockets presents dans une room
async function socketsDeLaRoom(room: string): Promise<string[]> {
  return (await io.in(room).fetchSockets()).map((s) => s.id);
}

async function envoyerMessage(jeton: string, equipeId: number, contenu: string): Promise<void> {
  const reponse = await request(app)
    .post(`/api/equipes/${equipeId}/messages`)
    .set('Authorization', `Bearer ${jeton}`)
    .send({ contenu });
  expect(reponse.status).toBe(201);
}

describe('Temps reel', () => {
  let jetonAdmin: string;
  let jetonCapitaine: string; // Zeki
  let jetonMembre: string; // Hanoune
  let jetonSansEquipe: string; // Sami
  let jetonLea: string;

  beforeAll(async () => {
    jetonAdmin = await connexion(COMPTES.admin);
    jetonCapitaine = await connexion(COMPTES.zeki);
    jetonMembre = await connexion(COMPTES.hanoune);
    jetonSansEquipe = await connexion(COMPTES.sami);
    jetonLea = await connexion(COMPTES.lea);
    // Plus gros besoin : tournoi a quatre equipes completes, Lea fournie (voir plus bas)
    await prechargerVivier(19);
  });

  // Equipe Zeki (capitaine) + Hanoune, sur un tournoi neuf
  async function equipeDeTest(nom: string): Promise<number> {
    const tournoiId = await creerTournoi(jetonAdmin, `Tournoi de test - ${nom}`);
    const equipeId = await creerEquipe(jetonCapitaine, tournoiId, nom);
    await rejoindreEquipe(jetonMembre, jetonCapitaine, equipeId);
    return equipeId;
  }

  describe('handshake', () => {
    it('refuse la connexion avec un token invalide (connect_error)', async () => {
      await expect(connecter('jeton-invalide')).rejects.toThrow('Token invalide ou expire');
    });

    it('refuse la connexion avec un token expire (connect_error)', async () => {
      const expire = jwt.sign({ userId: 2, role: 'joueur' }, process.env.JWT_SECRET as string, { expiresIn: -10 });
      await expect(connecter(expire)).rejects.toThrow('Token invalide ou expire');
    });

    it('accepte un visiteur sans token', async () => {
      const visiteur = await connecter();
      expect(visiteur.connected).toBe(true);
    });
  });

  describe("rooms d'equipe (B-16)", () => {
    it("refuse un visiteur dans la room d'une equipe, qui ne recoit donc pas les messages", async () => {
      const equipeId = await equipeDeTest('Equipe visiteur');
      const visiteur = await connecter();
      const membre = await connecter(jetonMembre);
      await rejoindre(membre, 'equipe:rejoindre', { equipeId });

      const ack = await rejoindre(visiteur, 'equipe:rejoindre', { equipeId });
      expect(ack).toEqual({ ok: false, message: 'Authentification requise' });

      // Etat inchange : le visiteur n'est pas dans la room
      const recusVisiteur = ecouter(visiteur, 'message:nouveau');
      const recuMembre = attendre(membre, 'message:nouveau');
      await envoyerMessage(jetonCapitaine, equipeId, 'Strategie secrete');
      await recuMembre;
      await pause(DELAI_ABSENCE_MS);
      expect(recusVisiteur).toHaveLength(0);
      expect(await socketsDeLaRoom(`equipe:${equipeId}`)).not.toContain(visiteur.id);
    });

    it("refuse un joueur non membre dans la room de l'equipe, qui ne recoit donc pas les messages", async () => {
      const equipeId = await equipeDeTest('Equipe non membre');
      const intrus = await connecter(jetonSansEquipe);
      const membre = await connecter(jetonMembre);
      await rejoindre(membre, 'equipe:rejoindre', { equipeId });

      const ack = await rejoindre(intrus, 'equipe:rejoindre', { equipeId });
      expect(ack).toEqual({ ok: false, message: 'Acces refuse' });

      const recusIntrus = ecouter(intrus, 'message:nouveau');
      const recuMembre = attendre(membre, 'message:nouveau');
      await envoyerMessage(jetonCapitaine, equipeId, 'Strategie secrete');
      await recuMembre;
      await pause(DELAI_ABSENCE_MS);
      expect(recusIntrus).toHaveLength(0);
      expect(await socketsDeLaRoom(`equipe:${equipeId}`)).not.toContain(intrus.id);
    });

    it("refuse la room a une socket dont le jeton a expire depuis la connexion, et la deconnecte", async () => {
      const equipeId = await equipeDeTest('Equipe jeton expire');
      // Jeton de Hanoune (membre) valide une seconde : accepte au handshake, expire ensuite
      const courtTerme = jwt.sign({ userId: 3, role: 'joueur' }, process.env.JWT_SECRET as string, { expiresIn: 1 });
      const membre = await connecter(courtTerme);
      await pause(1100);

      const deconnexion = attendre(membre, 'disconnect');
      const ack = await rejoindre(membre, 'equipe:rejoindre', { equipeId });
      expect(ack).toEqual({ ok: false, message: 'Token invalide ou expire' });
      await deconnexion;
      expect(await socketsDeLaRoom(`equipe:${equipeId}`)).not.toContain(membre.id);
    });

    it('un membre recoit message:nouveau avec le nom de l auteur', async () => {
      const equipeId = await equipeDeTest('Equipe messages');
      const membre = await connecter(jetonMembre);
      expect(await rejoindre(membre, 'equipe:rejoindre', { equipeId })).toEqual({ ok: true });

      const recu = attendre<{ equipeId: number; contenu: string; nomAuteur: string }>(membre, 'message:nouveau');
      await envoyerMessage(jetonCapitaine, equipeId, 'On se retrouve a 18h');

      expect(await recu).toMatchObject({ equipeId, contenu: 'On se retrouve a 18h', userId: 2, nomAuteur: 'Zeki' });
    });
  });

  describe("demandes d'adhesion (B-06)", () => {
    it('seul le capitaine recoit demande:nouvelle, seul l auteur recoit demande:maj', async () => {
      const equipeId = await equipeDeTest('Equipe demandes temps reel');
      const capitaine = await connecter(jetonCapitaine);
      const membre = await connecter(jetonMembre);
      const demandeur = await connecter(jetonSansEquipe);

      const nouvellesMembre = ecouter(membre, 'demande:nouvelle');
      const nouvellesDemandeur = ecouter(demandeur, 'demande:nouvelle');
      const majCapitaine = ecouter(capitaine, 'demande:maj');
      const majMembre = ecouter(membre, 'demande:maj');

      const nouvelle = attendre<{ id: number; nomJoueur: string }>(capitaine, 'demande:nouvelle');
      const demandeId = await deposerDemande(jetonSansEquipe, equipeId);
      expect(await nouvelle).toMatchObject({ id: demandeId, equipeId, userId: 5, nomJoueur: 'Sami' });

      const maj = attendre(demandeur, 'demande:maj');
      const refus = await request(app)
        .patch(`/api/equipes/${equipeId}/demandes/${demandeId}`)
        .set('Authorization', `Bearer ${jetonCapitaine}`)
        .send({ decision: 'refusee' });
      expect(refus.status).toBe(200);
      expect(await maj).toMatchObject({ id: demandeId, statut: 'refusee' });

      await pause(DELAI_ABSENCE_MS);
      expect(nouvellesMembre).toHaveLength(0);
      expect(nouvellesDemandeur).toHaveLength(0);
      expect(majCapitaine).toHaveLength(0);
      expect(majMembre).toHaveLength(0);
    });
  });

  describe('exclusion (B-17)', () => {
    it("l'exclu sort immediatement de la room et ne recoit plus message:nouveau", async () => {
      const equipeId = await equipeDeTest('Equipe exclusion temps reel');
      const capitaine = await connecter(jetonCapitaine);
      const exclu = await connecter(jetonMembre);
      await rejoindre(capitaine, 'equipe:rejoindre', { equipeId });
      expect(await rejoindre(exclu, 'equipe:rejoindre', { equipeId })).toEqual({ ok: true });

      const notification = attendre<{ equipeId: number; motif: string }>(exclu, 'equipe:exclu');
      const exclusion = await request(app)
        .delete(`/api/equipes/${equipeId}/membres/3`)
        .set('Authorization', `Bearer ${jetonCapitaine}`);
      expect(exclusion.status).toBe(204);
      expect(await notification).toEqual({ equipeId, motif: 'exclusion' });

      // Le capitaine sert de temoin : le message est bien diffuse, mais pas a l'exclu
      const recusExclu = ecouter(exclu, 'message:nouveau');
      const recuCapitaine = attendre(capitaine, 'message:nouveau');
      await envoyerMessage(jetonCapitaine, equipeId, 'Message apres exclusion');
      await recuCapitaine;
      await pause(DELAI_ABSENCE_MS);
      expect(recusExclu).toHaveLength(0);

      // Il ne peut pas non plus revenir dans la room
      expect(await rejoindre(exclu, 'equipe:rejoindre', { equipeId })).toEqual({ ok: false, message: 'Acces refuse' });
    });

    it("un joueur qui quitte l'equipe sort aussi de la room", async () => {
      const equipeId = await equipeDeTest('Equipe depart temps reel');
      const partant = await connecter(jetonMembre);
      await rejoindre(partant, 'equipe:rejoindre', { equipeId });

      const notification = attendre(partant, 'equipe:exclu');
      const depart = await request(app)
        .delete(`/api/equipes/${equipeId}/membres/3`)
        .set('Authorization', `Bearer ${jetonMembre}`);
      expect(depart.status).toBe(204);

      expect(await notification).toEqual({ equipeId, motif: 'depart' });
      expect(await socketsDeLaRoom(`equipe:${equipeId}`)).not.toContain(partant.id);
    });
  });

  describe('equipe eliminee (B-18)', () => {
    let equipeElimineeId: number;
    let matchsRecus: unknown[];
    let tournoisRecus: unknown[];

    beforeAll(async () => {
      // L'equipe de Lea est incomplete : forfait au premier match, donc eliminee (B-04)
      const { tournoiId, equipeIds } = await creerTournoiAHuitEquipes(jetonAdmin, {
        nom: 'Tournoi de test - temps reel elimination',
        effectifs: [1, 5, 1, 1, 1, 1, 1, 1],
        jetonsPremiereEquipe: [jetonLea],
      });
      equipeElimineeId = equipeIds[0];
      await cloturerInscriptions(jetonAdmin, tournoiId);

      // Spectateur abonne avant le lancement : les forfaits B-04 declenchent des doubles
      // forfaits et des qualifications d'office en cascade
      const visiteur = await connecter();
      await rejoindre(visiteur, 'tournoi:rejoindre', { tournoiId });
      matchsRecus = ecouter(visiteur, 'tournoi:matchs');
      tournoisRecus = ecouter(visiteur, 'tournoi:maj');

      await lancerTournoi(jetonAdmin, tournoiId);
      await pause(DELAI_ABSENCE_MS);
    });

    it('B-19 : une cascade de forfaits au lancement ne donne qu une seule diffusion de l arbre', () => {
      expect(matchsRecus).toHaveLength(1);
      expect(tournoisRecus).toHaveLength(1);
    });

    it("refuse a un membre la room d'une equipe eliminee", async () => {
      const lea = await connecter(jetonLea);
      const ack = await rejoindre(lea, 'equipe:rejoindre', { equipeId: equipeElimineeId });

      expect(ack).toEqual({ ok: false, message: 'Espace ferme, equipe eliminee' });
      expect(await socketsDeLaRoom(`equipe:${equipeElimineeId}`)).not.toContain(lea.id);
    });

    it("accepte l'administrateur dans la room d'une equipe eliminee", async () => {
      const admin = await connecter(jetonAdmin);
      expect(await rejoindre(admin, 'equipe:rejoindre', { equipeId: equipeElimineeId })).toEqual({ ok: true });
    });
  });

  describe('avancement du tournoi (B-18, B-19)', () => {
    let tournoiId: number;
    let equipeLeaId: number;

    beforeAll(async () => {
      // Quatre equipes completes : les deux premiers matchs sont jouables apres le lancement
      const tournoi = await creerTournoiAHuitEquipes(jetonAdmin, {
        nom: 'Tournoi de test - temps reel avancement',
        effectifs: [5, 5, 5, 5, 1, 1, 1, 1],
        jetonsPremiereEquipe: [jetonLea],
      });
      tournoiId = tournoi.tournoiId;
      equipeLeaId = tournoi.equipeIds[0];
      await cloturerInscriptions(jetonAdmin, tournoiId);
      await lancerTournoi(jetonAdmin, tournoiId);
    });

    it('un visiteur recoit tournoi:matchs une seule fois apres un resultat', async () => {
      const visiteur = await connecter();
      expect(await rejoindre(visiteur, 'tournoi:rejoindre', { tournoiId })).toEqual({ ok: true });
      const recus = ecouter<{ id: number; vainqueurId: number | null }[]>(visiteur, 'tournoi:matchs');

      const deuxieme = await match(tournoiId, 1, 2);
      const reponse = await request(app)
        .patch(`/api/matchs/${deuxieme.id}/resultat`)
        .set('Authorization', `Bearer ${jetonAdmin}`)
        .send({ vainqueurId: deuxieme.equipe1Id });
      expect(reponse.status).toBe(200);

      await pause(DELAI_ABSENCE_MS);
      expect(recus).toHaveLength(1);
      expect(recus[0].find((m) => m.id === deuxieme.id)?.vainqueurId).toBe(deuxieme.equipe1Id);
    });

    it("a l'elimination, les membres sortent de la room de l'equipe, l'administrateur y reste", async () => {
      const lea = await connecter(jetonLea);
      const admin = await connecter(jetonAdmin);
      expect(await rejoindre(lea, 'equipe:rejoindre', { equipeId: equipeLeaId })).toEqual({ ok: true });
      expect(await rejoindre(admin, 'equipe:rejoindre', { equipeId: equipeLeaId })).toEqual({ ok: true });

      const derniereMaj = attendre<{ id: number; eliminee: boolean }>(lea, 'equipe:maj');
      const premier = await match(tournoiId, 1, 1);
      const reponse = await request(app)
        .patch(`/api/matchs/${premier.id}/resultat`)
        .set('Authorization', `Bearer ${jetonAdmin}`)
        .send({ vainqueurId: premier.equipe2Id });
      expect(reponse.status).toBe(200);

      expect(await derniereMaj).toMatchObject({ id: equipeLeaId, eliminee: true });
      const presents = await socketsDeLaRoom(`equipe:${equipeLeaId}`);
      expect(presents).not.toContain(lea.id);
      expect(presents).toContain(admin.id);
    });
  });
});
