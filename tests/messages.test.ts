import { api } from './api';
import {
  COMPTES,
  cloturerInscriptions,
  connexion,
  creerEquipe,
  creerTournoi,
  creerTournoiAHuitEquipes,
  lancerTournoi,
  rejoindreEquipe,
} from './helpers';

// Securite : tests de REFUS sur l'espace d'echange interne a une equipe.
describe('Messages d equipe', () => {
  let jetonAdmin: string;
  let jetonCapitaine: string; // Zeki
  let jetonMembre: string; // Hanoune
  let jetonSansEquipe: string; // Sami, membre d'aucune equipe

  let equipeId: number;

  beforeAll(async () => {
    jetonAdmin = await connexion(COMPTES.admin);
    jetonCapitaine = await connexion(COMPTES.zeki);
    jetonMembre = await connexion(COMPTES.hanoune);
    jetonSansEquipe = await connexion(COMPTES.sami);

    const tournoiId = await creerTournoi(jetonAdmin, 'Tournoi de test - messages');
    equipeId = await creerEquipe(jetonCapitaine, tournoiId, 'Equipe bavarde');
    await rejoindreEquipe(jetonMembre, jetonCapitaine, equipeId);
  });

  it('B-16 : un membre lit les messages avec le nom de leur auteur, comme en temps reel', async () => {
    const envoi = await api()
      .post(`/api/equipes/${equipeId}/messages`)
      .set('Authorization', `Bearer ${jetonCapitaine}`)
      .send({ contenu: 'Entrainement ce soir' });
    expect(envoi.status).toBe(201);

    const reponse = await api()
      .get(`/api/equipes/${equipeId}/messages`)
      .set('Authorization', `Bearer ${jetonMembre}`);

    expect(reponse.status).toBe(200);
    expect(reponse.body).toContainEqual(
      expect.objectContaining({ id: envoi.body.id, userId: 2, contenu: 'Entrainement ce soir', nomAuteur: 'Zeki' })
    );
  });

  it("B-16 : un joueur qui n'est pas membre de l'equipe ne peut pas lire les messages (403)", async () => {
    const reponse = await api()
      .get(`/api/equipes/${equipeId}/messages`)
      .set('Authorization', `Bearer ${jetonSansEquipe}`);

    expect(reponse.status).toBe(403);
  });

  it("B-16 : un joueur qui n'est pas membre de l'equipe ne peut pas ecrire de message (403)", async () => {
    const reponse = await api()
      .post(`/api/equipes/${equipeId}/messages`)
      .set('Authorization', `Bearer ${jetonSansEquipe}`)
      .send({ contenu: 'Je ne devrais pas pouvoir ecrire ici' });

    expect(reponse.status).toBe(403);
  });

  it("B-17 : un joueur exclu de l'equipe perd immediatement l'acces en lecture et en ecriture (403)", async () => {
    // Equipe dediee : l'exclusion est destructive, elle ne doit pas perturber les autres tests
    const tournoiId = await creerTournoi(jetonAdmin, 'Tournoi de test - exclusion');
    const equipeExclusionId = await creerEquipe(jetonCapitaine, tournoiId, 'Equipe exclusion');
    await rejoindreEquipe(jetonMembre, jetonCapitaine, equipeExclusionId);

    // Avant exclusion, le membre a bien acces
    const lectureAvant = await api()
      .get(`/api/equipes/${equipeExclusionId}/messages`)
      .set('Authorization', `Bearer ${jetonMembre}`);
    expect(lectureAvant.status).toBe(200);

    const exclusion = await api()
      .delete(`/api/equipes/${equipeExclusionId}/membres/3`)
      .set('Authorization', `Bearer ${jetonCapitaine}`);
    expect(exclusion.status).toBe(204);

    // Apres exclusion, l'acces est coupe sans delai, avec le meme jeton
    const lectureApres = await api()
      .get(`/api/equipes/${equipeExclusionId}/messages`)
      .set('Authorization', `Bearer ${jetonMembre}`);

    const ecritureApres = await api()
      .post(`/api/equipes/${equipeExclusionId}/messages`)
      .set('Authorization', `Bearer ${jetonMembre}`)
      .send({ contenu: 'Je suis exclu mais j ecris quand meme' });

    expect(lectureApres.status).toBe(403);
    expect(ecritureApres.status).toBe(403);
  });

  describe('equipe eliminee', () => {
    let equipeElimineeId: number;
    let jetonMembreElimine: string; // Lea, capitaine de l'equipe eliminee

    beforeAll(async () => {
      jetonMembreElimine = await connexion(COMPTES.lea);

      // Tournoi genere par l'API (B-12). L'equipe de Lea est volontairement incomplete :
      // au lancement, elle est forfait sur son premier match et donc eliminee (B-04).
      const { tournoiId, equipeIds } = await creerTournoiAHuitEquipes(jetonAdmin, {
        nom: 'Tournoi de test - elimination',
        effectifs: [1, 5, 1, 1, 1, 1, 1, 1],
        jetonsPremiereEquipe: [jetonMembreElimine],
      });
      equipeElimineeId = equipeIds[0];

      await cloturerInscriptions(jetonAdmin, tournoiId);
      await lancerTournoi(jetonAdmin, tournoiId);

      const equipe = await api().get(`/api/equipes/${equipeElimineeId}`);
      expect(equipe.body.eliminee).toBe(true);
    });

    it("B-18 : l'espace d'une equipe eliminee est ferme en ecriture, meme pour ses membres (409)", async () => {
      const reponse = await api()
        .post(`/api/equipes/${equipeElimineeId}/messages`)
        .set('Authorization', `Bearer ${jetonMembreElimine}`)
        .send({ contenu: 'Un dernier mot' });

      expect(reponse.status).toBe(409);
    });

    it("B-18 : un membre d'une equipe eliminee ne peut plus lire les messages (409)", async () => {
      const reponse = await api()
        .get(`/api/equipes/${equipeElimineeId}/messages`)
        .set('Authorization', `Bearer ${jetonMembreElimine}`);

      expect(reponse.status).toBe(409);
    });

    it("B-16 : un non-membre d'une equipe eliminee reste refuse en lecture (403, prioritaire sur le 409)", async () => {
      const reponse = await api()
        .get(`/api/equipes/${equipeElimineeId}/messages`)
        .set('Authorization', `Bearer ${jetonSansEquipe}`);

      // L elimination ne doit pas etre revelee a quelqu un qui n a pas acces a l espace
      expect(reponse.status).toBe(403);
    });

    it("B-18 : l'administrateur peut toujours consulter l'espace d'une equipe eliminee (200)", async () => {
      const reponse = await api()
        .get(`/api/equipes/${equipeElimineeId}/messages`)
        .set('Authorization', `Bearer ${jetonAdmin}`);

      expect(reponse.status).toBe(200);
      expect(Array.isArray(reponse.body)).toBe(true);
    });
  });
});
