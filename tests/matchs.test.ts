import request from 'supertest';
import app from '../src/app';
import { COMPTES, connexion } from './helpers';
import { equipes, matchs, tournois } from '../src/models/fakeData';

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

  // L'arbre des matchs n'est pas encore genere (B-12) et aucune route ne permet de creer
  // un match : ces tests inserent donc leurs propres tournois, equipes et matchs
  // directement dans les tableaux de fakeData. Ids a partir de 1000 et donnees dediees
  // a chaque test, pour ne percuter ni le jeu de donnees existant ni les autres tests.
  describe('regles de deroulement', () => {
    let jetonAdmin: string;

    beforeAll(async () => {
      jetonAdmin = await connexion(COMPTES.admin);

      tournois.push(
        { id: 1001, nom: 'Test forfait rejoue', jeu: 'Valorant', etat: 'en_cours' },
        { id: 1002, nom: 'Test tournoi non lance', jeu: 'Valorant', etat: 'inscriptions_closes' },
        { id: 1003, nom: 'Test equipe inconnue', jeu: 'Valorant', etat: 'en_cours' },
        { id: 1004, nom: 'Test finale', jeu: 'Valorant', etat: 'en_cours' }
      );

      for (const [id, tournoiId] of [
        [1001, 1001],
        [1002, 1001],
        [1003, 1002],
        [1004, 1002],
        [1005, 1003],
        [1006, 1004],
        [1007, 1004],
      ]) {
        equipes.push({
          id,
          tournoiId,
          nom: `Equipe de test ${id}`,
          capitaineId: 2,
          eliminee: false,
          membres: [{ userId: 2, nom: 'Zeki', roleJeu: null }],
        });
      }

      matchs.push(
        // Tournoi en cours, match jouable, suivi d'un autre tour : le tournoi ne se termine pas
        { id: 1001, tournoiId: 1001, round: 1, position: 1, equipe1Id: 1001, equipe2Id: 1002, vainqueurId: null, matchSuivantId: 1002 },
        { id: 1002, tournoiId: 1001, round: 2, position: 1, equipe1Id: null, equipe2Id: null, vainqueurId: null, matchSuivantId: null },
        // Tournoi pas encore lance
        { id: 1003, tournoiId: 1002, round: 1, position: 1, equipe1Id: 1003, equipe2Id: 1004, vainqueurId: null, matchSuivantId: null },
        // Match dont l adversaire n est pas encore qualifie
        { id: 1004, tournoiId: 1003, round: 2, position: 1, equipe1Id: 1005, equipe2Id: null, vainqueurId: null, matchSuivantId: null },
        // Finale : aucun match suivant
        { id: 1005, tournoiId: 1004, round: 1, position: 1, equipe1Id: 1006, equipe2Id: 1007, vainqueurId: null, matchSuivantId: null }
      );
    });

    it("B-15 : un forfait sur un match dont le tournoi n'est pas en cours est refuse (409)", async () => {
      const reponse = await request(app)
        .patch('/api/matchs/1003/forfait')
        .set('Authorization', `Bearer ${jetonAdmin}`)
        .send({ equipeForfaitId: 1003 });

      expect(reponse.status).toBe(409);
      const apres = await request(app).get('/api/matchs/1003');
      expect(apres.body.vainqueurId).toBeNull();
    });

    it("B-14/B-15 : un forfait sur un match dont une equipe n'est pas connue est refuse (409) et n'elimine personne", async () => {
      const reponse = await request(app)
        .patch('/api/matchs/1004/forfait')
        .set('Authorization', `Bearer ${jetonAdmin}`)
        .send({ equipeForfaitId: 1005 });

      expect(reponse.status).toBe(409);

      // Sans ce refus, l equipe serait eliminee alors que vainqueurId resterait null,
      // et la requete pourrait etre rejouee indefiniment
      const match = await request(app).get('/api/matchs/1004');
      expect(match.body.vainqueurId).toBeNull();
      const equipe = await request(app).get('/api/equipes/1005');
      expect(equipe.body.eliminee).toBe(false);
    });

    it('B-15 : un forfait sur un match deja joue est refuse (409)', async () => {
      const premier = await request(app)
        .patch('/api/matchs/1001/forfait')
        .set('Authorization', `Bearer ${jetonAdmin}`)
        .send({ equipeForfaitId: 1002 });
      expect(premier.status).toBe(200);

      const second = await request(app)
        .patch('/api/matchs/1001/forfait')
        .set('Authorization', `Bearer ${jetonAdmin}`)
        .send({ equipeForfaitId: 1001 });

      expect(second.status).toBe(409);
      // Le vainqueur du premier forfait reste inchange
      const apres = await request(app).get('/api/matchs/1001');
      expect(apres.body.vainqueurId).toBe(1001);
    });

    it("B-14 : saisir le resultat d'une finale termine le tournoi", async () => {
      const avant = await request(app).get('/api/tournois/1004');
      expect(avant.body.etat).toBe('en_cours');

      const reponse = await request(app)
        .patch('/api/matchs/1005/resultat')
        .set('Authorization', `Bearer ${jetonAdmin}`)
        .send({ vainqueurId: 1006 });
      expect(reponse.status).toBe(200);

      const apres = await request(app).get('/api/tournois/1004');
      expect(apres.body.etat).toBe('termine');
    });
  });
});
