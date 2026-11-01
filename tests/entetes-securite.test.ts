import { api } from './api';

// Securite : en-tetes poses par helmet. Socket.io, branche sur le meme serveur HTTP,
// est couvert par temps-reel.test.ts, qui tourne avec cette meme application.
describe('En-tetes de securite (helmet)', () => {
  it("pose les en-tetes de protection et ne revele pas la techno du serveur", async () => {
    const reponse = await api().get('/api/tournois');

    expect(reponse.status).toBe(200);
    expect(reponse.headers['x-content-type-options']).toBe('nosniff');
    expect(reponse.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(reponse.headers['content-security-policy']).toContain("default-src 'self'");
    expect(reponse.headers).not.toHaveProperty('x-powered-by');
  });

  it("garde Swagger utilisable : la page et ses scripts sont servis, sans script inline bloque par la CSP", async () => {
    const page = await api().get('/api-docs/');

    expect(page.status).toBe(200);
    const csp = page.headers['content-security-policy'];
    expect(csp).toContain("script-src 'self'");
    // En http, upgrade-insecure-requests ferait charger les scripts en https : page blanche
    expect(csp).not.toContain('upgrade-insecure-requests');
    // Tout script de la page a un src : la CSP script-src 'self' n'en bloque aucun
    expect(page.text).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/);

    const init = await api().get('/api-docs/swagger-ui-init.js');
    expect(init.status).toBe(200);
  });
});
