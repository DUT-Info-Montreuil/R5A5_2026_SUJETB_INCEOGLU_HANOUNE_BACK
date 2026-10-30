import { logger } from '../src/logger';

// La limite est lue dans process.env.LIMITE_CONNEXIONS au chargement du limiteur : on la fixe
// avant d'importer l'application. Jest donne a ce fichier son propre registre de modules,
// les autres fichiers gardent donc la limite tres haute du mode test.
const LIMITE = 3;
process.env.LIMITE_CONNEXIONS = String(LIMITE);

// api et helpers chargent l'application : ils sont donc importes apres la variable
/* eslint-disable @typescript-eslint/no-var-requires */
const { api } = require('./api') as typeof import('./api');
const { COMPTES, MOT_DE_PASSE } = require('./helpers') as typeof import('./helpers');
/* eslint-enable @typescript-eslint/no-var-requires */

// Securite : un attaquant ne peut pas tester des mots de passe en rafale depuis une meme IP.
describe('Limite de tentatives de connexion', () => {
  // Place en premier : le compteur de l'IP est partage par les tests du fichier
  it('ne compte pas les connexions reussies : un utilisateur legitime n est jamais bloque', async () => {
    for (let essai = 0; essai < LIMITE + 2; essai++) {
      const reponse = await api().post('/api/auth/login').send({ email: COMPTES.zeki, password: MOT_DE_PASSE });
      expect(reponse.status).toBe(200);
    }
  });

  it('refuse en 429 au-dela de la limite, meme avec le bon mot de passe, et journalise le refus', async () => {
    for (let essai = 0; essai < LIMITE; essai++) {
      const reponse = await api()
        .post('/api/auth/login')
        .send({ email: COMPTES.zeki, password: 'mauvais_mot_de_passe' });
      expect(reponse.status).toBe(401);
    }

    const espion = jest.spyOn(logger, 'warn');
    try {
      // Le bon mot de passe ne passe plus : la limite ne doit pas servir d'oracle
      const reponse = await api()
        .post('/api/auth/login')
        .send({ email: COMPTES.zeki, password: MOT_DE_PASSE });

      expect(reponse.status).toBe(429);
      expect(reponse.body).toEqual({ message: 'Trop de tentatives de connexion, reessayez plus tard' });
      expect(reponse.body).not.toHaveProperty('token');
      expect(espion).toHaveBeenCalledWith(
        'Acces refuse : trop de tentatives de connexion',
        expect.objectContaining({ motif: 'limite_connexions', methode: 'POST', chemin: '/api/auth/login' })
      );
      // Ni l'email ni le mot de passe tentes dans le journal
      const journal = JSON.stringify(espion.mock.calls);
      expect(journal).not.toContain(MOT_DE_PASSE);
      expect(journal).not.toContain(COMPTES.zeki);
    } finally {
      espion.mockRestore();
    }
  });

  it("ne limite que la connexion : les autres routes restent accessibles", async () => {
    // Epuise la limite, que le test precedent ait tourne ou non
    for (let essai = 0; essai <= LIMITE; essai++) {
      await api().post('/api/auth/login').send({ email: COMPTES.zeki, password: 'mauvais_mot_de_passe' });
    }

    const reponse = await api().get('/api/tournois');

    expect(reponse.status).toBe(200);
  });
});
