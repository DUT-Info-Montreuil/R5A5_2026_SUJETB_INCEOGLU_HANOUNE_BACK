import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { users, credentials } from '../models/fakeData';
import { User } from '../models/types';
import { requireAuth } from '../middleware/auth';

const router = Router();

/**
 * @openapi
 * /api/auth/register:
 *   post:
 *     summary: Creer un compte
 *     description: Accessible a tous. Le compte est cree avec le role joueur. Le mot de passe est hashe avec bcrypt et n'est jamais renvoye.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nom, email, password]
 *             properties:
 *               nom:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *           example:
 *             nom: Sami
 *             email: sami@iut.fr
 *             password: motdepasse
 *     responses:
 *       201:
 *         description: Compte cree
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       400:
 *         description: nom, email ou password manquant
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       409:
 *         description: Email deja utilise
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 */
// POST /api/auth/register — inscription publique
router.post('/register', async (req, res) => {
  const { nom, email, password } = req.body ?? {};

  if (!nom || !email || !password) {
    return res.status(400).json({ message: 'nom, email et password sont obligatoires' });
  }

  if (users.some((u) => u.email === email)) {
    return res.status(409).json({ message: 'Cet email est deja utilise' });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const newUser: User = {
    id: users.length + 1,
    nom,
    email,
    role: 'joueur',
  };

  // Le hash est stocke a part, l'objet User ne le contient jamais
  users.push(newUser);
  credentials.push({ userId: newUser.id, passwordHash });

  res.status(201).json(newUser);
});

/**
 * @openapi
 * /api/auth/login:
 *   post:
 *     summary: Se connecter
 *     description: "Accessible a tous. Renvoie un JWT (valable 24h) a envoyer ensuite dans l'en-tete Authorization: Bearer <token>. Le meme message d'erreur est renvoye que l'email soit inconnu ou le mot de passe faux."
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *           examples:
 *             joueur:
 *               summary: Compte joueur de test
 *               value:
 *                 email: zeki@iut.fr
 *                 password: motdepasse
 *             administrateur:
 *               summary: Compte administrateur de test
 *               value:
 *                 email: admin@iut.fr
 *                 password: motdepasse
 *     responses:
 *       200:
 *         description: Connexion reussie
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: email ou password manquant
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       401:
 *         description: Email ou mot de passe incorrect
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 */
// POST /api/auth/login — connexion publique
router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    return res.status(400).json({ message: 'email et password sont obligatoires' });
  }

  // Meme message dans tous les cas d'echec pour ne pas reveler quels emails existent
  const erreur = { message: 'Email ou mot de passe incorrect' };

  const user = users.find((u) => u.email === email);
  if (!user) return res.status(401).json(erreur);

  const credential = credentials.find((c) => c.userId === user.id);
  if (!credential) return res.status(401).json(erreur);

  const motDePasseValide = await bcrypt.compare(password, credential.passwordHash);
  if (!motDePasseValide) return res.status(401).json(erreur);

  const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET as string, {
    expiresIn: '24h',
  });

  res.json({ token, user });
});

/**
 * @openapi
 * /api/auth/me:
 *   get:
 *     summary: Utilisateur connecte
 *     description: Reserve aux utilisateurs connectes. Renvoie l'utilisateur correspondant au token.
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: L'utilisateur connecte
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         description: Token absent, invalide ou expire
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       404:
 *         description: Utilisateur introuvable (ex. compte cree avant un redemarrage, les donnees etant en memoire)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 */
// GET /api/auth/me — utilisateur courant (connecte)
router.get('/me', requireAuth, (req, res) => {
  const user = users.find((u) => u.id === req.user!.userId);
  if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });
  res.json(user);
});

export default router;
