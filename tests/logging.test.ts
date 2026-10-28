import request from 'supertest';
import app from '../src/app';
import { logger, resoudreNiveau } from '../src/logger';

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
    await request(app).get('/health').expect(200);

    expect(requetesJournalisees()).toHaveLength(0);
  });

  it('ne journalise pas /api-docs', async () => {
    await request(app).get('/api-docs/');
    await request(app).get('/api-docs/swagger-ui.css');

    expect(requetesJournalisees()).toHaveLength(0);
  });

  it('journalise toujours les requetes de l API', async () => {
    await request(app).get('/api/tournois').expect(200);

    const requetes = requetesJournalisees();
    expect(requetes).toHaveLength(1);
    expect(requetes[0]).toMatchObject({ methode: 'GET', chemin: '/api/tournois', statut: 200 });
  });

  it('un chemin qui commence comme une route ignoree reste journalise', async () => {
    await request(app).get('/healthz');

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
