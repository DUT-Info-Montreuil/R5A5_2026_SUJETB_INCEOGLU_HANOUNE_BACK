import { Router, Request, Response } from 'express';
import { equipes, tournois, users, messages } from '../models/fakeData';
import { Equipe, Message } from '../models/types';
import { requireAuth } from '../middleware/auth';
import { logger } from '../logger';

const router = Router();

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
 *       Un joueur ne peut etre que dans une seule equipe par tournoi (B-07).
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
  res.json(equipe);
});

/**
 * @openapi
 * /api/equipes/{id}/membres:
 *   post:
 *     summary: Rejoindre une equipe
 *     description: >
 *       Reserve a un joueur connecte (B-06, B-07, B-08). Une equipe compte au plus 5 membres
 *       et un joueur ne peut etre que dans une seule equipe par tournoi.
 *       Le joueur qui rejoint est l'utilisateur connecte (deduit du token).
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
 *         description: Joueur ajoute, equipe mise a jour
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
 *       404:
 *         description: Equipe introuvable ou utilisateur connecte introuvable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 *       409:
 *         description: >
 *           Les inscriptions sont fermees, l'equipe est complete (5 membres),
 *           ou le joueur est deja membre d'une equipe sur ce tournoi
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 */
// POST /api/equipes/:id/membres — rejoindre (B-06, B-07, B-08)
router.post('/:id/membres', requireAuth, (req, res) => {
  const equipe = equipes.find((e) => e.id === Number(req.params.id));
  if (!equipe) return res.status(404).json({ message: 'Equipe introuvable' });

  const tournoi = tournois.find((t) => t.id === equipe.tournoiId);
  if (tournoi?.etat !== 'inscriptions_ouvertes') {
    return res.status(409).json({ message: 'Les inscriptions sont fermees' });
  }

  if (equipe.membres.length >= 5) {
    return res.status(409).json({ message: 'Equipe complete' });
  }

  // le joueur qui rejoint est l'utilisateur connecte
  const user = users.find((u) => u.id === req.user!.userId);
  if (!user) return res.status(404).json({ message: 'Utilisateur introuvable' });

  const dejaEngage = equipes.some(
    (e) => e.tournoiId === equipe.tournoiId && e.membres.some((m) => m.userId === user.id)
  );
  if (dejaEngage) {
    return res.status(409).json({ message: 'Deja membre d une equipe sur ce tournoi' });
  }

  equipe.membres.push({ userId: user.id, nom: user.nom, roleJeu: null });
  res.status(201).json(equipe);
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
  // TODO: B-17 — retirer le joueur de la room Socket.io de l equipe
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
  // TODO: emettre 'message:nouveau' sur la room de l equipe (B-16)
  res.status(201).json(nouveau);
});

export default router;
