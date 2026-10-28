import request from 'supertest';
import app from '../src/app';
import {
  COMPTES,
  cloturerInscriptions,
  connexion,
  creerEquipe,
  creerTournoi,
  creerTournoiAHuitEquipes,
  deposerDemande,
  prechargerVivier,
  rejoindreEquipe,
} from './helpers';

// Securite : tests de REFUS sur les demandes d'adhesion (B-06), puis le cas nominal.
// Chaque test cree son propre tournoi : une demande ou une acceptation ne deborde pas sur les autres.
describe('Demandes d adhesion', () => {
  let jetonAdmin: string;
  let jetonCapitaine: string; // Zeki, capitaine des equipes de test
  let jetonMembre: string; // Hanoune, membre sans galons
  let jetonAutreCapitaine: string; // Lea, capitaine d'une seconde equipe quand il en faut une
  let jetonDemandeur: string; // Sami, joueur qui demande a entrer

  // Ids des comptes de fakeData
  const SAMI = 5;

  beforeAll(async () => {
    jetonAdmin = await connexion(COMPTES.admin);
    jetonCapitaine = await connexion(COMPTES.zeki);
    jetonMembre = await connexion(COMPTES.hanoune);
    jetonAutreCapitaine = await connexion(COMPTES.lea);
    jetonDemandeur = await connexion(COMPTES.sami);

    // Equipe de quatre (Zeki + trois) et sept equipes d'un joueur : dix joueurs du vivier
    await prechargerVivier(10);
  });

  // Tournoi ouvert avec l'equipe de Zeki, dont Hanoune est deja membre
  async function preparerEquipe(nom: string): Promise<{ tournoiId: number; equipeId: number }> {
    const tournoiId = await creerTournoi(jetonAdmin, nom);
    const equipeId = await creerEquipe(jetonCapitaine, tournoiId, `${nom} - equipe`);
    await rejoindreEquipe(jetonMembre, jetonCapitaine, equipeId);
    return { tournoiId, equipeId };
  }

  async function membresDe(equipeId: number): Promise<number[]> {
    const reponse = await request(app).get(`/api/equipes/${equipeId}`);
    return reponse.body.membres.map((m: { userId: number }) => m.userId);
  }

  async function demandesEnAttente(equipeId: number, jetonCapitaineEquipe: string = jetonCapitaine) {
    const reponse = await request(app)
      .get(`/api/equipes/${equipeId}/demandes`)
      .set('Authorization', `Bearer ${jetonCapitaineEquipe}`);
    expect(reponse.status).toBe(200);
    return reponse.body as { id: number; userId: number; statut: string; nomJoueur: string }[];
  }

  // Demandes du porteur du jeton, vues depuis GET /api/auth/me/demandes
  async function mesDemandes(jeton: string) {
    const reponse = await request(app).get('/api/auth/me/demandes').set('Authorization', `Bearer ${jeton}`);
    expect(reponse.status).toBe(200);
    return reponse.body as { id: number; equipeId: number; statut: string; nomEquipe: string; tournoiId: number }[];
  }

  async function statutDe(jeton: string, demandeId: number): Promise<string | undefined> {
    return (await mesDemandes(jeton)).find((d) => d.id === demandeId)?.statut;
  }

  it("B-06/B-10 : un membre non capitaine ne peut ni lister ni accepter les demandes (403)", async () => {
    const { equipeId } = await preparerEquipe('Tournoi de test - demandes membre');
    const demandeId = await deposerDemande(jetonDemandeur, equipeId);

    const liste = await request(app)
      .get(`/api/equipes/${equipeId}/demandes`)
      .set('Authorization', `Bearer ${jetonMembre}`);

    const acceptation = await request(app)
      .patch(`/api/equipes/${equipeId}/demandes/${demandeId}`)
      .set('Authorization', `Bearer ${jetonMembre}`)
      .send({ decision: 'acceptee' });

    expect(liste.status).toBe(403);
    expect(acceptation.status).toBe(403);
    // Le refus n'a rien change : Sami n'est pas entre, sa demande attend toujours
    expect(await membresDe(equipeId)).not.toContain(SAMI);
    expect((await demandesEnAttente(equipeId)).map((d) => d.id)).toEqual([demandeId]);
  });

  it("B-06/B-10 : un joueur etranger a l'equipe ne peut ni lister ni accepter les demandes (403)", async () => {
    const { equipeId } = await preparerEquipe('Tournoi de test - demandes etranger');
    const demandeId = await deposerDemande(jetonDemandeur, equipeId);

    const liste = await request(app)
      .get(`/api/equipes/${equipeId}/demandes`)
      .set('Authorization', `Bearer ${jetonAutreCapitaine}`);

    const acceptation = await request(app)
      .patch(`/api/equipes/${equipeId}/demandes/${demandeId}`)
      .set('Authorization', `Bearer ${jetonAutreCapitaine}`)
      .send({ decision: 'acceptee' });

    // Le demandeur lui-meme ne peut pas s'accepter
    const autoAcceptation = await request(app)
      .patch(`/api/equipes/${equipeId}/demandes/${demandeId}`)
      .set('Authorization', `Bearer ${jetonDemandeur}`)
      .send({ decision: 'acceptee' });

    expect(liste.status).toBe(403);
    expect(acceptation.status).toBe(403);
    expect(autoAcceptation.status).toBe(403);
    expect(await membresDe(equipeId)).not.toContain(SAMI);
  });

  it('B-06/B-10 : un membre non capitaine ne peut pas refuser une demande (403)', async () => {
    const { equipeId } = await preparerEquipe('Tournoi de test - refus par un membre');
    const demandeId = await deposerDemande(jetonDemandeur, equipeId);

    const refus = await request(app)
      .patch(`/api/equipes/${equipeId}/demandes/${demandeId}`)
      .set('Authorization', `Bearer ${jetonMembre}`)
      .send({ decision: 'refusee' });

    expect(refus.status).toBe(403);
    // La demande n'a pas ete refusee : elle attend toujours la decision du capitaine
    expect((await demandesEnAttente(equipeId)).map((d) => d.id)).toEqual([demandeId]);
    expect(await statutDe(jetonDemandeur, demandeId)).toBe('en_attente');
  });

  it('B-06 : une decision autre que acceptee ou refusee est rejetee (400)', async () => {
    const { equipeId } = await preparerEquipe('Tournoi de test - decision invalide');
    const demandeId = await deposerDemande(jetonDemandeur, equipeId);

    const sansDecision = await request(app)
      .patch(`/api/equipes/${equipeId}/demandes/${demandeId}`)
      .set('Authorization', `Bearer ${jetonCapitaine}`)
      .send({});

    const decisionInconnue = await request(app)
      .patch(`/api/equipes/${equipeId}/demandes/${demandeId}`)
      .set('Authorization', `Bearer ${jetonCapitaine}`)
      .send({ decision: 'annulee' });

    expect(sansDecision.status).toBe(400);
    expect(decisionInconnue.status).toBe(400);
    expect(await statutDe(jetonDemandeur, demandeId)).toBe('en_attente');
    expect(await membresDe(equipeId)).not.toContain(SAMI);
  });

  it('B-06 : une demande deja traitee ne peut plus etre annulee par son auteur (409)', async () => {
    const { equipeId } = await preparerEquipe('Tournoi de test - annulation tardive');
    const demandeId = await deposerDemande(jetonDemandeur, equipeId);

    const refus = await request(app)
      .patch(`/api/equipes/${equipeId}/demandes/${demandeId}`)
      .set('Authorization', `Bearer ${jetonCapitaine}`)
      .send({ decision: 'refusee' });
    expect(refus.status).toBe(200);

    const annulation = await request(app)
      .delete(`/api/equipes/${equipeId}/demandes/${demandeId}`)
      .set('Authorization', `Bearer ${jetonDemandeur}`);

    expect(annulation.status).toBe(409);
    // Le refus du capitaine reste inscrit, il n'est pas transforme en annulation
    expect(await statutDe(jetonDemandeur, demandeId)).toBe('refusee');
  });

  it("B-06 : GET /api/auth/me/demandes exige d'etre connecte (401)", async () => {
    const reponse = await request(app).get('/api/auth/me/demandes');

    expect(reponse.status).toBe(401);
  });

  it('B-06 : GET /api/auth/me/demandes ne renvoie que les demandes du joueur connecte', async () => {
    const { tournoiId, equipeId } = await preparerEquipe('Tournoi de test - mes demandes');
    const demandeSami = await deposerDemande(jetonDemandeur, equipeId);
    const demandeLea = await deposerDemande(jetonAutreCapitaine, equipeId);

    const chezSami = await mesDemandes(jetonDemandeur);
    expect(chezSami).toContainEqual(
      expect.objectContaining({
        id: demandeSami,
        equipeId,
        statut: 'en_attente',
        nomEquipe: 'Tournoi de test - mes demandes - equipe',
        tournoiId,
      })
    );
    // Aucune demande d'un autre joueur ne fuit
    expect(chezSami.map((d) => d.id)).not.toContain(demandeLea);
    expect((await mesDemandes(jetonAutreCapitaine)).map((d) => d.id)).not.toContain(demandeSami);
  });

  it("B-06 : on ne peut pas annuler la demande d'un autre joueur, meme capitaine (403)", async () => {
    const { equipeId } = await preparerEquipe('Tournoi de test - annulation');
    const demandeId = await deposerDemande(jetonDemandeur, equipeId);

    const parUnEtranger = await request(app)
      .delete(`/api/equipes/${equipeId}/demandes/${demandeId}`)
      .set('Authorization', `Bearer ${jetonAutreCapitaine}`);

    const parLeCapitaine = await request(app)
      .delete(`/api/equipes/${equipeId}/demandes/${demandeId}`)
      .set('Authorization', `Bearer ${jetonCapitaine}`);

    expect(parUnEtranger.status).toBe(403);
    expect(parLeCapitaine.status).toBe(403);
    expect((await demandesEnAttente(equipeId)).map((d) => d.id)).toEqual([demandeId]);
  });

  it('B-11 : apres cloture, ni demande ni acceptation ne sont possibles (409)', async () => {
    // B-12 : la cloture exige huit equipes engagees
    const { tournoiId, equipeIds } = await creerTournoiAHuitEquipes(jetonAdmin, {
      nom: 'Tournoi de test - demandes apres cloture',
      effectifs: 1,
      jetonsPremiereEquipe: [jetonCapitaine],
    });
    const equipeId = equipeIds[0];
    // Demande deposee pendant les inscriptions, encore en attente a la cloture
    const demandeId = await deposerDemande(jetonDemandeur, equipeId);

    await cloturerInscriptions(jetonAdmin, tournoiId);

    const demande = await request(app)
      .post(`/api/equipes/${equipeId}/demandes`)
      .set('Authorization', `Bearer ${jetonMembre}`)
      .send({});

    const acceptation = await request(app)
      .patch(`/api/equipes/${equipeId}/demandes/${demandeId}`)
      .set('Authorization', `Bearer ${jetonCapitaine}`)
      .send({ decision: 'acceptee' });

    expect(demande.status).toBe(409);
    expect(acceptation.status).toBe(409);
    expect(await membresDe(equipeId)).toEqual([2]);
  });

  it('B-08 : une equipe complete ne recoit plus de demande ni de nouveau membre (409)', async () => {
    const { equipeIds } = await creerTournoiAHuitEquipes(jetonAdmin, {
      nom: 'Tournoi de test - equipe complete',
      effectifs: [4, 1, 1, 1, 1, 1, 1, 1],
      jetonsPremiereEquipe: [jetonCapitaine],
    });
    const equipeId = equipeIds[0];

    // Deux demandes pour une seule place : la premiere acceptee remplit l'equipe
    const demandeSami = await deposerDemande(jetonDemandeur, equipeId);
    const demandeHanoune = await deposerDemande(jetonMembre, equipeId);

    const premiere = await request(app)
      .patch(`/api/equipes/${equipeId}/demandes/${demandeSami}`)
      .set('Authorization', `Bearer ${jetonCapitaine}`)
      .send({ decision: 'acceptee' });
    expect(premiere.status).toBe(200);

    const seconde = await request(app)
      .patch(`/api/equipes/${equipeId}/demandes/${demandeHanoune}`)
      .set('Authorization', `Bearer ${jetonCapitaine}`)
      .send({ decision: 'acceptee' });

    const nouvelleDemande = await request(app)
      .post(`/api/equipes/${equipeId}/demandes`)
      .set('Authorization', `Bearer ${jetonAutreCapitaine}`)
      .send({});

    expect(seconde.status).toBe(409);
    expect(nouvelleDemande.status).toBe(409);
    expect(await membresDe(equipeId)).toHaveLength(5);
    expect(await membresDe(equipeId)).not.toContain(3);
  });

  it('B-07 : un joueur deja engage sur le tournoi ne peut ni demander ni etre accepte ailleurs (409)', async () => {
    const { tournoiId } = await preparerEquipe('Tournoi de test - deja engage');
    const autreEquipeId = await creerEquipe(jetonAutreCapitaine, tournoiId, 'Equipe de Lea');

    // Hanoune est deja membre de l'equipe de Zeki
    const demandeMembre = await request(app)
      .post(`/api/equipes/${autreEquipeId}/demandes`)
      .set('Authorization', `Bearer ${jetonMembre}`)
      .send({});

    // Sami demande chez Lea, puis s'engage ailleurs en creant sa propre equipe
    const demandeId = await deposerDemande(jetonDemandeur, autreEquipeId);
    await creerEquipe(jetonDemandeur, tournoiId, 'Equipe de Sami');

    const acceptation = await request(app)
      .patch(`/api/equipes/${autreEquipeId}/demandes/${demandeId}`)
      .set('Authorization', `Bearer ${jetonAutreCapitaine}`)
      .send({ decision: 'acceptee' });

    expect(demandeMembre.status).toBe(409);
    expect(acceptation.status).toBe(409);
    expect(await membresDe(autreEquipeId)).toEqual([4]);
    // En creant son equipe, Sami a rendu sa demande sans objet : elle est annulee
    expect(await statutDe(jetonDemandeur, demandeId)).toBe('annulee');
  });

  it("B-10 : un capitaine ne peut pas traiter ni annuler la demande visant une autre equipe (404)", async () => {
    const { tournoiId, equipeId } = await preparerEquipe('Tournoi de test - demande d une autre equipe');
    const equipeLeaId = await creerEquipe(jetonAutreCapitaine, tournoiId, 'Equipe de Lea');
    const demandeId = await deposerDemande(jetonDemandeur, equipeId);
    const membresAvant = await membresDe(equipeId);

    // Lea passe par sa propre equipe pour viser une demande adressee a Zeki
    const acceptation = await request(app)
      .patch(`/api/equipes/${equipeLeaId}/demandes/${demandeId}`)
      .set('Authorization', `Bearer ${jetonAutreCapitaine}`)
      .send({ decision: 'acceptee' });

    const refus = await request(app)
      .patch(`/api/equipes/${equipeLeaId}/demandes/${demandeId}`)
      .set('Authorization', `Bearer ${jetonAutreCapitaine}`)
      .send({ decision: 'refusee' });

    expect(acceptation.status).toBe(404);
    expect(refus.status).toBe(404);
    expect(await statutDe(jetonDemandeur, demandeId)).toBe('en_attente');
    expect(await membresDe(equipeId)).toEqual(membresAvant);
    expect(await membresDe(equipeLeaId)).toEqual([4]);
  });

  it('B-06 : une seconde demande en attente pour la meme equipe est refusee (409)', async () => {
    const { equipeId } = await preparerEquipe('Tournoi de test - double demande');
    await deposerDemande(jetonDemandeur, equipeId);

    const doublon = await request(app)
      .post(`/api/equipes/${equipeId}/demandes`)
      .set('Authorization', `Bearer ${jetonDemandeur}`)
      .send({});

    expect(doublon.status).toBe(409);
    expect(await demandesEnAttente(equipeId)).toHaveLength(1);
  });

  it("B-06 : l'adhesion directe sans accord du capitaine n'existe plus (404)", async () => {
    const { equipeId } = await preparerEquipe('Tournoi de test - adhesion directe');
    const avant = await membresDe(equipeId);

    const reponse = await request(app)
      .post(`/api/equipes/${equipeId}/membres`)
      .set('Authorization', `Bearer ${jetonDemandeur}`)
      .send({});

    expect(reponse.status).toBe(404);
    expect(await membresDe(equipeId)).toEqual(avant);
  });

  it('B-06 : le capitaine accepte ou refuse, le joueur peut annuler sa propre demande', async () => {
    const { equipeId } = await preparerEquipe('Tournoi de test - demandes nominal');
    const demandeSami = await deposerDemande(jetonDemandeur, equipeId);
    const demandeLea = await deposerDemande(jetonAutreCapitaine, equipeId);

    const enAttente = await demandesEnAttente(equipeId);
    expect(enAttente.map((d) => d.userId).sort()).toEqual([4, SAMI]);
    // Le capitaine voit le nom du joueur, pas seulement son id
    expect(enAttente.find((d) => d.id === demandeSami)?.nomJoueur).toBe('Sami');

    const acceptation = await request(app)
      .patch(`/api/equipes/${equipeId}/demandes/${demandeSami}`)
      .set('Authorization', `Bearer ${jetonCapitaine}`)
      .send({ decision: 'acceptee' });
    expect(acceptation.status).toBe(200);
    expect(acceptation.body.statut).toBe('acceptee');

    const refus = await request(app)
      .patch(`/api/equipes/${equipeId}/demandes/${demandeLea}`)
      .set('Authorization', `Bearer ${jetonCapitaine}`)
      .send({ decision: 'refusee' });
    expect(refus.status).toBe(200);
    expect(refus.body.statut).toBe('refusee');

    const equipe = await request(app).get(`/api/equipes/${equipeId}`);
    expect(equipe.body.membres).toContainEqual({ userId: SAMI, nom: 'Sami', roleJeu: null });
    expect(equipe.body.membres.map((m: { userId: number }) => m.userId)).not.toContain(4);
    expect(await demandesEnAttente(equipeId)).toHaveLength(0);

    // Une demande traitee ne se rejoue pas
    const rejeu = await request(app)
      .patch(`/api/equipes/${equipeId}/demandes/${demandeLea}`)
      .set('Authorization', `Bearer ${jetonCapitaine}`)
      .send({ decision: 'acceptee' });
    expect(rejeu.status).toBe(409);

    // Lea refusee peut redemander, puis retirer sa demande elle-meme
    const nouvelleDemande = await deposerDemande(jetonAutreCapitaine, equipeId);
    const annulation = await request(app)
      .delete(`/api/equipes/${equipeId}/demandes/${nouvelleDemande}`)
      .set('Authorization', `Bearer ${jetonAutreCapitaine}`);
    expect(annulation.status).toBe(204);
    expect(await demandesEnAttente(equipeId)).toHaveLength(0);
  });

  it('B-07 : une fois accepte, les autres demandes du joueur sur le tournoi sont annulees', async () => {
    const { tournoiId, equipeId } = await preparerEquipe('Tournoi de test - annulation automatique');
    const autreEquipeId = await creerEquipe(jetonAutreCapitaine, tournoiId, 'Equipe de Lea');

    const demandeChezZeki = await deposerDemande(jetonDemandeur, equipeId);
    const demandeChezLea = await deposerDemande(jetonDemandeur, autreEquipeId);

    const acceptation = await request(app)
      .patch(`/api/equipes/${equipeId}/demandes/${demandeChezZeki}`)
      .set('Authorization', `Bearer ${jetonCapitaine}`)
      .send({ decision: 'acceptee' });
    expect(acceptation.status).toBe(200);

    // La demande chez Lea a disparu de sa liste et ne peut plus etre acceptee
    expect(await demandesEnAttente(autreEquipeId, jetonAutreCapitaine)).toHaveLength(0);

    const acceptationTardive = await request(app)
      .patch(`/api/equipes/${autreEquipeId}/demandes/${demandeChezLea}`)
      .set('Authorization', `Bearer ${jetonAutreCapitaine}`)
      .send({ decision: 'acceptee' });

    expect(acceptationTardive.status).toBe(409);
    expect(await membresDe(autreEquipeId)).toEqual([4]);
  });
});
