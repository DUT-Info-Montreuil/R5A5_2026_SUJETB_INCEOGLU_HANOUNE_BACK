import http from 'http';
import request from 'supertest';
import app from '../src/app';

// Point d'entree HTTP des tests : api().get(...), api().post(...)...
//
// request(app) ouvre un serveur sur un port ephemere a chaque requete, puis le ferme.
// Sur les milliers de requetes de la suite, une sur quelques milliers echoue en "socket hang up"
// (mesure hors suite : 4 echecs sur 30 000 requetes, 0 sur 30 000 avec un serveur unique),
// ce qui faisait echouer un test au hasard une execution sur quelques-unes.
// Un seul serveur, ouvert au premier appel et ferme apres le dernier test du fichier,
// supprime cette cause. Jest donne a chaque fichier son propre registre de modules,
// donc son propre serveur.
let serveur: http.Server | null = null;

export function api() {
  // listen(0) sans hote reserve le port immediatement : address() est connue des le retour,
  // supertest reutilise alors ce serveur au lieu d'en ouvrir un nouveau
  serveur ??= http.createServer(app).listen(0);
  return request(serveur);
}

afterAll(async () => {
  if (!serveur) return;
  // Ferme aussi les connexions keep-alive restees ouvertes, sinon close() attendrait leur expiration
  serveur.closeAllConnections();
  await new Promise<void>((resolve) => serveur!.close(() => resolve()));
});
