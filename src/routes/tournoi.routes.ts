import { Router } from 'express';
import { tournois, equipes, matchs } from '../models/fakeData';
import { Tournoi } from '../models/types';
import { logger } from '../logger';

const router = Router();

/**
 * @openapi
 * /api/tournois:
 *   get:
 *     summary: Lister les tournois
 *     description: Accessible a tous, y compris les visiteurs non connectes (B-02). Filtres optionnels par jeu et par etat.
 *     tags: [Tournois]
 *     parameters:
 *       - in: query
 *         name: jeu
 *         schema:
 *           type: string
 *         description: Nom exact du jeu
 *         example: Valorant
 *       - in: query
 *         name: etat
 *         schema:
 *           type: string
 *           enum: [inscriptions_ouvertes, inscriptions_closes, en_cours, termine]
 *         description: Etat du tournoi
 *     responses:
 *       200:
 *         description: Liste des tournois (eventuellement vide)
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Tournoi'
 */
// GET /api/tournois — liste publique (B-02)
router.get('/', (req, res) => {
  const { jeu, etat } = req.query;
  let resultat = tournois;

  if (jeu) resultat = resultat.filter((t) => t.jeu === jeu);
  if (etat) resultat = resultat.filter((t) => t.etat === etat);

  res.json(resultat);
});

/**
 * @openapi
 * /api/tournois/{id}:
 *   get:
 *     summary: Detail d'un tournoi
 *     description: Accessible a tous, y compris les visiteurs non connectes (B-02).
 *     tags: [Tournois]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Identifiant du tournoi
 *     responses:
 *       200:
 *         description: Le tournoi
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Tournoi'
 *       404:
 *         description: Tournoi introuvable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 */
// GET /api/tournois/:id — detail public (B-02)
router.get('/:id', (req, res) => {
  const tournoi = tournois.find((t) => t.id === Number(req.params.id));
  if (!tournoi) return res.status(404).json({ message: 'Tournoi introuvable' });
  res.json(tournoi);
});

/**
 * @openapi
 * /api/tournois:
 *   post:
 *     summary: Creer un tournoi
 *     description: Reserve a l'administrateur (B-01). Le tournoi est cree avec l'etat inscriptions_ouvertes.
 *     tags: [Tournois]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nom, jeu]
 *             properties:
 *               nom:
 *                 type: string
 *               jeu:
 *                 type: string
 *           example:
 *             nom: Coupe IUT Hiver
 *             jeu: Rocket League
 *     responses:
 *       201:
 *         description: Tournoi cree
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Tournoi'
 *       400:
 *         description: nom et jeu sont obligatoires
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 */
// POST /api/tournois — creation (B-01)
router.post('/', (req, res) => {
  // TODO: requireRole('administrateur')
  const { nom, jeu } = req.body;
  if (!nom || !jeu) {
    return res.status(400).json({ message: 'nom et jeu sont obligatoires' });
  }

  const nouveau: Tournoi = {
    id: Math.max(0, ...tournois.map((t) => t.id)) + 1,
    nom,
    jeu,
    etat: 'inscriptions_ouvertes',
  };

  tournois.push(nouveau);
  logger.info('Tournoi cree', { tournoiId: nouveau.id, userId: req.user?.userId });
  res.status(201).json(nouveau);
});

/**
 * @openapi
 * /api/tournois/{id}/cloturer:
 *   patch:
 *     summary: Cloturer les inscriptions
 *     description: Reserve a l'administrateur (B-03, B-12). Passe le tournoi de inscriptions_ouvertes a inscriptions_closes.
 *     tags: [Tournois]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Identifiant du tournoi
 *     responses:
 *       200:
 *         description: Inscriptions cloturees, tournoi mis a jour
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Tournoi'
 *       404:
 *         description: Tournoi introuvable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       409:
 *         description: Les inscriptions ne sont pas ouvertes
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 */
// PATCH /api/tournois/:id/cloturer — cloture des inscriptions (B-03, B-12)
router.patch('/:id/cloturer', (req, res) => {
  // TODO: requireRole('administrateur')
  const tournoi = tournois.find((t) => t.id === Number(req.params.id));
  if (!tournoi) return res.status(404).json({ message: 'Tournoi introuvable' });

  if (tournoi.etat !== 'inscriptions_ouvertes') {
    return res.status(409).json({ message: 'Les inscriptions ne sont pas ouvertes' });
  }

  tournoi.etat = 'inscriptions_closes';
  logger.info('Inscriptions cloturees', { tournoiId: tournoi.id, userId: req.user?.userId });
  // TODO: generer l'arbre a partir des equipes engagees (B-12)
  res.json(tournoi);
});

/**
 * @openapi
 * /api/tournois/{id}/lancer:
 *   patch:
 *     summary: Lancer le tournoi
 *     description: Reserve a l'administrateur (B-04). Passe le tournoi de inscriptions_closes a en_cours.
 *     tags: [Tournois]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Identifiant du tournoi
 *     responses:
 *       200:
 *         description: Tournoi lance
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Tournoi'
 *       404:
 *         description: Tournoi introuvable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       409:
 *         description: Les inscriptions doivent etre closes
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 */
// PATCH /api/tournois/:id/lancer — demarrage (B-04)
router.patch('/:id/lancer', (req, res) => {
  // TODO: requireRole('administrateur')
  const tournoi = tournois.find((t) => t.id === Number(req.params.id));
  if (!tournoi) return res.status(404).json({ message: 'Tournoi introuvable' });

  if (tournoi.etat !== 'inscriptions_closes') {
    return res.status(409).json({ message: 'Les inscriptions doivent etre closes' });
  }

  tournoi.etat = 'en_cours';
  logger.info('Tournoi lance', { tournoiId: tournoi.id, userId: req.user?.userId });
  // TODO: les equipes incompletes sont forfait sur leur premier match (B-04)
  res.json(tournoi);
});

/**
 * @openapi
 * /api/tournois/{id}/equipes:
 *   get:
 *     summary: Equipes engagees dans un tournoi
 *     description: Accessible a tous, y compris les visiteurs (B-06). Renvoie une liste vide si le tournoi n'existe pas.
 *     tags: [Tournois, Equipes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Identifiant du tournoi
 *     responses:
 *       200:
 *         description: Liste des equipes du tournoi (eventuellement vide)
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Equipe'
 */
// GET /api/tournois/:id/equipes — equipes engagees (B-06)
router.get('/:id/equipes', (req, res) => {
  const tournoiId = Number(req.params.id);
  res.json(equipes.filter((e) => e.tournoiId === tournoiId));
});

/**
 * @openapi
 * /api/tournois/{id}/matchs:
 *   get:
 *     summary: Arbre des matchs d'un tournoi
 *     description: Accessible a tous, y compris les visiteurs (B-02, B-19). Renvoie une liste vide si le tournoi n'existe pas.
 *     tags: [Tournois, Matchs]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Identifiant du tournoi
 *     responses:
 *       200:
 *         description: Liste des matchs du tournoi (eventuellement vide)
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Match'
 */
// GET /api/tournois/:id/matchs — l'arbre (B-02, B-19)
router.get('/:id/matchs', (req, res) => {
  const tournoiId = Number(req.params.id);
  res.json(matchs.filter((m) => m.tournoiId === tournoiId));
});

export default router;
