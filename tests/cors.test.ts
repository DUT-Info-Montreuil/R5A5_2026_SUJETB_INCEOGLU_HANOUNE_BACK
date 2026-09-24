import request from 'supertest';
import type { Express } from 'express';

// L'origine autorisee est lue dans process.env.FRONT_URL au chargement de src/app.ts :
// on la fixe donc avant d'importer l'application. dotenv n'ecrase pas une variable
// deja definie, ce test reste donc valable quel que soit le contenu du .env local.
const FRONT_URL = 'http://localhost:5173';
process.env.FRONT_URL = FRONT_URL;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const app: Express = require('../src/app').default;

// Securite : le navigateur ne doit accepter les reponses de l'API que pour le front declare.
describe('CORS', () => {
  it("autorise le front declare dans FRONT_URL (en-tete Access-Control-Allow-Origin)", async () => {
    const reponse = await request(app).get('/health').set('Origin', FRONT_URL);

    expect(reponse.status).toBe(200);
    expect(reponse.headers['access-control-allow-origin']).toBe(FRONT_URL);
  });

  it("n'autorise pas une origine inconnue : Access-Control-Allow-Origin ne reprend jamais l'origine appelante", async () => {
    const origineInconnue = 'http://site-malveillant.example';
    const reponse = await request(app).get('/health').set('Origin', origineInconnue);

    // Avec une origine configuree en chaine, cors renvoie toujours cette valeur fixe :
    // l'en-tete est present mais ne vaut pas l'origine appelante, et le navigateur
    // refuse alors la reponse. Le point a verifier est donc l'absence de reflexion
    // de l'origine, pas l'absence de l'en-tete.
    expect(reponse.headers['access-control-allow-origin']).not.toBe(origineInconnue);
    expect(reponse.headers['access-control-allow-origin']).toBe(FRONT_URL);
  });
});
