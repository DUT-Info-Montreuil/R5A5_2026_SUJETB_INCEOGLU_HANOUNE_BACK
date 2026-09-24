import request from 'supertest';
import app from '../src/app';
import { COMPTES, connexion, creerEquipe, creerTournoi, rejoindreEquipe } from './helpers';

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
    await rejoindreEquipe(jetonMembre, equipeId);
    await rejoindreEquipe(jetonAutreMembre, equipeId);
  });

  it("B-09/B-10 : un membre qui n'est pas capitaine ne peut pas renommer l'equipe (403)", async () => {
    const reponse = await request(app)
      .patch(`/api/equipes/${equipeId}`)
      .set('Authorization', `Bearer ${jetonMembre}`)
      .send({ nom: 'Nom vole' });

    expect(reponse.status).toBe(403);
    const apres = await request(app).get(`/api/equipes/${equipeId}`);
    expect(apres.body.nom).toBe('Equipe de test');
  });

  it("B-10 : un joueur membre d'aucune equipe ne peut agir sur aucune equipe (403)", async () => {
    const renommage = await request(app)
      .patch(`/api/equipes/${equipeId}`)
      .set('Authorization', `Bearer ${jetonSansEquipe}`)
      .send({ nom: 'Nom vole' });

    const attributionRole = await request(app)
      .patch(`/api/equipes/${equipeId}/membres/3`)
      .set('Authorization', `Bearer ${jetonSansEquipe}`)
      .send({ roleJeu: 'duelliste' });

    expect(renommage.status).toBe(403);
    expect(attributionRole.status).toBe(403);
  });

  it("B-10 : un membre non capitaine ne peut pas attribuer un role (403)", async () => {
    const reponse = await request(app)
      .patch(`/api/equipes/${equipeId}/membres/4`)
      .set('Authorization', `Bearer ${jetonMembre}`)
      .send({ roleJeu: 'sentinelle' });

    expect(reponse.status).toBe(403);
  });

  it("B-09 : un membre non capitaine ne peut pas exclure un autre membre (403)", async () => {
    const reponse = await request(app)
      .delete(`/api/equipes/${equipeId}/membres/4`)
      .set('Authorization', `Bearer ${jetonMembre}`);

    expect(reponse.status).toBe(403);
    // L'effectif ne doit pas avoir bouge
    const apres = await request(app).get(`/api/equipes/${equipeId}`);
    expect(apres.body.membres.map((m: { userId: number }) => m.userId)).toContain(4);
  });

  it("B-09 : un joueur qui n'est pas capitaine ne peut pas passer la main a un autre capitaine (403)", async () => {
    const reponse = await request(app)
      .patch(`/api/equipes/${equipeId}/capitaine`)
      .set('Authorization', `Bearer ${jetonMembre}`)
      .send({ nouveauCapitaineId: 3 });

    expect(reponse.status).toBe(403);
    const apres = await request(app).get(`/api/equipes/${equipeId}`);
    expect(apres.body.capitaineId).toBe(2);
  });

  it('B-11 : une fois les inscriptions closes, effectif et roles sont figes meme pour le capitaine (409)', async () => {
    // Tournoi et equipe propres a ce test, pour ne pas figer les donnees des autres tests
    const tournoiId = await creerTournoi(jetonAdmin, 'Tournoi de test - cloture');
    const equipeFigeeId = await creerEquipe(jetonCapitaine, tournoiId, 'Equipe figee');
    await rejoindreEquipe(jetonMembre, equipeFigeeId);

    const cloture = await request(app)
      .patch(`/api/tournois/${tournoiId}/cloturer`)
      .set('Authorization', `Bearer ${jetonAdmin}`)
      .send({});
    expect(cloture.status).toBe(200);

    const ajoutMembre = await request(app)
      .post(`/api/equipes/${equipeFigeeId}/membres`)
      .set('Authorization', `Bearer ${jetonSansEquipe}`)
      .send({});

    const attributionRole = await request(app)
      .patch(`/api/equipes/${equipeFigeeId}/membres/3`)
      .set('Authorization', `Bearer ${jetonCapitaine}`)
      .send({ roleJeu: 'duelliste' });

    const exclusion = await request(app)
      .delete(`/api/equipes/${equipeFigeeId}/membres/3`)
      .set('Authorization', `Bearer ${jetonCapitaine}`);

    expect(ajoutMembre.status).toBe(409);
    expect(attributionRole.status).toBe(409);
    expect(exclusion.status).toBe(409);
  });

  it('B-11 : une fois les inscriptions closes, le capitaine ne peut plus passer la main (409)', async () => {
    // Tournoi et equipe propres a ce test : la cloture ne doit pas figer les autres donnees
    const tournoiId = await creerTournoi(jetonAdmin, 'Tournoi de test - passation');
    const equipeFigeeId = await creerEquipe(jetonCapitaine, tournoiId, 'Equipe passation');
    await rejoindreEquipe(jetonMembre, equipeFigeeId);

    const cloture = await request(app)
      .patch(`/api/tournois/${tournoiId}/cloturer`)
      .set('Authorization', `Bearer ${jetonAdmin}`)
      .send({});
    expect(cloture.status).toBe(200);

    const passation = await request(app)
      .patch(`/api/equipes/${equipeFigeeId}/capitaine`)
      .set('Authorization', `Bearer ${jetonCapitaine}`)
      .send({ nouveauCapitaineId: 3 });

    expect(passation.status).toBe(409);
    // Le capitaine d origine (Zeki) est toujours en place
    const apres = await request(app).get(`/api/equipes/${equipeFigeeId}`);
    expect(apres.body.capitaineId).toBe(2);
  });
});
