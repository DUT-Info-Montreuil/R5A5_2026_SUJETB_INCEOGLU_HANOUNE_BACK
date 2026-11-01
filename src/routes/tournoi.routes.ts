import { Router } from 'express';
import { logger } from '../logger';
import { requireAuth, requireRole } from '../middleware/auth';
import { NOMBRE_EQUIPES_REQUIS } from '../services/bracket.service';
import { lancerTournoi } from '../services/match.service';
import { cloturerEtGenererArbre } from '../services/tournoi.service';
import { creerTournoi, listerTournois, trouverTournoi } from '../db/tournois.repository';
import { listerEquipesDuTournoi } from '../db/equipes.repository';
import { listerMatchsDuTournoi } from '../db/matchs.repository';
import { diffuserMatchs, diffuserTournoi } from '../realtime/diffusion';
import { refuserConflit } from '../refus';
import { NOM, lireTextes } from '../validation';

const router = Router();

/**
 * @openapi
 * /api/tournois:
 *   get:
 *     summary: Lister les tournois
 *     description: >
 *       Accessible a tous, y compris les visiteurs non connectes (B-02).
 *       Recherche et filtres optionnels, combinables entre eux.
 *     tags: [Tournois]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Texte recherche dans le nom et le jeu, sans tenir compte de la casse ni des accents
 *         example: coupe ete
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
// Minuscules sans diacritiques : une recherche "ete" retrouve un nom ecrit avec accents
function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// GET /api/tournois — liste publique et recherche (B-02)
router.get('/', (req, res) => {
  const { jeu, etat, q } = req.query;
  // Un filtre repete dans l'URL donne un tableau : comme avant, il ne correspond a aucun tournoi
  if ((jeu && typeof jeu !== 'string') || (etat && typeof etat !== 'string')) return res.json([]);

  // Filtres exacts en SQL, recherche textuelle ci-dessous
  let resultat = listerTournois({ jeu: jeu || undefined, etat: etat || undefined });

  // ?q= repete dans l'URL donne un tableau : on ne retient que les chaines.
  // La recherche sans accents se fait ici : SQLite ne sait pas retirer les diacritiques.
  const recherche = typeof q === 'string' ? normaliser(q.trim()) : '';
  if (recherche) {
    resultat = resultat.filter(
      (t) => normaliser(t.nom).includes(recherche) || normaliser(t.jeu).includes(recherche)
    );
  }

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
  const tournoi = trouverTournoi(Number(req.params.id));
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
 *     security:
 *       - bearerAuth: []
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
 *                 maxLength: 50
 *               jeu:
 *                 type: string
 *                 maxLength: 50
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
 *         description: nom et jeu doivent etre des textes non vides de 50 caracteres maximum
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       401:
 *         description: Token absent, invalide ou expire
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       403:
 *         description: Reserve a l'administrateur
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 */
// POST /api/tournois — creation (B-01)
router.post('/', requireAuth, requireRole('administrateur'), (req, res) => {
  const lecture = lireTextes(req.body, { nom: NOM, jeu: NOM });
  if ('erreur' in lecture) return res.status(400).json({ message: lecture.erreur });
  const { nom, jeu } = lecture.valeurs;

  const nouveau = creerTournoi(nom, jeu);
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
 *     security:
 *       - bearerAuth: []
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
 *       401:
 *         description: Token absent, invalide ou expire
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       403:
 *         description: Reserve a l'administrateur
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
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
router.patch('/:id/cloturer', requireAuth, requireRole('administrateur'), (req, res) => {
  const tournoi = trouverTournoi(Number(req.params.id));
  if (!tournoi) return res.status(404).json({ message: 'Tournoi introuvable' });

  if (tournoi.etat !== 'inscriptions_ouvertes') {
    return refuserConflit(req, res, { tournoiId: tournoi.id }, 'inscriptions_pas_ouvertes', 'Les inscriptions ne sont pas ouvertes');
  }

  // B-12 : l'arbre se construit a partir des huit equipes engagees, ni plus ni moins
  const equipesEngagees = listerEquipesDuTournoi(tournoi.id);
  if (equipesEngagees.length !== NOMBRE_EQUIPES_REQUIS) {
    return refuserConflit(
      req,
      res,
      { tournoiId: tournoi.id, nombreEquipes: equipesEngagees.length },
      'nombre_equipes_incorrect',
      `Il faut exactement ${NOMBRE_EQUIPES_REQUIS} equipes engagees pour cloturer les inscriptions (actuellement ${equipesEngagees.length})`
    );
  }

  // Ordre d'inscription : les equipes sont placees dans l'arbre par id croissant
  const equipeIds = equipesEngagees.map((e) => e.id).sort((a, b) => a - b);
  // Cloture et arbre dans une meme transaction
  const nombreDeMatchs = cloturerEtGenererArbre(tournoi.id, equipeIds);

  logger.info('Inscriptions cloturees', {
    tournoiId: tournoi.id,
    userId: req.user?.userId,
    nombreDeMatchs,
  });
  // B-19 : les spectateurs voient l'etat change et l'arbre apparaitre sans recharger
  const cloture = trouverTournoi(tournoi.id)!;
  diffuserTournoi(cloture);
  diffuserMatchs(cloture.id);
  res.json(cloture);
});

/**
 * @openapi
 * /api/tournois/{id}/lancer:
 *   patch:
 *     summary: Lancer le tournoi
 *     description: Reserve a l'administrateur (B-04). Passe le tournoi de inscriptions_closes a en_cours.
 *     tags: [Tournois]
 *     security:
 *       - bearerAuth: []
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
 *       401:
 *         description: Token absent, invalide ou expire
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       403:
 *         description: Reserve a l'administrateur
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
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
router.patch('/:id/lancer', requireAuth, requireRole('administrateur'), (req, res) => {
  const tournoi = trouverTournoi(Number(req.params.id));
  if (!tournoi) return res.status(404).json({ message: 'Tournoi introuvable' });

  if (tournoi.etat !== 'inscriptions_closes') {
    return refuserConflit(req, res, { tournoiId: tournoi.id }, 'inscriptions_pas_closes', 'Les inscriptions doivent etre closes');
  }

  logger.info('Tournoi lance', { tournoiId: tournoi.id, userId: req.user?.userId });

  // B-04 : passage en cours, et les equipes qui ne sont pas au complet au moment du
  // lancement sont forfait sur leur premier match (une seule transaction)
  lancerTournoi(tournoi.id);

  // B-19 : apres la cascade des forfaits, une seule diffusion de l'etat et de l'arbre.
  // Si tous les matchs tombent en forfait, le tournoi peut deja etre termine ici.
  const lance = trouverTournoi(tournoi.id)!;
  diffuserTournoi(lance);
  diffuserMatchs(lance.id);
  res.json(lance);
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
  res.json(listerEquipesDuTournoi(tournoiId));
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
  res.json(listerMatchsDuTournoi(tournoiId));
});

export default router;
