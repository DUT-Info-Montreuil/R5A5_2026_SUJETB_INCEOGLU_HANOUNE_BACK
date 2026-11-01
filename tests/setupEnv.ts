import dotenv from 'dotenv';

// Execute par jest avant chaque fichier de test (setupFiles).
// Sans .env, JWT_SECRET est absent et la connexion echoue en 500 : on fixe une valeur
// de test, SEULEMENT si ni l'environnement ni .env n'en fournissent une.
dotenv.config({ quiet: true });
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'secret-de-test-uniquement';
}

// Base en memoire, impose meme si .env fixe DB_PATH : les tests ne touchent jamais
// data/tournois.db. Chaque fichier de test a son propre registre de modules, donc sa
// propre base, vide puis remplie du jeu de demonstration (src/db/connexion.ts).
process.env.DB_PATH = ':memory:';
