import { Router, Request, Response } from 'express';
import { equipes, matchs, tournois } from '../models/fakeData';
import { logger } from '../logger';
import { requireAuth, requireRole } from '../middleware/auth';
import { enregistrerVainqueur } from '../services/match.service';
import { diffuserMatchs, diffuserTournoi } from '../realtime/diffusion';
import { Match, Tournoi } from '../models/types';

const router = Router();

// B-04 : apres un double forfait au lancement, le match garde ses deux equipes sans vainqueur.
// Il est pourtant clos : le jouer remettrait en jeu une equipe eliminee.
function contientEquipeEliminee(match: Match): boolean {
  return equipes.some((e) => (e.id === match.equipe1Id || e.id === match.equipe2Id) && e.eliminee);
}

// Journalise un refus de decision (resultat ou forfait) sur un match puis repond 409
function refuserDecision(req: Request, res: Response, matchId: number, motif: string, message: string) {
  logger.warn('Decision de match refusee', {
    matchId,
    userId: req.user?.userId,
    motif,
    chemin: req.originalUrl.split('?')[0],
  });
  return res.status(409).json({ message });
}

// B-19 : une seule diffusion par requete, apres toute la cascade (avancement,
// qualifications d'office). La fin du tournoi est diffusee si la finale vient d'etre decidee.
function diffuserApresResultat(tournoi: Tournoi): void {
  diffuserMatchs(tournoi.id);
  if (tournoi.etat === 'termine') diffuserTournoi(tournoi);
}

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
 *           le resultat est deja saisi, ou une equipe du match est deja eliminee
 *           (double forfait au lancement)
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
    return refuserDecision(req, res, match.id, 'tournoi_pas_en_cours', 'Le tournoi n est pas en cours');
  }

  // B-14 : le match n est jouable qu une fois ses deux equipes connues
  if (!match.equipe1Id || !match.equipe2Id) {
    return refuserDecision(req, res, match.id, 'equipes_inconnues', 'Les deux equipes ne sont pas connues');
  }

  // hors perimetre : pas de correction d un resultat valide
  if (match.vainqueurId) {
    return refuserDecision(req, res, match.id, 'resultat_deja_saisi', 'Resultat deja saisi');
  }

  if (contientEquipeEliminee(match)) {
    return refuserDecision(req, res, match.id, 'equipe_eliminee', 'Match clos : une equipe est deja eliminee');
  }

  const { vainqueurId } = req.body;
  const gagnantId = Number(vainqueurId);
  if (gagnantId !== match.equipe1Id && gagnantId !== match.equipe2Id) {
    return res.status(400).json({ message: 'Le vainqueur doit etre une des deux equipes' });
  }

  // Elimination du perdant, avancement du gagnant, fin de tournoi (B-14, B-18)
  enregistrerVainqueur(match, gagnantId);

  logger.info('Resultat de match saisi', {
    matchId: match.id,
    vainqueurId: gagnantId,
    userId: req.user?.userId,
  });

  diffuserApresResultat(tournoi);
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
 *         description: >
 *           Le tournoi n'est pas en cours, les deux equipes ne sont pas encore connues,
 *           le resultat est deja saisi, ou une equipe du match est deja eliminee
 *           (double forfait au lancement)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 */
// PATCH /api/matchs/:id/forfait — declarer un forfait (B-15)
router.patch('/:id/forfait', requireAuth, requireRole('administrateur'), (req, res) => {
  const match = matchs.find((m) => m.id === Number(req.params.id));
  if (!match) return res.status(404).json({ message: 'Match introuvable' });

  // Memes garde-fous que la saisie de resultat : un forfait decide aussi d'un match
  const tournoi = tournois.find((t) => t.id === match.tournoiId);
  if (tournoi?.etat !== 'en_cours') {
    return refuserDecision(req, res, match.id, 'tournoi_pas_en_cours', 'Le tournoi n est pas en cours');
  }

  // B-14 : sans les deux equipes, il n y a pas d equipe qualifiee a designer.
  // Sans ce controle, vainqueurId resterait null et la requete serait rejouable a l infini.
  if (!match.equipe1Id || !match.equipe2Id) {
    return refuserDecision(req, res, match.id, 'equipes_inconnues', 'Les deux equipes ne sont pas connues');
  }

  if (match.vainqueurId) {
    return refuserDecision(req, res, match.id, 'resultat_deja_saisi', 'Resultat deja saisi');
  }

  if (contientEquipeEliminee(match)) {
    return refuserDecision(req, res, match.id, 'equipe_eliminee', 'Match clos : une equipe est deja eliminee');
  }

  const { equipeForfaitId } = req.body;
  const forfaitId = Number(equipeForfaitId);
  if (forfaitId !== match.equipe1Id && forfaitId !== match.equipe2Id) {
    return res.status(400).json({ message: 'Equipe non concernee par ce match' });
  }

  // L equipe qui ne declare pas forfait est qualifiee : meme traitement qu un resultat
  const qualifieId = forfaitId === match.equipe1Id ? match.equipe2Id : match.equipe1Id;
  enregistrerVainqueur(match, qualifieId);

  logger.info('Forfait declare', {
    matchId: match.id,
    equipeForfaitId: forfaitId,
    userId: req.user?.userId,
  });
  diffuserApresResultat(tournoi);
  res.json(match);
});

export default router;
