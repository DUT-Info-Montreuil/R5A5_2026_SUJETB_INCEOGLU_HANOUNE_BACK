import request from 'supertest';
import app from '../src/app';
import {
  COMPTES,
  EFFECTIF_COMPLET,
  NOMBRE_EQUIPES,
  cloturerInscriptions,
  connexion,
  creerTournoiAHuitEquipes,
  lancerTournoi,
  match,
  prechargerVivier,
} from './helpers';

// Securite : tests de REFUS sur le deroulement des matchs (reserve a l'administrateur).
describe('Matchs', () => {
  let jetonJoueur: string;

  // Match 1 de fakeData : premier match du tournoi 2, en cours, sans vainqueur.
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

  // Chaque test construit son propre tournoi a huit equipes via l'API (B-12) puis le
  // cloture et le lance : les matchs proviennent de la generation de l'arbre, jamais
  // d'une insertion directe dans fakeData.
  describe('regles de deroulement', () => {
    let jetonAdmin: string;

    beforeAll(async () => {
      jetonAdmin = await connexion(COMPTES.admin);
      // Huit equipes de cinq joueurs : le vivier est cree une fois puis reutilise
      // d'un tournoi a l'autre, quel que soit l'ordre d'execution des tests.
      await prechargerVivier(NOMBRE_EQUIPES * EFFECTIF_COMPLET);
    });

    // Saisit un resultat et verifie qu'il est accepte, pour distinguer une mise en
    // place cassee d'une regle violee.
    async function saisirResultat(matchAJouer: { id: number }, vainqueurId: number) {
      const reponse = await request(app)
        .patch(`/api/matchs/${matchAJouer.id}/resultat`)
        .set('Authorization', `Bearer ${jetonAdmin}`)
        .send({ vainqueurId });
      expect(reponse.status).toBe(200);
    }

    it("B-15 : un forfait sur un match dont le tournoi n'est pas en cours est refuse (409)", async () => {
      // Tournoi cloture mais pas lance : l'arbre existe, le tournoi n'est pas en cours
      const { tournoiId } = await creerTournoiAHuitEquipes(jetonAdmin, {
        nom: 'Test tournoi non lance',
        effectifs: 1,
      });
      await cloturerInscriptions(jetonAdmin, tournoiId);
      const premierMatch = await match(tournoiId, 1, 1);

      const reponse = await request(app)
        .patch(`/api/matchs/${premierMatch.id}/forfait`)
        .set('Authorization', `Bearer ${jetonAdmin}`)
        .send({ equipeForfaitId: premierMatch.equipe1Id });

      expect(reponse.status).toBe(409);
      const apres = await request(app).get(`/api/matchs/${premierMatch.id}`);
      expect(apres.body.vainqueurId).toBeNull();
    });

    it("B-14/B-15 : un forfait sur un match dont une equipe n'est pas connue est refuse (409) et n'elimine personne", async () => {
      const { tournoiId } = await creerTournoiAHuitEquipes(jetonAdmin, {
        nom: 'Test equipe inconnue',
      });
      await cloturerInscriptions(jetonAdmin, tournoiId);
      await lancerTournoi(jetonAdmin, tournoiId);

      // Un seul match du premier tour est joue : le second tour n'a qu'une equipe connue
      const premierMatch = await match(tournoiId, 1, 1);
      const qualifie = premierMatch.equipe1Id!;
      await saisirResultat(premierMatch, qualifie);

      const demiFinale = await match(tournoiId, 2, 1);
      expect(demiFinale.equipe2Id).toBeNull();

      const reponse = await request(app)
        .patch(`/api/matchs/${demiFinale.id}/forfait`)
        .set('Authorization', `Bearer ${jetonAdmin}`)
        .send({ equipeForfaitId: qualifie });

      expect(reponse.status).toBe(409);

      // Sans ce refus, l equipe serait eliminee alors que vainqueurId resterait null,
      // et la requete pourrait etre rejouee indefiniment
      const matchApres = await request(app).get(`/api/matchs/${demiFinale.id}`);
      expect(matchApres.body.vainqueurId).toBeNull();
      const equipe = await request(app).get(`/api/equipes/${qualifie}`);
      expect(equipe.body.eliminee).toBe(false);
    });

    it('B-15 : un forfait sur un match deja joue est refuse (409)', async () => {
      const { tournoiId } = await creerTournoiAHuitEquipes(jetonAdmin, {
        nom: 'Test forfait rejoue',
      });
      await cloturerInscriptions(jetonAdmin, tournoiId);
      await lancerTournoi(jetonAdmin, tournoiId);

      const premierMatch = await match(tournoiId, 1, 1);

      const premier = await request(app)
        .patch(`/api/matchs/${premierMatch.id}/forfait`)
        .set('Authorization', `Bearer ${jetonAdmin}`)
        .send({ equipeForfaitId: premierMatch.equipe2Id });
      expect(premier.status).toBe(200);

      const second = await request(app)
        .patch(`/api/matchs/${premierMatch.id}/forfait`)
        .set('Authorization', `Bearer ${jetonAdmin}`)
        .send({ equipeForfaitId: premierMatch.equipe1Id });

      expect(second.status).toBe(409);
      // Le vainqueur du premier forfait reste inchange
      const apres = await request(app).get(`/api/matchs/${premierMatch.id}`);
      expect(apres.body.vainqueurId).toBe(premierMatch.equipe1Id);
    });

    it("B-14 : saisir le resultat d'une finale termine le tournoi", async () => {
      const { tournoiId } = await creerTournoiAHuitEquipes(jetonAdmin, { nom: 'Test finale' });
      await cloturerInscriptions(jetonAdmin, tournoiId);
      await lancerTournoi(jetonAdmin, tournoiId);

      const avant = await request(app).get(`/api/tournois/${tournoiId}`);
      expect(avant.body.etat).toBe('en_cours');

      // Premier tour puis demi-finales : l equipe1 l emporte a chaque fois
      for (const position of [1, 2, 3, 4]) {
        const matchDuTour = await match(tournoiId, 1, position);
        await saisirResultat(matchDuTour, matchDuTour.equipe1Id!);
      }
      for (const position of [1, 2]) {
        const demiFinale = await match(tournoiId, 2, position);
        await saisirResultat(demiFinale, demiFinale.equipe1Id!);
      }

      const finale = await match(tournoiId, 3, 1);
      expect(finale.matchSuivantId).toBeNull();

      const reponse = await request(app)
        .patch(`/api/matchs/${finale.id}/resultat`)
        .set('Authorization', `Bearer ${jetonAdmin}`)
        .send({ vainqueurId: finale.equipe1Id });
      expect(reponse.status).toBe(200);

      const apres = await request(app).get(`/api/tournois/${tournoiId}`);
      expect(apres.body.etat).toBe('termine');
    });

    it("B-14 : le vainqueur prend la place liee a la position de son match, quel que soit l'ordre de saisie", async () => {
      const { tournoiId } = await creerTournoiAHuitEquipes(jetonAdmin, { nom: 'Test placement' });
      await cloturerInscriptions(jetonAdmin, tournoiId);
      await lancerTournoi(jetonAdmin, tournoiId);

      const matchPosition1 = await match(tournoiId, 1, 1);
      const matchPosition2 = await match(tournoiId, 1, 2);

      // On saisit volontairement la position 2 avant la position 1
      await saisirResultat(matchPosition2, matchPosition2.equipe1Id!);
      await saisirResultat(matchPosition1, matchPosition1.equipe1Id!);

      const demiFinale = await match(tournoiId, 2, 1);
      // Position impaire vers equipe1, position paire vers equipe2 : l arbre ne depend
      // pas de l ordre dans lequel l administrateur saisit les resultats
      expect(demiFinale.equipe1Id).toBe(matchPosition1.equipe1Id);
      expect(demiFinale.equipe2Id).toBe(matchPosition2.equipe1Id);
    });

    it('B-04 : une equipe incomplete au lancement est forfait et son adversaire passe au tour suivant', async () => {
      // Seule la premiere equipe est incomplete (quatre joueurs au lieu de cinq)
      const { tournoiId, equipeIds } = await creerTournoiAHuitEquipes(jetonAdmin, {
        nom: 'Test forfait au lancement',
        effectifs: [4, 5, 5, 5, 5, 5, 5, 5],
      });
      await cloturerInscriptions(jetonAdmin, tournoiId);
      await lancerTournoi(jetonAdmin, tournoiId);

      const premierMatch = await match(tournoiId, 1, 1);
      expect(premierMatch.vainqueurId).toBe(equipeIds[1]);

      const equipeIncomplete = await request(app).get(`/api/equipes/${equipeIds[0]}`);
      expect(equipeIncomplete.body.eliminee).toBe(true);

      // L adversaire est qualifie pour le second tour sans avoir joue
      const demiFinale = await match(tournoiId, 2, 1);
      expect(demiFinale.equipe1Id).toBe(equipeIds[1]);
    });

    it('B-04 : un double forfait au lancement se propage au tour suivant', async () => {
      // Les deux equipes du premier match sont incompletes ; celles du second sont completes
      const { tournoiId, equipeIds } = await creerTournoiAHuitEquipes(jetonAdmin, {
        nom: 'Test double forfait',
        effectifs: [4, 4, 5, 5, 5, 5, 5, 5],
      });
      await cloturerInscriptions(jetonAdmin, tournoiId);
      await lancerTournoi(jetonAdmin, tournoiId);

      // Les deux equipes sont eliminees et personne n avance
      for (const equipeId of [equipeIds[0], equipeIds[1]]) {
        const equipe = await request(app).get(`/api/equipes/${equipeId}`);
        expect(equipe.body.eliminee).toBe(true);
      }
      const premierMatch = await match(tournoiId, 1, 1);
      expect(premierMatch.vainqueurId).toBeNull();

      const demiFinaleAvant = await match(tournoiId, 2, 1);
      expect(demiFinaleAvant.equipe1Id).toBeNull();

      // Quand l adversaire du tour suivant est connu, il est qualifie d office
      const matchPosition2 = await match(tournoiId, 1, 2);
      await saisirResultat(matchPosition2, matchPosition2.equipe1Id!);

      const demiFinale = await match(tournoiId, 2, 1);
      expect(demiFinale.equipe2Id).toBe(matchPosition2.equipe1Id);
      expect(demiFinale.vainqueurId).toBe(matchPosition2.equipe1Id);

      // Le forfait remonte jusqu a la finale
      const finale = await match(tournoiId, 3, 1);
      expect(finale.equipe1Id).toBe(matchPosition2.equipe1Id);
    });
  });
});
