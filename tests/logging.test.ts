import { api } from './api';
import { logger, resoudreNiveau } from '../src/logger';
import { COMPTES, MOT_DE_PASSE, connexion, creerEquipe, creerTournoi, deposerDemande } from './helpers';

// Journalisation : les routes techniques ne polluent pas le journal, les autres y figurent.
describe('Journalisation', () => {
  let espion: jest.SpyInstance;

  beforeEach(() => {
    espion = jest.spyOn(logger, 'log');
  });

  afterEach(() => {
    espion.mockRestore();
  });

  const requetesJournalisees = () =>
    espion.mock.calls.filter(([, message]) => message === 'Requete HTTP').map(([, , meta]) => meta);

  it('ne journalise pas /health', async () => {
    await api().get('/health').expect(200);

    expect(requetesJournalisees()).toHaveLength(0);
  });

  it('ne journalise pas /api-docs', async () => {
    await api().get('/api-docs/');
    await api().get('/api-docs/swagger-ui.css');

    expect(requetesJournalisees()).toHaveLength(0);
  });

  it('journalise toujours les requetes de l API', async () => {
    await api().get('/api/tournois').expect(200);

    const requetes = requetesJournalisees();
    expect(requetes).toHaveLength(1);
    expect(requetes[0]).toMatchObject({ methode: 'GET', chemin: '/api/tournois', statut: 200 });
  });

  it('un chemin qui commence comme une route ignoree reste journalise', async () => {
    await api().get('/healthz');

    expect(requetesJournalisees()).toHaveLength(1);
  });
});

describe('Niveau de log (LOG_LEVEL)', () => {
  it('accepte un niveau valide, quelle que soit la casse', () => {
    expect(resoudreNiveau('debug')).toBe('debug');
    expect(resoudreNiveau(' WARN ')).toBe('warn');
  });

  it('retombe sur info quand la valeur est absente ou inconnue', () => {
    expect(resoudreNiveau(undefined)).toBe('info');
    expect(resoudreNiveau('')).toBe('info');
    expect(resoudreNiveau('bavard')).toBe('info');
  });
});

// Regle : tout refus 401/403/409/429 laisse une ligne warn, avec de quoi enqueter
// (userId, methode, chemin, ids, motif) mais sans secret ni donnee saisie.
describe('Journalisation des refus', () => {
  let jetonAdmin: string;
  let jetonCapitaine: string;
  let jetonSami: string;
  let espion: jest.SpyInstance;

  beforeAll(async () => {
    jetonAdmin = await connexion(COMPTES.admin);
    jetonCapitaine = await connexion(COMPTES.zeki);
    jetonSami = await connexion(COMPTES.sami);
  });

  beforeEach(() => {
    espion = jest.spyOn(logger, 'warn');
  });

  afterEach(() => {
    espion.mockRestore();
  });

  const MESSAGE_CONFLIT = 'Requete refusee : etat incompatible';

  it('409 tournoi : cloture refusee, journalisee avec userId, methode, chemin, tournoiId et motif', async () => {
    const tournoiId = await creerTournoi(jetonAdmin, 'Tournoi de test - refus journalise');

    const reponse = await api()
      .patch(`/api/tournois/${tournoiId}/cloturer`)
      .set('Authorization', `Bearer ${jetonAdmin}`);

    expect(reponse.status).toBe(409);
    expect(espion).toHaveBeenCalledWith(MESSAGE_CONFLIT, {
      userId: 1,
      methode: 'PATCH',
      chemin: `/api/tournois/${tournoiId}/cloturer`,
      tournoiId,
      nombreEquipes: 0,
      motif: 'nombre_equipes_incorrect',
    });
    const apres = await api().get(`/api/tournois/${tournoiId}`);
    expect(apres.body.etat).toBe('inscriptions_ouvertes');
  });

  it('409 equipe : seconde demande refusee, journalisee avec equipeId et motif', async () => {
    const tournoiId = await creerTournoi(jetonAdmin, 'Tournoi de test - demande en double');
    const equipeId = await creerEquipe(jetonCapitaine, tournoiId, 'Equipe demande en double');
    await deposerDemande(jetonSami, equipeId);

    const reponse = await api()
      .post(`/api/equipes/${equipeId}/demandes`)
      .set('Authorization', `Bearer ${jetonSami}`);

    expect(reponse.status).toBe(409);
    expect(espion).toHaveBeenCalledWith(
      MESSAGE_CONFLIT,
      expect.objectContaining({ userId: 5, methode: 'POST', equipeId, motif: 'demande_deja_en_attente' })
    );
    const enAttente = await api()
      .get(`/api/equipes/${equipeId}/demandes`)
      .set('Authorization', `Bearer ${jetonCapitaine}`);
    expect(enAttente.body).toHaveLength(1);
  });

  it("409 inscription : email deja utilise, journalise sans l'email", async () => {
    const reponse = await api()
      .post('/api/auth/register')
      .send({ nom: 'Doublon', email: COMPTES.zeki, password: 'un_autre_mot_de_passe' });

    expect(reponse.status).toBe(409);
    expect(espion).toHaveBeenCalledWith(MESSAGE_CONFLIT, expect.objectContaining({ motif: 'email_deja_utilise' }));
    const journal = JSON.stringify(espion.mock.calls);
    expect(journal).not.toContain(COMPTES.zeki);
    expect(journal).not.toContain('un_autre_mot_de_passe');
    // Le compte existant n'est pas ecrase : l'ancien mot de passe fonctionne toujours
    await connexion(COMPTES.zeki, MOT_DE_PASSE);
  });

  it('401 connexion echouee : journalisee avec le motif, sans email ni mot de passe', async () => {
    const reponse = await api()
      .post('/api/auth/login')
      .send({ email: COMPTES.zeki, password: 'mauvais_mot_de_passe' });

    expect(reponse.status).toBe(401);
    expect(espion).toHaveBeenCalledWith(
      'Acces refuse : connexion echouee',
      expect.objectContaining({ motif: 'mot_de_passe_incorrect', userId: 2, chemin: '/api/auth/login' })
    );
    const journal = JSON.stringify(espion.mock.calls);
    expect(journal).not.toContain('mauvais_mot_de_passe');
    expect(journal).not.toContain(COMPTES.zeki);
  });

  it("403 droits insuffisants : journalise avec userId, methode, chemin et equipeId", async () => {
    const tournoiId = await creerTournoi(jetonAdmin, 'Tournoi de test - 403 journalise');
    const equipeId = await creerEquipe(jetonCapitaine, tournoiId, 'Equipe 403');

    const reponse = await api()
      .patch(`/api/equipes/${equipeId}`)
      .set('Authorization', `Bearer ${jetonSami}`)
      .send({ nom: 'Nom vole' });

    expect(reponse.status).toBe(403);
    expect(espion).toHaveBeenCalledWith(
      'Acces refuse : droits insuffisants',
      expect.objectContaining({ userId: 5, methode: 'PATCH', chemin: `/api/equipes/${equipeId}`, equipeId })
    );
    const apres = await api().get(`/api/equipes/${equipeId}`);
    expect(apres.body.nom).toBe('Equipe 403');
  });
});
