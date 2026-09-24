import request from 'supertest';
import app from '../src/app';
import { COMPTES, connexion, creerTournoi } from './helpers';

// Securite : tests de REFUS sur la gestion des tournois (reservee a l'administrateur).
describe('Tournois', () => {
  let jetonAdmin: string;
  let jetonJoueur: string;
  let tournoiId: number;

  beforeAll(async () => {
    jetonAdmin = await connexion(COMPTES.admin);
    jetonJoueur = await connexion(COMPTES.zeki);
    // Tournoi dedie a ce fichier : aucun test ne depend de l'etat d'un tournoi partage
    tournoiId = await creerTournoi(jetonAdmin, 'Tournoi de test - tournois');
  });

  it('B-01 : un joueur ne peut pas creer un tournoi (403)', async () => {
    const reponse = await request(app)
      .post('/api/tournois')
      .set('Authorization', `Bearer ${jetonJoueur}`)
      .send({ nom: 'Tournoi pirate', jeu: 'Valorant' });

    expect(reponse.status).toBe(403);
  });

  it('B-03 : un joueur ne peut pas cloturer les inscriptions (403)', async () => {
    const reponse = await request(app)
      .patch(`/api/tournois/${tournoiId}/cloturer`)
      .set('Authorization', `Bearer ${jetonJoueur}`)
      .send({});

    expect(reponse.status).toBe(403);
    // Le refus ne doit pas avoir change l'etat du tournoi
    const apres = await request(app).get(`/api/tournois/${tournoiId}`);
    expect(apres.body.etat).toBe('inscriptions_ouvertes');
  });

  it('B-04 : un joueur ne peut pas lancer un tournoi (403)', async () => {
    const reponse = await request(app)
      .patch(`/api/tournois/${tournoiId}/lancer`)
      .set('Authorization', `Bearer ${jetonJoueur}`)
      .send({});

    expect(reponse.status).toBe(403);
    const apres = await request(app).get(`/api/tournois/${tournoiId}`);
    expect(apres.body.etat).toBe('inscriptions_ouvertes');
  });
});
