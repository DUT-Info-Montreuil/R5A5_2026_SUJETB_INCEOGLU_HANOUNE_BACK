import { api } from './api';
import {
  COMPTES,
  connexion,
  creerEquipe,
  creerTournoi,
  creerTournoiAHuitEquipes,
  rejoindreEquipe,
} from './helpers';

// Securite : tests de REFUS sur la composition des equipes.
// Toutes les donnees sont creees ici : aucun test ne depend de fakeData ni de l'ordre d'execution.
describe('Equipes', () => {
  let jetonAdmin: string;
  let jetonCapitaine: string; // Zeki, capitaine de l'equipe de test
  let jetonMembre: string; // Hanoune, membre sans galons
  let jetonAutreMembre: string; // Lea, membre sans galons
  let jetonSansEquipe: string; // Sami, membre d'aucune equipe

  let equipeId: number;

  beforeAll(async () => {
    jetonAdmin = await connexion(COMPTES.admin);
    jetonCapitaine = await connexion(COMPTES.zeki);
    jetonMembre = await connexion(COMPTES.hanoune);
    jetonAutreMembre = await connexion(COMPTES.lea);
    jetonSansEquipe = await connexion(COMPTES.sami);

    const tournoiId = await creerTournoi(jetonAdmin, 'Tournoi de test - equipes');
    equipeId = await creerEquipe(jetonCapitaine, tournoiId, 'Equipe de test');
    await rejoindreEquipe(jetonMembre, jetonCapitaine, equipeId);
    await rejoindreEquipe(jetonAutreMembre, jetonCapitaine, equipeId);
  });

  it("B-09/B-10 : un membre qui n'est pas capitaine ne peut pas renommer l'equipe (403)", async () => {
    const reponse = await api()
      .patch(`/api/equipes/${equipeId}`)
      .set('Authorization', `Bearer ${jetonMembre}`)
      .send({ nom: 'Nom vole' });

    expect(reponse.status).toBe(403);
    const apres = await api().get(`/api/equipes/${equipeId}`);
    expect(apres.body.nom).toBe('Equipe de test');
  });

  it("B-10 : un joueur membre d'aucune equipe ne peut agir sur aucune equipe (403)", async () => {
    const renommage = await api()
      .patch(`/api/equipes/${equipeId}`)
      .set('Authorization', `Bearer ${jetonSansEquipe}`)
      .send({ nom: 'Nom vole' });

    const attributionRole = await api()
      .patch(`/api/equipes/${equipeId}/membres/3`)
      .set('Authorization', `Bearer ${jetonSansEquipe}`)
      .send({ roleJeu: 'duelliste' });

    expect(renommage.status).toBe(403);
    expect(attributionRole.status).toBe(403);
  });

  it("B-10 : un membre non capitaine ne peut pas attribuer un role (403)", async () => {
    const reponse = await api()
      .patch(`/api/equipes/${equipeId}/membres/4`)
      .set('Authorization', `Bearer ${jetonMembre}`)
      .send({ roleJeu: 'sentinelle' });

    expect(reponse.status).toBe(403);
  });

  it("B-09 : un membre non capitaine ne peut pas exclure un autre membre (403)", async () => {
    const reponse = await api()
      .delete(`/api/equipes/${equipeId}/membres/4`)
      .set('Authorization', `Bearer ${jetonMembre}`);

    expect(reponse.status).toBe(403);
    // L'effectif ne doit pas avoir bouge
    const apres = await api().get(`/api/equipes/${equipeId}`);
    expect(apres.body.membres.map((m: { userId: number }) => m.userId)).toContain(4);
  });

  it("B-09 : un joueur qui n'est pas capitaine ne peut pas passer la main a un autre capitaine (403)", async () => {
    const reponse = await api()
      .patch(`/api/equipes/${equipeId}/capitaine`)
      .set('Authorization', `Bearer ${jetonMembre}`)
      .send({ nouveauCapitaineId: 3 });

    expect(reponse.status).toBe(403);
    const apres = await api().get(`/api/equipes/${equipeId}`);
    expect(apres.body.capitaineId).toBe(2);
  });

  it('B-11 : une fois les inscriptions closes, effectif et roles sont figes meme pour le capitaine (409)', async () => {
    // Tournoi propre a ce test, pour ne pas figer les donnees des autres tests.
    // B-12 : la cloture exige huit equipes engagees, le tournoi est donc complet.
    const { tournoiId, equipeIds } = await creerTournoiAHuitEquipes(jetonAdmin, {
      nom: 'Tournoi de test - cloture',
      effectifs: [2, 1, 1, 1, 1, 1, 1, 1],
      jetonsPremiereEquipe: [jetonCapitaine, jetonMembre],
    });
    const equipeFigeeId = equipeIds[0];

    const cloture = await api()
      .patch(`/api/tournois/${tournoiId}/cloturer`)
      .set('Authorization', `Bearer ${jetonAdmin}`)
      .send({});
    expect(cloture.status).toBe(200);

    // B-06 : on n'entre dans une equipe que par une demande, refusee elle aussi une fois figee
    const ajoutMembre = await api()
      .post(`/api/equipes/${equipeFigeeId}/demandes`)
      .set('Authorization', `Bearer ${jetonSansEquipe}`)
      .send({});

    const attributionRole = await api()
      .patch(`/api/equipes/${equipeFigeeId}/membres/3`)
      .set('Authorization', `Bearer ${jetonCapitaine}`)
      .send({ roleJeu: 'duelliste' });

    const exclusion = await api()
      .delete(`/api/equipes/${equipeFigeeId}/membres/3`)
      .set('Authorization', `Bearer ${jetonCapitaine}`);

    expect(ajoutMembre.status).toBe(409);
    expect(attributionRole.status).toBe(409);
    expect(exclusion.status).toBe(409);
  });

  it('B-11 : une fois les inscriptions closes, le capitaine ne peut plus passer la main (409)', async () => {
    // Tournoi propre a ce test : la cloture ne doit pas figer les autres donnees.
    // B-12 : huit equipes sont necessaires pour pouvoir cloturer.
    const { tournoiId, equipeIds } = await creerTournoiAHuitEquipes(jetonAdmin, {
      nom: 'Tournoi de test - passation',
      effectifs: [2, 1, 1, 1, 1, 1, 1, 1],
      jetonsPremiereEquipe: [jetonCapitaine, jetonMembre],
    });
    const equipeFigeeId = equipeIds[0];

    const cloture = await api()
      .patch(`/api/tournois/${tournoiId}/cloturer`)
      .set('Authorization', `Bearer ${jetonAdmin}`)
      .send({});
    expect(cloture.status).toBe(200);

    const passation = await api()
      .patch(`/api/equipes/${equipeFigeeId}/capitaine`)
      .set('Authorization', `Bearer ${jetonCapitaine}`)
      .send({ nouveauCapitaineId: 3 });

    expect(passation.status).toBe(409);
    // Le capitaine d origine (Zeki) est toujours en place
    const apres = await api().get(`/api/equipes/${equipeFigeeId}`);
    expect(apres.body.capitaineId).toBe(2);
  });

  it('B-12 : une neuvieme equipe ne peut pas s engager sur un tournoi (409)', async () => {
    const { tournoiId } = await creerTournoiAHuitEquipes(jetonAdmin, {
      nom: 'Tournoi de test - huit equipes',
      effectifs: 1,
    });

    // Sami n est engage sur aucune equipe de ce tournoi : seul le quota le bloque
    const reponse = await api()
      .post('/api/equipes')
      .set('Authorization', `Bearer ${jetonSansEquipe}`)
      .send({ tournoiId, nom: 'Equipe de trop' });

    expect(reponse.status).toBe(409);
    const equipesDuTournoi = await api().get(`/api/tournois/${tournoiId}/equipes`);
    expect(equipesDuTournoi.body).toHaveLength(8);
  });

  describe('GET /api/auth/me/equipes', () => {
    it('exige d etre connecte (401)', async () => {
      const reponse = await api().get('/api/auth/me/equipes');
      expect(reponse.status).toBe(401);
    });

    it("ne liste que les equipes du porteur du jeton, jamais celles d'un autre", async () => {
      // Equipe dont Zeki n'est pas membre, sur un tournoi a part
      const autreTournoiId = await creerTournoi(jetonAdmin, 'Tournoi de test - mes equipes');
      const equipeDeSamiId = await creerEquipe(jetonSansEquipe, autreTournoiId, 'Equipe de Sami');

      const reponse = await api().get('/api/auth/me/equipes').set('Authorization', `Bearer ${jetonCapitaine}`);

      expect(reponse.status).toBe(200);
      const ids = reponse.body.map((e: { id: number }) => e.id);
      expect(ids).toContain(equipeId);
      expect(ids).not.toContain(equipeDeSamiId);
      expect(reponse.body.every((e: { membres: { userId: number }[] }) => e.membres.some((m) => m.userId === 2))).toBe(true);
      expect(reponse.body.find((e: { id: number }) => e.id === equipeId)).toMatchObject({
        nomTournoi: 'Tournoi de test - equipes',
        etatTournoi: 'inscriptions_ouvertes',
      });
    });

    it("un simple membre (non capitaine) voit aussi son equipe", async () => {
      const reponse = await api().get('/api/auth/me/equipes').set('Authorization', `Bearer ${jetonMembre}`);

      expect(reponse.status).toBe(200);
      expect(reponse.body.map((e: { id: number }) => e.id)).toContain(equipeId);
    });

    it("B-17 : l'equipe dont on est exclu n'apparait plus dans la liste", async () => {
      const tournoiId = await creerTournoi(jetonAdmin, 'Tournoi de test - mes equipes exclusion');
      const equipeExclusionId = await creerEquipe(jetonCapitaine, tournoiId, 'Equipe qui exclut');
      await rejoindreEquipe(jetonSansEquipe, jetonCapitaine, equipeExclusionId);

      const exclusion = await api()
        .delete(`/api/equipes/${equipeExclusionId}/membres/5`)
        .set('Authorization', `Bearer ${jetonCapitaine}`);
      expect(exclusion.status).toBe(204);

      const reponse = await api().get('/api/auth/me/equipes').set('Authorization', `Bearer ${jetonSansEquipe}`);
      expect(reponse.body.map((e: { id: number }) => e.id)).not.toContain(equipeExclusionId);
    });

    it("B-06 : une equipe quittee n'apparait plus dans la liste", async () => {
      const tournoiId = await creerTournoi(jetonAdmin, 'Tournoi de test - mes equipes depart');
      const equipeQuitteeId = await creerEquipe(jetonCapitaine, tournoiId, 'Equipe quittee');
      await rejoindreEquipe(jetonSansEquipe, jetonCapitaine, equipeQuitteeId);

      const depart = await api()
        .delete(`/api/equipes/${equipeQuitteeId}/membres/5`)
        .set('Authorization', `Bearer ${jetonSansEquipe}`);
      expect(depart.status).toBe(204);

      const reponse = await api().get('/api/auth/me/equipes').set('Authorization', `Bearer ${jetonSansEquipe}`);
      expect(reponse.body.map((e: { id: number }) => e.id)).not.toContain(equipeQuitteeId);
    });
  });
});
