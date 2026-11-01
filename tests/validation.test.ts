import { api } from './api';
import { COMPTES, MOT_DE_PASSE, connexion, creerEquipe, creerTournoi, rejoindreEquipe } from './helpers';

// Robustesse : tout texte recu doit etre une chaine non vide apres trim et de longueur bornee.
// Sinon 400, et rien n'est ecrit : chaque refus verifie que l'etat est inchange.
describe('Validation des entrees', () => {
  let jetonAdmin: string;
  let jetonCapitaine: string; // Zeki
  let jetonMembre: string; // Hanoune

  let tournoiId: number;
  let equipeId: number;

  beforeAll(async () => {
    jetonAdmin = await connexion(COMPTES.admin);
    jetonCapitaine = await connexion(COMPTES.zeki);
    jetonMembre = await connexion(COMPTES.hanoune);

    tournoiId = await creerTournoi(jetonAdmin, 'Tournoi de test - validation');
    equipeId = await creerEquipe(jetonCapitaine, tournoiId, 'Equipe validation');
    await rejoindreEquipe(jetonMembre, jetonCapitaine, equipeId);
  });

  const texteDe = (longueur: number) => 'a'.repeat(longueur);

  describe('inscription', () => {
    // Un compte refuse ne doit pas exister : la meme inscription, valide cette fois, passe en 201
    async function inscrire(corps: object) {
      return api().post('/api/auth/register').send(corps);
    }

    it.each([
      ['nom objet', { nom: { $ne: '' }, email: 'v1@iut.fr', password: MOT_DE_PASSE }, 'v1@iut.fr'],
      ['nom vide apres trim', { nom: '   ', email: 'v2@iut.fr', password: MOT_DE_PASSE }, 'v2@iut.fr'],
      ['nom de 51 caracteres', { nom: texteDe(51), email: 'v3@iut.fr', password: MOT_DE_PASSE }, 'v3@iut.fr'],
      ['email tableau', { nom: 'Valide', email: ['v4@iut.fr'], password: MOT_DE_PASSE }, 'v4@iut.fr'],
      ['password nombre', { nom: 'Valide', email: 'v5@iut.fr', password: 12345678 }, 'v5@iut.fr'],
      ['password de 7 caracteres', { nom: 'Valide', email: 'v6@iut.fr', password: '1234567' }, 'v6@iut.fr'],
      ['password de 8 espaces', { nom: 'Valide', email: 'v7@iut.fr', password: '        ' }, 'v7@iut.fr'],
      ['password de plus de 72 octets', { nom: 'Valide', email: 'v8@iut.fr', password: texteDe(73) }, 'v8@iut.fr'],
    ])('refuse %s (400) sans creer de compte', async (_cas, corps, email) => {
      const reponse = await inscrire(corps);
      expect(reponse.status).toBe(400);

      // Etat inchange : l'email est toujours libre
      const ensuite = await inscrire({ nom: 'Valide', email, password: MOT_DE_PASSE });
      expect(ensuite.status).toBe(201);
    });

    it('accepte un mot de passe de 8 caracteres exactement et enregistre le nom sans espaces autour', async () => {
      const reponse = await inscrire({ nom: '  Nadia  ', email: 'huit@iut.fr', password: '12345678' });

      expect(reponse.status).toBe(201);
      expect(reponse.body.nom).toBe('Nadia');
      await connexion('huit@iut.fr', '12345678');
    });
  });

  describe('connexion', () => {
    it('refuse un password qui n est pas un texte (400 et non 500)', async () => {
      const reponse = await api().post('/api/auth/login').send({ email: COMPTES.zeki, password: 1234 });

      expect(reponse.status).toBe(400);
      expect(reponse.body).not.toHaveProperty('token');
    });

    it('refuse un email objet (400)', async () => {
      const reponse = await api()
        .post('/api/auth/login')
        .send({ email: { $gt: '' }, password: MOT_DE_PASSE });

      expect(reponse.status).toBe(400);
      expect(reponse.body).not.toHaveProperty('token');
    });
  });

  describe('tournois', () => {
    it.each([
      ['nom objet', { nom: { a: 1 }, jeu: 'Valorant' }],
      ['jeu vide apres trim', { nom: 'Coupe', jeu: '  ' }],
      ['nom de 51 caracteres', { nom: texteDe(51), jeu: 'Valorant' }],
      ['jeu tableau', { nom: 'Coupe', jeu: ['Valorant'] }],
    ])('refuse %s (400) sans creer de tournoi', async (_cas, corps) => {
      const avant = await api().get('/api/tournois');

      const reponse = await api()
        .post('/api/tournois')
        .set('Authorization', `Bearer ${jetonAdmin}`)
        .send(corps);

      expect(reponse.status).toBe(400);
      const apres = await api().get('/api/tournois');
      expect(apres.body).toHaveLength(avant.body.length);
    });
  });

  describe('equipes', () => {
    it.each([
      ['nom objet', { a: 1 }],
      ['nom vide apres trim', '   '],
      ['nom de 51 caracteres', texteDe(51)],
    ])('refuse a la creation un %s (400) sans creer d equipe', async (_cas, nom) => {
      const autreTournoi = await creerTournoi(jetonAdmin, 'Tournoi de test - validation creation');

      const reponse = await api()
        .post('/api/equipes')
        .set('Authorization', `Bearer ${jetonCapitaine}`)
        .send({ tournoiId: autreTournoi, nom });

      expect(reponse.status).toBe(400);
      const engagees = await api().get(`/api/tournois/${autreTournoi}/equipes`);
      expect(engagees.body).toHaveLength(0);
    });

    it.each([
      ['nom objet', { a: 1 }],
      ['nom vide apres trim', '   '],
      ['nom de 51 caracteres', texteDe(51)],
    ])('refuse au renommage un %s (400), le nom est inchange', async (_cas, nom) => {
      const reponse = await api()
        .patch(`/api/equipes/${equipeId}`)
        .set('Authorization', `Bearer ${jetonCapitaine}`)
        .send({ nom });

      expect(reponse.status).toBe(400);
      const apres = await api().get(`/api/equipes/${equipeId}`);
      expect(apres.body.nom).toBe('Equipe validation');
    });

    it.each([
      ['roleJeu objet', { a: 1 }],
      ['roleJeu vide apres trim', '   '],
      ['roleJeu de 51 caracteres', texteDe(51)],
    ])('refuse un %s (400), le role est inchange', async (_cas, roleJeu) => {
      const reponse = await api()
        .patch(`/api/equipes/${equipeId}/membres/3`)
        .set('Authorization', `Bearer ${jetonCapitaine}`)
        .send({ roleJeu });

      expect(reponse.status).toBe(400);
      const apres = await api().get(`/api/equipes/${equipeId}`);
      expect(apres.body.membres.find((m: { userId: number }) => m.userId === 3).roleJeu).toBeNull();
    });

    it('controle d acces avant validation : un non-capitaine recoit 403, pas 400, meme avec un nom invalide', async () => {
      const reponse = await api()
        .patch(`/api/equipes/${equipeId}`)
        .set('Authorization', `Bearer ${jetonMembre}`)
        .send({ nom: { a: 1 } });

      expect(reponse.status).toBe(403);
      const apres = await api().get(`/api/equipes/${equipeId}`);
      expect(apres.body.nom).toBe('Equipe validation');
    });
  });

  describe('messages', () => {
    async function messagesDeLEquipe() {
      const reponse = await api()
        .get(`/api/equipes/${equipeId}/messages`)
        .set('Authorization', `Bearer ${jetonMembre}`);
      return reponse.body as { contenu: string }[];
    }

    it.each([
      ['contenu objet', { texte: 'injection' }],
      ['contenu tableau', ['a', 'b']],
      ['contenu nombre', 42],
      ['contenu vide apres trim', '  \n  '],
      ['contenu de 1001 caracteres', texteDe(1001)],
    ])('refuse un %s (400) sans enregistrer de message', async (_cas, contenu) => {
      const avant = await messagesDeLEquipe();

      const reponse = await api()
        .post(`/api/equipes/${equipeId}/messages`)
        .set('Authorization', `Bearer ${jetonCapitaine}`)
        .send({ contenu });

      expect(reponse.status).toBe(400);
      expect(await messagesDeLEquipe()).toHaveLength(avant.length);
    });

    it('accepte un message de 1000 caracteres exactement', async () => {
      const reponse = await api()
        .post(`/api/equipes/${equipeId}/messages`)
        .set('Authorization', `Bearer ${jetonCapitaine}`)
        .send({ contenu: texteDe(1000) });

      expect(reponse.status).toBe(201);
    });
  });
});
