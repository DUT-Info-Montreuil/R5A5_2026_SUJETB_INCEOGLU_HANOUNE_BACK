import dotenv from 'dotenv';

// Execute par jest avant chaque fichier de test (setupFiles).
// Sans .env, JWT_SECRET est absent et la connexion echoue en 500 : on fixe une valeur
// de test, SEULEMENT si ni l'environnement ni .env n'en fournissent une.
dotenv.config({ quiet: true });
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'secret-de-test-uniquement';
}
