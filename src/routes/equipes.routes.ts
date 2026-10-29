import { Router, Request, Response } from 'express';
import { equipes, tournois, users, messages, demandes } from '../models/fakeData';
import { DemandeAdhesion, Equipe, Message } from '../models/types';
import { requireAuth } from '../middleware/auth';
import { logger } from '../logger';
import { NOMBRE_EQUIPES_REQUIS } from '../services/bracket.service';
import {
  diffuserDemande,
  diffuserEquipe,
  diffuserMessage,
  diffuserNouvelleDemande,
  exclureDeLEquipe,
} from '../realtime/diffusion';

const router = Router();

// B-08 : une equipe compte au plus cinq joueurs
const EFFECTIF_MAX = 5;

// Journalise un refus d'acces (authentifie mais pas autorise) puis repond 403
function refuser(req: Request, res: Response, equipeId: number, action: string) {
  logger.warn('Acces refuse : droits insuffisants', {
    userId: req.user!.userId,
    equipeId,
    action,
    methode: req.method,
    chemin: req.originalUrl.split('?')[0],
  });
  return res.status(403).json({ message: 'Acces refuse' });
}

/**
 * @openapi
 * /api/equipes:
 *   post:
 *     summary: Creer une equipe
 *     description: >
 *       Reserve a un joueur connecte, qui devient capitaine de l'equipe (B-05).
 *       Le capitaine est deduit du token.
 *       Un joueur ne peut etre que dans une seule equipe par tournoi (B-07) : ses demandes
 *       d'adhesion encore en attente sur ce tournoi sont annulees.
 *     tags: [Equipes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tournoiId, nom]
 *             properties:
 *               tournoiId:
 *                 type: integer
 *               nom:
 *                 type: string
 *           example:
 *             tournoiId: 1
 *             nom: Les Invaincus
 *     responses:
 *       201:
 *         description: Equipe creee avec le capitaine comme premier membre
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Equipe'
 *       400:
 *         description: tournoiId et nom sont obligatoires
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
 *       404:
 *         description: Tournoi introuvable ou utilisateur introuvable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       409:
 *         description: Les inscriptions sont fermees, ou le joueur est deja membre d'une equipe sur ce tournoi
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 */
// POST /api/equipes — creation (B-05)
router.post('/', requireAuth, (req, res) => {
  // le createur (utilisateur connecte) devient capitaine
  const capitaineId = req.user!.userId;
  const { tournoiId, nom } = req.body;
  if (!tournoiId || !nom) {
    return res.status(400).json({ message: 'tournoiId et nom sont obligatoires' });
  }

  const tournoi = tournois.find((t) => t.id === Number(tournoiId));
  if (!tournoi) return res.status(404).json({ message: 'Tournoi introuvable' });
  if (tournoi.etat !== 'inscriptions_ouvertes') {
    return res.status(409).json({ message: 'Les inscriptions sont fermees' });
  }

  // B-12 : l'arbre se joue a huit equipes, les inscriptions sont closes au-dela
  const equipesEngagees = equipes.filter((e) => e.tournoiId === Number(tournoiId));
  if (equipesEngagees.length >= NOMBRE_EQUIPES_REQUIS) {
    return res.status(409).json({ message: `Le tournoi compte deja ${NOMBRE_EQUIPES_REQUIS} equipes` });
  }

  // B-07 : un joueur n'est que dans une seule equipe par tournoi
  const dejaEngage = equipes.some(
    (e) => e.tournoiId === Number(tournoiId) && e.membres.some((m) => m.userId === capitaineId)
  );
  if (dejaEngage) {
    return res.status(409).json({ message: 'Deja membre d une equipe sur ce tournoi' });
  }

  const capitaine = users.find((u) => u.id === capitaineId);
  if (!capitaine) return res.status(404).json({ message: 'Utilisateur introuvable' });

  const nouvelle: Equipe = {
    id: Math.max(0, ...equipes.map((e) => e.id)) + 1,
    tournoiId: Number(tournoiId),
    nom,
    capitaineId,
    eliminee: false,
    membres: [{ userId: capitaine.id, nom: capitaine.nom, roleJeu: null }],
  };

  equipes.push(nouvelle);
  annulerDemandesEnAttente(capitaine.id, nouvelle.tournoiId, 'equipe_creee');
  diffuserEquipe(nouvelle);
  res.status(201).json(nouvelle);
});

/**
 * @openapi
 * /api/equipes/{id}:
 *   get:
 *     summary: Detail d'une equipe
 *     description: Accessible a tous, y compris les visiteurs.
 *     tags: [Equipes]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Identifiant de l'equipe
 *     responses:
 *       200:
 *         description: L'equipe et ses membres
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Equipe'
 *       404:
 *         description: Equipe introuvable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 */
// GET /api/equipes/:id
router.get('/:id', (req, res) => {
  const equipe = equipes.find((e) => e.id === Number(req.params.id));
  if (!equipe) return res.status(404).json({ message: 'Equipe introuvable' });
  res.json(equipe);
});

/**
 * @openapi
 * /api/equipes/{id}:
 *   patch:
 *     summary: Renommer une equipe
 *     description: >
 *       Reserve au capitaine de l'equipe (B-09, B-10, B-11).
 *       Possible uniquement tant que les inscriptions du tournoi sont ouvertes.
 *     tags: [Equipes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Identifiant de l'equipe
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nom]
 *             properties:
 *               nom:
 *                 type: string
 *           example:
 *             nom: Les Montreuillois Esport
 *     responses:
 *       200:
 *         description: Equipe renommee
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Equipe'
 *       400:
 *         description: nom obligatoire
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
 *         description: Seul le capitaine de l'equipe peut la renommer
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       404:
 *         description: Equipe introuvable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       409:
 *         description: Composition figee (inscriptions fermees)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 */
// PATCH /api/equipes/:id — renommer (B-09, B-11)
router.patch('/:id', requireAuth, (req, res) => {
  const equipe = equipes.find((e) => e.id === Number(req.params.id));
  if (!equipe) return res.status(404).json({ message: 'Equipe introuvable' });

  // B-10 : seul le capitaine
  if (req.user!.userId !== equipe.capitaineId) return refuser(req, res, equipe.id, 'renommer_equipe');

  const tournoi = tournois.find((t) => t.id === equipe.tournoiId);
  if (tournoi?.etat !== 'inscriptions_ouvertes') {
    return res.status(409).json({ message: 'Composition figee' });
  }

  const { nom } = req.body;
  if (!nom) return res.status(400).json({ message: 'nom obligatoire' });

  equipe.nom = nom;
  diffuserEquipe(equipe);
  res.json(equipe);
});

// B-07 : un joueur engage dans une equipe (accepte ou createur) ne peut plus en rejoindre
// une autre du tournoi : ses demandes encore en attente sur ce tournoi deviennent sans objet.
function annulerDemandesEnAttente(userId: number, tournoiId: number, motif: string) {
  const equipesDuTournoi = equipes.filter((e) => e.tournoiId === tournoiId).map((e) => e.id);
  for (const demande of demandes) {
    if (demande.userId === userId && demande.statut === 'en_attente' && equipesDuTournoi.includes(demande.equipeId)) {
      demande.statut = 'annulee';
      logger.info('Demande d adhesion annulee', { equipeId: demande.equipeId, demandeId: demande.id, userId, motif });
      diffuserDemande(demande);
    }
  }
}

// B-06/B-07/B-08 : motif de refus d'une entree dans l'equipe, ou null si elle est possible.
// Verifie a la demande ET a l'acceptation : entre les deux, le tournoi a pu etre cloture,
// l'equipe a pu se remplir et le joueur a pu s'engager ailleurs.
function motifRefusEntree(equipe: Equipe, userId: number): string | null {
  const tournoi = tournois.find((t) => t.id === equipe.tournoiId);
  if (tournoi?.etat !== 'inscriptions_ouvertes') return 'Les inscriptions sont fermees';

  if (equipe.membres.length >= EFFECTIF_MAX) return 'Equipe complete';

  const dejaEngage = equipes.some(
    (e) => e.tournoiId === equipe.tournoiId && e.membres.some((m) => m.userId === userId)
  );
  if (dejaEngage) return 'Deja membre d une equipe sur ce tournoi';

  return null;
}

/**
 * @openapi
 * /api/equipes/{id}/demandes:
 *   post:
 *     summary: Demander a rejoindre une equipe
 *     description: >
 *       Reserve a un joueur connecte (B-06, B-07, B-08). Le joueur n'entre dans l'equipe
 *       qu'apres acceptation du capitaine. Le demandeur est deduit du token.
 *     tags: [Equipes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Identifiant de l'equipe
 *     responses:
 *       201:
 *         description: Demande creee, en attente de la decision du capitaine
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DemandeAdhesion'
 *       401:
 *         description: Token absent, invalide ou expire
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       404:
 *         description: Equipe introuvable ou utilisateur connecte introuvable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       409:
 *         description: >
 *           Les inscriptions sont fermees, l'equipe est complete (5 membres), le joueur est deja
 *           membre d'une equipe sur ce tournoi, ou une demande est deja en attente pour cette equipe
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 */
// POST /api/equipes/:id/demandes — demander a rejoindre (B-06, B-07, B-08)
router.post('/:id/demandes', requireAuth, (req, res) => {
  const equipe = equipes.find((e) => e.id === Number(req.params.id));
  if (!equipe) return res.status(404).json({ message: 'Equipe introuvable' });

  // le demandeur est l'utilisateur connecte
  const user = users.find((u) => u.id === req.user!.userId);
  if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });

  const motif = motifRefusEntree(equipe, user.id);
  if (motif) return res.status(409).json({ message: motif });

  const dejaEnAttente = demandes.some(
    (d) => d.equipeId === equipe.id && d.userId === user.id && d.statut === 'en_attente'
  );
  if (dejaEnAttente) {
    return res.status(409).json({ message: 'Demande deja en attente pour cette equipe' });
  }

  const nouvelle: DemandeAdhesion = {
    id: Math.max(0, ...demandes.map((d) => d.id)) + 1,
    equipeId: equipe.id,
    userId: user.id,
    statut: 'en_attente',
    createdAt: new Date().toISOString(),
  };

  demandes.push(nouvelle);
  logger.info('Demande d adhesion creee', { equipeId: equipe.id, demandeId: nouvelle.id, userId: user.id });
  diffuserNouvelleDemande(nouvelle, equipe.capitaineId);
  res.status(201).json(nouvelle);
});

/**
 * @openapi
 * /api/equipes/{id}/demandes:
 *   get:
 *     summary: Lister les demandes en attente d'une equipe
 *     description: Reserve au capitaine de l'equipe (B-06, B-10). Chaque demande porte le nom du joueur.
 *     tags: [Equipes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Identifiant de l'equipe
 *     responses:
 *       200:
 *         description: Demandes en attente (eventuellement vide)
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 allOf:
 *                   - $ref: '#/components/schemas/DemandeAdhesion'
 *                   - type: object
 *                     properties:
 *                       nomJoueur:
 *                         type: string
 *                         example: Sami
 *       401:
 *         description: Token absent, invalide ou expire
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       403:
 *         description: Reserve au capitaine de l'equipe
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       404:
 *         description: Equipe introuvable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 */
// GET /api/equipes/:id/demandes — demandes en attente (B-06, B-10)
router.get('/:id/demandes', requireAuth, (req, res) => {
  const equipe = equipes.find((e) => e.id === Number(req.params.id));
  if (!equipe) return res.status(404).json({ message: 'Equipe introuvable' });

  if (req.user!.userId !== equipe.capitaineId) return refuser(req, res, equipe.id, 'lister_demandes');

  // le capitaine decide sur un nom, pas sur un identifiant
  const enAttente = demandes
    .filter((d) => d.equipeId === equipe.id && d.statut === 'en_attente')
    .map((d) => ({ ...d, nomJoueur: users.find((u) => u.id === d.userId)?.nom ?? null }));
  res.json(enAttente);
});

/**
 * @openapi
 * /api/equipes/{id}/demandes/{demandeId}:
 *   patch:
 *     summary: Accepter ou refuser une demande
 *     description: >
 *       Reserve au capitaine de l'equipe (B-06, B-10). A l'acceptation, les regles d'entree
 *       sont reverifiees (B-07, B-08), le joueur rejoint l'equipe et ses autres demandes
 *       en attente sur le meme tournoi sont annulees.
 *     tags: [Equipes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Identifiant de l'equipe
 *       - in: path
 *         name: demandeId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Identifiant de la demande
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [decision]
 *             properties:
 *               decision:
 *                 type: string
 *                 enum: [acceptee, refusee]
 *           example:
 *             decision: acceptee
 *     responses:
 *       200:
 *         description: Demande traitee
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DemandeAdhesion'
 *       400:
 *         description: decision doit valoir acceptee ou refusee
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
 *         description: Reserve au capitaine de l'equipe
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       404:
 *         description: Equipe introuvable, demande introuvable ou utilisateur introuvable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       409:
 *         description: >
 *           La demande n'est plus en attente, ou (a l'acceptation) les inscriptions sont fermees,
 *           l'equipe est complete ou le joueur est deja membre d'une equipe sur ce tournoi
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 */
// PATCH /api/equipes/:id/demandes/:demandeId — decision du capitaine (B-06, B-07, B-08, B-10)
router.patch('/:id/demandes/:demandeId', requireAuth, (req, res) => {
  const equipe = equipes.find((e) => e.id === Number(req.params.id));
  if (!equipe) return res.status(404).json({ message: 'Equipe introuvable' });

  // seul le capitaine decide (B-10)
  if (req.user!.userId !== equipe.capitaineId) return refuser(req, res, equipe.id, 'traiter_demande');

  // la demande doit viser cette equipe : un capitaine ne traite pas les demandes des autres
  const demande = demandes.find((d) => d.id === Number(req.params.demandeId) && d.equipeId === equipe.id);
  if (!demande) return res.status(404).json({ message: 'Demande introuvable' });

  const { decision } = req.body;
  if (decision !== 'acceptee' && decision !== 'refusee') {
    return res.status(400).json({ message: 'decision doit valoir acceptee ou refusee' });
  }

  if (demande.statut !== 'en_attente') {
    return res.status(409).json({ message: 'Demande deja traitee' });
  }

  if (decision === 'refusee') {
    demande.statut = 'refusee';
    logger.info('Demande d adhesion refusee', { equipeId: equipe.id, demandeId: demande.id, userId: demande.userId });
    diffuserDemande(demande);
    return res.json(demande);
  }

  const motif = motifRefusEntree(equipe, demande.userId);
  if (motif) return res.status(409).json({ message: motif });

  const user = users.find((u) => u.id === demande.userId);
  if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });

  equipe.membres.push({ userId: user.id, nom: user.nom, roleJeu: null });
  demande.statut = 'acceptee';
  logger.info('Demande d adhesion acceptee', { equipeId: equipe.id, demandeId: demande.id, userId: user.id });

  annulerDemandesEnAttente(user.id, equipe.tournoiId, 'acceptee_ailleurs');

  diffuserDemande(demande);
  diffuserEquipe(equipe);
  res.json(demande);
});

/**
 * @openapi
 * /api/equipes/{id}/demandes/{demandeId}:
 *   delete:
 *     summary: Annuler sa demande
 *     description: Reserve a l'auteur de la demande, tant qu'elle est en attente (B-06).
 *     tags: [Equipes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Identifiant de l'equipe
 *       - in: path
 *         name: demandeId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Identifiant de la demande
 *     responses:
 *       204:
 *         description: Demande annulee
 *       401:
 *         description: Token absent, invalide ou expire
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       403:
 *         description: Seul l'auteur de la demande peut l'annuler
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       404:
 *         description: Equipe introuvable ou demande introuvable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       409:
 *         description: La demande n'est plus en attente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 */
// DELETE /api/equipes/:id/demandes/:demandeId — annuler sa demande (B-06)
router.delete('/:id/demandes/:demandeId', requireAuth, (req, res) => {
  const equipe = equipes.find((e) => e.id === Number(req.params.id));
  if (!equipe) return res.status(404).json({ message: 'Equipe introuvable' });

  const demande = demandes.find((d) => d.id === Number(req.params.demandeId) && d.equipeId === equipe.id);
  if (!demande) return res.status(404).json({ message: 'Demande introuvable' });

  if (req.user!.userId !== demande.userId) return refuser(req, res, equipe.id, 'annuler_demande');

  if (demande.statut !== 'en_attente') {
    return res.status(409).json({ message: 'Demande deja traitee' });
  }

  demande.statut = 'annulee';
  logger.info('Demande d adhesion annulee', { equipeId: equipe.id, demandeId: demande.id, userId: demande.userId });
  diffuserDemande(demande);
  res.status(204).send();
});

/**
 * @openapi
 * /api/equipes/{id}/membres/{userId}:
 *   delete:
 *     summary: Exclure ou quitter une equipe
 *     description: >
 *       Le capitaine peut exclure un membre, un joueur peut se retirer lui-meme (B-06, B-09).
 *       Le capitaine ne peut pas partir sans avoir passe la main.
 *     tags: [Equipes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Identifiant de l'equipe
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Identifiant du membre a retirer
 *     responses:
 *       204:
 *         description: Membre retire
 *       401:
 *         description: Token absent, invalide ou expire
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       403:
 *         description: Ni le membre concerne, ni le capitaine de l'equipe
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       404:
 *         description: Equipe introuvable ou membre introuvable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       409:
 *         description: Composition figee (inscriptions fermees), ou le capitaine doit d'abord passer la main
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 */
// DELETE /api/equipes/:id/membres/:userId — exclure ou quitter (B-06, B-09)
router.delete('/:id/membres/:userId', requireAuth, (req, res) => {
  const equipe = equipes.find((e) => e.id === Number(req.params.id));
  if (!equipe) return res.status(404).json({ message: 'Equipe introuvable' });

  // soit on se retire soi-meme (quitter, B-06), soit le capitaine exclut (B-09)
  const userId = Number(req.params.userId);
  const soiMeme = userId === req.user!.userId;
  const estCapitaine = req.user!.userId === equipe.capitaineId;
  if (!soiMeme && !estCapitaine) return refuser(req, res, equipe.id, 'retirer_membre');

  const tournoi = tournois.find((t) => t.id === equipe.tournoiId);
  if (tournoi?.etat !== 'inscriptions_ouvertes') {
    return res.status(409).json({ message: 'Composition figee' });
  }

  if (userId === equipe.capitaineId) {
    return res.status(409).json({ message: 'Le capitaine doit d abord passer la main' });
  }

  const index = equipe.membres.findIndex((m) => m.userId === userId);
  if (index === -1) return res.status(404).json({ message: 'Membre introuvable' });

  equipe.membres.splice(index, 1);
  logger.info(soiMeme ? 'Membre parti de l equipe' : 'Membre exclu de l equipe', {
    equipeId: equipe.id,
    userId,
    parUserId: req.user!.userId,
  });
  // B-17 : l'exclu (ou le partant) sort de la room avant la diffusion de la nouvelle composition
  exclureDeLEquipe(equipe.id, userId, soiMeme ? 'depart' : 'exclusion');
  diffuserEquipe(equipe);
  res.status(204).send();
});

/**
 * @openapi
 * /api/equipes/{id}/membres/{userId}:
 *   patch:
 *     summary: Attribuer un role de jeu a un membre
 *     description: >
 *       Reserve au capitaine de l'equipe (B-09).
 *       Possible uniquement tant que les inscriptions du tournoi sont ouvertes.
 *     tags: [Equipes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Identifiant de l'equipe
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: Identifiant du membre
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [roleJeu]
 *             properties:
 *               roleJeu:
 *                 type: string
 *           example:
 *             roleJeu: initiateur
 *     responses:
 *       200:
 *         description: Role attribue, equipe mise a jour
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Equipe'
 *       400:
 *         description: roleJeu obligatoire
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
 *         description: Reserve au capitaine de l'equipe
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       404:
 *         description: Equipe introuvable ou membre introuvable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       409:
 *         description: Roles figes (inscriptions fermees)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 */
// PATCH /api/equipes/:id/membres/:userId — attribuer un role (B-09)
router.patch('/:id/membres/:userId', requireAuth, (req, res) => {
  const equipe = equipes.find((e) => e.id === Number(req.params.id));
  if (!equipe) return res.status(404).json({ message: 'Equipe introuvable' });

  // seul le capitaine (B-09, B-10)
  if (req.user!.userId !== equipe.capitaineId) return refuser(req, res, equipe.id, 'attribuer_role');

  const tournoi = tournois.find((t) => t.id === equipe.tournoiId);
  if (tournoi?.etat !== 'inscriptions_ouvertes') {
    return res.status(409).json({ message: 'Roles figes' });
  }

  const membre = equipe.membres.find((m) => m.userId === Number(req.params.userId));
  if (!membre) return res.status(404).json({ message: 'Membre introuvable' });

  const { roleJeu } = req.body;
  if (!roleJeu) return res.status(400).json({ message: 'roleJeu obligatoire' });

  membre.roleJeu = roleJeu;
  diffuserEquipe(equipe);
  res.json(equipe);
});

/**
 * @openapi
 * /api/equipes/{id}/capitaine:
 *   patch:
 *     summary: Transferer le role de capitaine
 *     description: Reserve au capitaine actuel de l'equipe (B-09). Le nouveau capitaine doit deja etre membre.
 *     tags: [Equipes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Identifiant de l'equipe
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nouveauCapitaineId]
 *             properties:
 *               nouveauCapitaineId:
 *                 type: integer
 *           example:
 *             nouveauCapitaineId: 3
 *     responses:
 *       200:
 *         description: Capitaine change, equipe mise a jour
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Equipe'
 *       401:
 *         description: Token absent, invalide ou expire
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       403:
 *         description: Reserve au capitaine actuel de l'equipe
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       404:
 *         description: Equipe introuvable, ou le nouveau capitaine n'est pas membre (y compris si nouveauCapitaineId est absent)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 */
// PATCH /api/equipes/:id/capitaine — passer la main (B-09)
router.patch('/:id/capitaine', requireAuth, (req, res) => {
  const equipe = equipes.find((e) => e.id === Number(req.params.id));
  if (!equipe) return res.status(404).json({ message: 'Equipe introuvable' });

  // seul le capitaine actuel
  if (req.user!.userId !== equipe.capitaineId) return refuser(req, res, equipe.id, 'transferer_capitaine');

  // B-11 : une fois les inscriptions closes, l equipe est figee, capitaine compris
  const tournoi = tournois.find((t) => t.id === equipe.tournoiId);
  if (tournoi?.etat !== 'inscriptions_ouvertes') {
    return res.status(409).json({ message: 'Composition figee' });
  }

  const { nouveauCapitaineId } = req.body;
  const membre = equipe.membres.find((m) => m.userId === Number(nouveauCapitaineId));
  if (!membre) return res.status(404).json({ message: 'Le nouveau capitaine doit etre membre' });

  equipe.capitaineId = membre.userId;
  diffuserEquipe(equipe);
  res.json(equipe);
});

/**
 * @openapi
 * /api/equipes/{id}/messages:
 *   get:
 *     summary: Lire les messages d'une equipe
 *     description: >
 *       Reserve aux membres de l'equipe tant qu'elle n'est pas eliminee (B-16, B-18).
 *       L'administrateur peut toujours consulter l'historique, meme apres elimination (B-18).
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Identifiant de l'equipe
 *     responses:
 *       200:
 *         description: Messages de l'equipe (eventuellement vide)
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Message'
 *       401:
 *         description: Token absent, invalide ou expire
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       403:
 *         description: Pas membre de l'equipe, ou equipe eliminee (sauf administrateur)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       404:
 *         description: Equipe introuvable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 */
// GET /api/equipes/:id/messages — espace d echange (B-16, B-18)
router.get('/:id/messages', requireAuth, (req, res) => {
  const equipe = equipes.find((e) => e.id === Number(req.params.id));
  if (!equipe) return res.status(404).json({ message: 'Equipe introuvable' });

  // l administrateur peut toujours lire, meme apres elimination (B-18)
  if (req.user!.role !== 'administrateur') {
    // B-16 : on ne lit l espace d une equipe que si on en est membre — refus prioritaire,
    // pour ne pas reveler l elimination d une equipe a quelqu un qui n y a pas sa place
    const estMembre = equipe.membres.some((m) => m.userId === req.user!.userId);
    if (!estMembre) return refuser(req, res, equipe.id, 'lire_messages');

    // B-18 : l espace d une equipe eliminee est ferme, en lecture comme en ecriture
    if (equipe.eliminee) {
      return res.status(409).json({ message: 'Espace ferme, equipe eliminee' });
    }
  }

  res.json(messages.filter((m) => m.equipeId === equipe.id));
});

/**
 * @openapi
 * /api/equipes/{id}/messages:
 *   post:
 *     summary: Envoyer un message a son equipe
 *     description: >
 *       Reserve aux membres actifs de l'equipe (B-16, B-17). L'espace est ferme
 *       en ecriture une fois l'equipe eliminee (B-18). L'auteur est deduit du token.
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: Identifiant de l'equipe
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [contenu]
 *             properties:
 *               contenu:
 *                 type: string
 *           example:
 *             contenu: Entrainement ce soir a 20h sur Ascent
 *     responses:
 *       201:
 *         description: Message envoye
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Message'
 *       400:
 *         description: contenu obligatoire
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
 *         description: Pas membre actif de l'equipe (non membre ou exclu)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       404:
 *         description: Equipe introuvable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       409:
 *         description: Espace ferme, equipe eliminee
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 */
// POST /api/equipes/:id/messages — envoyer un message (B-16, B-17, B-18)
router.post('/:id/messages', requireAuth, (req, res) => {
  const equipe = equipes.find((e) => e.id === Number(req.params.id));
  if (!equipe) return res.status(404).json({ message: 'Equipe introuvable' });

  // membre actif uniquement : un joueur exclu n est plus dans membres (B-16, B-17)
  const estMembre = equipe.membres.some((m) => m.userId === req.user!.userId);
  if (!estMembre) return refuser(req, res, equipe.id, 'envoyer_message');

  if (equipe.eliminee) {
    return res.status(409).json({ message: 'Espace ferme, equipe eliminee' });
  }

  const { contenu } = req.body;
  if (!contenu) return res.status(400).json({ message: 'contenu obligatoire' });

  const nouveau: Message = {
    id: Math.max(0, ...messages.map((m) => m.id)) + 1,
    equipeId: equipe.id,
    userId: req.user!.userId,
    contenu,
    createdAt: new Date().toISOString(),
  };

  messages.push(nouveau);
  diffuserMessage(nouveau);
  res.status(201).json(nouveau);
});

export default router;
