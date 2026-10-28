import request from 'supertest';
import app from '../src/app';
import { COMPTES, MOT_DE_PASSE, connexion } from './helpers';

// Securite : tests de REFUS sur l'authentification.
// Route protegee de reference : GET /api/auth/me (requireAuth).
describe('Authentification', () => {
  let jetonValide: string;

  beforeAll(async () => {
    jetonValide = await connexion(COMPTES.zeki);
  });

  it("refuse l'acces a une route protegee sans en-tete Authorization (401)", async () => {
    const reponse = await request(app).get('/api/auth/me');

    expect(reponse.status).toBe(401);
  });

  it("refuse l'acces a une route protegee avec un jeton invalide (401)", async () => {
    const reponse = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer ceci.nest.pas.un.jwt');

    expect(reponse.status).toBe(401);
  });

  it("refuse l'acces a une route protegee quand l'en-tete n'est pas au format Bearer (401)", async () => {
    const reponse = await request(app).get('/api/auth/me').set('Authorization', jetonValide);

    expect(reponse.status).toBe(401);
  });

  it('refuse la connexion avec un mauvais mot de passe (401)', async () => {
    const reponse = await request(app)
      .post('/api/auth/login')
      .send({ email: COMPTES.zeki, password: 'mauvais_mot_de_passe' });

    expect(reponse.status).toBe(401);
  });

  it("ne permet pas d'enumerer les comptes : mauvais mot de passe et email inconnu renvoient le meme message (401)", async () => {
    const mauvaisMotDePasse = await request(app)
      .post('/api/auth/login')
      .send({ email: COMPTES.zeki, password: 'mauvais_mot_de_passe' });

    const emailInconnu = await request(app)
      .post('/api/auth/login')
      .send({ email: 'inconnu@iut.fr', password: MOT_DE_PASSE });

    expect(mauvaisMotDePasse.status).toBe(401);
    expect(emailInconnu.status).toBe(401);
    // Le coeur de la regle : les deux reponses doivent etre indiscernables
    expect(mauvaisMotDePasse.body.message).toBe(emailInconnu.body.message);
  });
});
