import request from 'supertest';
import app from '../src/app';
import { COMPTES, connexion } from './helpers';

// Securite : tests de REFUS sur le deroulement des matchs (reserve a l'administrateur).
describe('Matchs', () => {
  let jetonJoueur: string;

  // Match 1 de fakeData : tournoi en cours, equipes 1 et 2, sans vainqueur.
  // Ces tests ne modifient rien (ils verifient un refus), l'etat reste donc intact.
  const matchId = 1;

  beforeAll(async () => {
    jetonJoueur = await connexion(COMPTES.zeki);
  });

  it('B-13 : un joueur ne peut pas saisir le resultat d un match (403)', async () => {
    const reponse = await request(app)
      .patch(`/api/matchs/${matchId}/resultat`)
      .set('Authorization', `Bearer ${jetonJoueur}`)
      .send({ vainqueurId: 1 });

    expect(reponse.status).toBe(403);
    const apres = await request(app).get(`/api/matchs/${matchId}`);
    expect(apres.body.vainqueurId).toBeNull();
  });

  it('B-15 : un joueur ne peut pas declarer un forfait (403)', async () => {
    const reponse = await request(app)
      .patch(`/api/matchs/${matchId}/forfait`)
      .set('Authorization', `Bearer ${jetonJoueur}`)
      .send({ equipeForfaitId: 2 });

    expect(reponse.status).toBe(403);
    const apres = await request(app).get(`/api/matchs/${matchId}`);
    expect(apres.body.vainqueurId).toBeNull();
  });
});
