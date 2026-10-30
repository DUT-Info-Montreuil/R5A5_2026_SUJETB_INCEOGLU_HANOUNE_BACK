import { api } from './api';
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
    const reponse = await api()
      .post('/api/tournois')
      .set('Authorization', `Bearer ${jetonJoueur}`)
      .send({ nom: 'Tournoi pirate', jeu: 'Valorant' });

    expect(reponse.status).toBe(403);
  });

  it('B-03 : un joueur ne peut pas cloturer les inscriptions (403)', async () => {
    const reponse = await api()
      .patch(`/api/tournois/${tournoiId}/cloturer`)
      .set('Authorization', `Bearer ${jetonJoueur}`)
      .send({});

    expect(reponse.status).toBe(403);
    // Le refus ne doit pas avoir change l'etat du tournoi
    const apres = await api().get(`/api/tournois/${tournoiId}`);
    expect(apres.body.etat).toBe('inscriptions_ouvertes');
  });

  it('B-04 : un joueur ne peut pas lancer un tournoi (403)', async () => {
    const reponse = await api()
      .patch(`/api/tournois/${tournoiId}/lancer`)
      .set('Authorization', `Bearer ${jetonJoueur}`)
      .send({});

    expect(reponse.status).toBe(403);
    const apres = await api().get(`/api/tournois/${tournoiId}`);
    expect(apres.body.etat).toBe('inscriptions_ouvertes');
  });

  describe('recherche (?q=)', () => {
    let tournoiAccentueId: number;
    let tournoiRocketId: number;

    // Tournois dedies, aux noms improbables : la recherche ne depend pas de fakeData
    beforeAll(async () => {
      const accentue = await api()
        .post('/api/tournois')
        .set('Authorization', `Bearer ${jetonAdmin}`)
        .send({ nom: 'Coupe d Été Zorglub', jeu: 'Valorant' });
      tournoiAccentueId = accentue.body.id;

      const rocket = await api()
        .post('/api/tournois')
        .set('Authorization', `Bearer ${jetonAdmin}`)
        .send({ nom: 'Tournoi Zorglub du soir', jeu: 'Rocket League' });
      tournoiRocketId = rocket.body.id;
    });

    const idsTrouves = async (requete: string): Promise<number[]> => {
      const reponse = await api().get(`/api/tournois?${requete}`);
      expect(reponse.status).toBe(200);
      return reponse.body.map((t: { id: number }) => t.id);
    };

    it('B-02 : la recherche ignore la casse et les accents, dans la requete comme dans le nom', async () => {
      expect(await idsTrouves('q=ETE%20zorglub')).toEqual([tournoiAccentueId]);
      expect(await idsTrouves(`q=${encodeURIComponent('été ZORGLUB')}`)).toEqual([tournoiAccentueId]);
    });

    it('B-02 : la recherche porte aussi sur le jeu', async () => {
      expect(await idsTrouves('q=rocket')).toEqual([tournoiRocketId]);
    });

    it('B-02 : la recherche se combine avec les filtres jeu et etat', async () => {
      expect(await idsTrouves('q=zorglub&jeu=Valorant')).toEqual([tournoiAccentueId]);
      expect(await idsTrouves('q=zorglub&etat=inscriptions_ouvertes')).toEqual([
        tournoiAccentueId,
        tournoiRocketId,
      ]);
      expect(await idsTrouves('q=zorglub&etat=en_cours')).toEqual([]);
    });
  });
});
