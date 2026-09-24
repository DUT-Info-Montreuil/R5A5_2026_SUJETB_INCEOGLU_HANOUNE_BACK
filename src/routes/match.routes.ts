import { Router } from 'express';
import { matchs, equipes, tournois } from '../models/fakeData';
import { logger } from '../logger';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

/**
 * @openapi
 * /api/matchs/{id}:
 *   get:
 *     summary: Detail d'un match
 *     description: Accessible a tous, y compris les visiteurs (B-02).
 *     tags: [Matchs]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Identifiant du match
 *     responses:
 *       200:
 *         description: Le match
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Match'
 *       404:
 *         description: Match introuvable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 */
// GET /api/matchs/:id
router.get('/:id', (req, res) => {
  const match = matchs.find((m) => m.id === Number(req.params.id));
  if (!match) return res.status(404).json({ message: 'Match introuvable' });
  res.json(match);
});

/**
 * @openapi
 * /api/matchs/{id}/resultat:
 *   patch:
 *     summary: Saisir le resultat d'un match
 *     description: >
 *       Reserve a l'administrateur (B-13, B-14). Le perdant est marque elimine (B-18)
 *       et le vainqueur avance dans le match suivant. Un resultat saisi ne peut pas etre corrige.
 *     tags: [Matchs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Identifiant du match
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [vainqueurId]
 *             properties:
 *               vainqueurId:
 *                 type: integer
 *                 description: Doit etre equipe1Id ou equipe2Id du match
 *           example:
 *             vainqueurId: 1
 *     responses:
 *       200:
 *         description: Resultat enregistre, match mis a jour
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Match'
 *       400:
 *         description: Le vainqueur doit etre une des deux equipes
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
 *       404:
 *         description: Match introuvable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       409:
 *         description: >
 *           Le tournoi n'est pas en cours, les deux equipes ne sont pas encore connues,
 *           ou le resultat est deja saisi
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 */
// PATCH /api/matchs/:id/resultat — saisie du resultat (B-13, B-14)
router.patch('/:id/resultat', requireAuth, requireRole('administrateur'), (req, res) => {
  const match = matchs.find((m) => m.id === Number(req.params.id));
  if (!match) return res.status(404).json({ message: 'Match introuvable' });

  const tournoi = tournois.find((t) => t.id === match.tournoiId);
  if (tournoi?.etat !== 'en_cours') {
    return res.status(409).json({ message: 'Le tournoi n est pas en cours' });
  }

  // B-14 : le match n est jouable qu une fois ses deux equipes connues
  if (!match.equipe1Id || !match.equipe2Id) {
    return res.status(409).json({ message: 'Les deux equipes ne sont pas connues' });
  }

  // hors perimetre : pas de correction d un resultat valide
  if (match.vainqueurId) {
    return res.status(409).json({ message: 'Resultat deja saisi' });
  }

  const { vainqueurId } = req.body;
  const gagnantId = Number(vainqueurId);
  if (gagnantId !== match.equipe1Id && gagnantId !== match.equipe2Id) {
    return res.status(400).json({ message: 'Le vainqueur doit etre une des deux equipes' });
  }

  match.vainqueurId = gagnantId;

  // le perdant est elimine (B-18)
  const perdantId = gagnantId === match.equipe1Id ? match.equipe2Id : match.equipe1Id;
  const perdant = equipes.find((e) => e.id === perdantId);
  if (perdant) perdant.eliminee = true;

  // B-14 : faire avancer le gagnant
  if (match.matchSuivantId) {
    const suivant = matchs.find((m) => m.id === match.matchSuivantId);
    if (suivant) {
      if (!suivant.equipe1Id) suivant.equipe1Id = gagnantId;
      else if (!suivant.equipe2Id) suivant.equipe2Id = gagnantId;
    }
  }

  logger.info('Resultat de match saisi', {
    matchId: match.id,
    vainqueurId: gagnantId,
    userId: req.user?.userId,
  });

  // TODO: emettre 'match:resultat' sur la room du tournoi (B-19)
  res.json(match);
});

/**
 * @openapi
 * /api/matchs/{id}/forfait:
 *   patch:
 *     summary: Declarer un forfait
 *     description: >
 *       Reserve a l'administrateur (B-15). L'equipe forfait est marquee eliminee,
 *       l'autre equipe est declaree vainqueur et avance dans le match suivant.
 *     tags: [Matchs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Identifiant du match
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [equipeForfaitId]
 *             properties:
 *               equipeForfaitId:
 *                 type: integer
 *                 description: Doit etre equipe1Id ou equipe2Id du match
 *           example:
 *             equipeForfaitId: 2
 *     responses:
 *       200:
 *         description: Forfait enregistre, match mis a jour
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Match'
 *       400:
 *         description: Equipe non concernee par ce match
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
 *       404:
 *         description: Match introuvable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       409:
 *         description: Resultat deja saisi
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 */
// PATCH /api/matchs/:id/forfait — declarer un forfait (B-15)
router.patch('/:id/forfait', requireAuth, requireRole('administrateur'), (req, res) => {
  const match = matchs.find((m) => m.id === Number(req.params.id));
  if (!match) return res.status(404).json({ message: 'Match introuvable' });

  if (match.vainqueurId) {
    return res.status(409).json({ message: 'Resultat deja saisi' });
  }

  const { equipeForfaitId } = req.body;
  const forfaitId = Number(equipeForfaitId);
  if (forfaitId !== match.equipe1Id && forfaitId !== match.equipe2Id) {
    return res.status(400).json({ message: 'Equipe non concernee par ce match' });
  }

  const qualifieId = forfaitId === match.equipe1Id ? match.equipe2Id : match.equipe1Id;
  match.vainqueurId = qualifieId;

  const forfait = equipes.find((e) => e.id === forfaitId);
  if (forfait) forfait.eliminee = true;

  if (match.matchSuivantId && qualifieId) {
    const suivant = matchs.find((m) => m.id === match.matchSuivantId);
    if (suivant) {
      if (!suivant.equipe1Id) suivant.equipe1Id = qualifieId;
      else if (!suivant.equipe2Id) suivant.equipe2Id = qualifieId;
    }
  }

  logger.info('Forfait declare', {
    matchId: match.id,
    equipeForfaitId: forfaitId,
    userId: req.user?.userId,
  });
  res.json(match);
});

export default router;
