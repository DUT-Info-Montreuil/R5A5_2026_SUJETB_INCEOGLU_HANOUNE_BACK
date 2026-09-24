import { Router } from 'express';
import { equipes, tournois, users, messages } from '../models/fakeData';
import { Equipe, Message } from '../models/types';

const router = Router();

/**
 * @openapi
 * /api/equipes:
 *   post:
 *     summary: Creer une equipe
 *     description: >
 *       Reserve a un joueur connecte, qui devient capitaine de l'equipe (B-05).
 *       Un joueur ne peut etre que dans une seule equipe par tournoi (B-07).
 *     tags: [Equipes]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [tournoiId, nom, capitaineId]
 *             properties:
 *               tournoiId:
 *                 type: integer
 *               nom:
 *                 type: string
 *               capitaineId:
 *                 type: integer
 *           example:
 *             tournoiId: 1
 *             nom: Les Invaincus
 *             capitaineId: 1
 *     responses:
 *       201:
 *         description: Equipe creee avec le capitaine comme premier membre
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Equipe'
 *       400:
 *         description: tournoiId, nom et capitaineId sont obligatoires
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
router.post('/', (req, res) => {
  // TODO: requireAuth — le createur devient capitaine
  const { tournoiId, nom, capitaineId } = req.body;
  if (!tournoiId || !nom || !capitaineId) {
    return res.status(400).json({ message: 'tournoiId, nom et capitaineId sont obligatoires' });
  }

  const tournoi = tournois.find((t) => t.id === Number(tournoiId));
  if (!tournoi) return res.status(404).json({ message: 'Tournoi introuvable' });
  if (tournoi.etat !== 'inscriptions_ouvertes') {
    return res.status(409).json({ message: 'Les inscriptions sont fermees' });
  }

  // B-07 : un joueur n'est que dans une seule equipe par tournoi
  const dejaEngage = equipes.some(
    (e) => e.tournoiId === Number(tournoiId) && e.membres.some((m) => m.userId === Number(capitaineId))
  );
  if (dejaEngage) {
    return res.status(409).json({ message: 'Deja membre d une equipe sur ce tournoi' });
  }

  const capitaine = users.find((u) => u.id === Number(capitaineId));
  if (!capitaine) return res.status(404).json({ message: 'Utilisateur introuvable' });

  const nouvelle: Equipe = {
    id: Math.max(0, ...equipes.map((e) => e.id)) + 1,
    tournoiId: Number(tournoiId),
    nom,
    capitaineId: Number(capitaineId),
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
router.patch('/:id', (req, res) => {
  // TODO: seul le capitaine (B-10)
  const equipe = equipes.find((e) => e.id === Number(req.params.id));
  if (!equipe) return res.status(404).json({ message: 'Equipe introuvable' });

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
 *     tags: [Equipes]
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
 *             required: [userId]
 *             properties:
 *               userId:
 *                 type: integer
 *           example:
 *             userId: 4
 *     responses:
 *       201:
 *         description: Joueur ajoute, equipe mise a jour
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Equipe'
 *       404:
 *         description: Equipe introuvable ou utilisateur introuvable (y compris si userId est absent)
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
router.post('/:id/membres', (req, res) => {
  // TODO: requireAuth
  const equipe = equipes.find((e) => e.id === Number(req.params.id));
  if (!equipe) return res.status(404).json({ message: 'Equipe introuvable' });

  const tournoi = tournois.find((t) => t.id === equipe.tournoiId);
  if (tournoi?.etat !== 'inscriptions_ouvertes') {
    return res.status(409).json({ message: 'Les inscriptions sont fermees' });
  }

  if (equipe.membres.length >= 5) {
    return res.status(409).json({ message: 'Equipe complete' });
  }

  const { userId } = req.body;
  const user = users.find((u) => u.id === Number(userId));
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
router.delete('/:id/membres/:userId', (req, res) => {
  // TODO: capitaine (exclure) ou soi-meme (quitter)
  const equipe = equipes.find((e) => e.id === Number(req.params.id));
  if (!equipe) return res.status(404).json({ message: 'Equipe introuvable' });

  const tournoi = tournois.find((t) => t.id === equipe.tournoiId);
  if (tournoi?.etat !== 'inscriptions_ouvertes') {
    return res.status(409).json({ message: 'Composition figee' });
  }

  const userId = Number(req.params.userId);
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
router.patch('/:id/membres/:userId', (req, res) => {
  // TODO: seul le capitaine
  const equipe = equipes.find((e) => e.id === Number(req.params.id));
  if (!equipe) return res.status(404).json({ message: 'Equipe introuvable' });

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
 *       404:
 *         description: Equipe introuvable, ou le nouveau capitaine n'est pas membre (y compris si nouveauCapitaineId est absent)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 */
// PATCH /api/equipes/:id/capitaine — passer la main (B-09)
router.patch('/:id/capitaine', (req, res) => {
  // TODO: seul le capitaine actuel
  const equipe = equipes.find((e) => e.id === Number(req.params.id));
  if (!equipe) return res.status(404).json({ message: 'Equipe introuvable' });

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
 *       Reserve aux membres de l'equipe (B-16). Si l'equipe est eliminee,
 *       l'administrateur peut aussi consulter l'historique (B-18).
 *     tags: [Messages]
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
 *       404:
 *         description: Equipe introuvable
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Erreur'
 */
// GET /api/equipes/:id/messages — espace d echange (B-16, B-18)
router.get('/:id/messages', (req, res) => {
  // TODO: membre de l equipe, ou administrateur si equipe eliminee (B-18)
  const equipe = equipes.find((e) => e.id === Number(req.params.id));
  if (!equipe) return res.status(404).json({ message: 'Equipe introuvable' });

  res.json(messages.filter((m) => m.equipeId === equipe.id));
});

/**
 * @openapi
 * /api/equipes/{id}/messages:
 *   post:
 *     summary: Envoyer un message a son equipe
 *     description: >
 *       Reserve aux membres actifs de l'equipe (B-16, B-17). L'espace est ferme
 *       en ecriture une fois l'equipe eliminee (B-18).
 *     tags: [Messages]
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
 *               userId:
 *                 type: integer
 *                 description: Auteur du message (sera deduit de la session une fois l'authentification en place)
 *               contenu:
 *                 type: string
 *           example:
 *             userId: 2
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
router.post('/:id/messages', (req, res) => {
  // TODO: membre actif uniquement
  const equipe = equipes.find((e) => e.id === Number(req.params.id));
  if (!equipe) return res.status(404).json({ message: 'Equipe introuvable' });

  if (equipe.eliminee) {
    return res.status(409).json({ message: 'Espace ferme, equipe eliminee' });
  }

  const { userId, contenu } = req.body;
  if (!contenu) return res.status(400).json({ message: 'contenu obligatoire' });

  const nouveau: Message = {
    id: Math.max(0, ...messages.map((m) => m.id)) + 1,
    equipeId: equipe.id,
    userId: Number(userId),
    contenu,
    createdAt: new Date().toISOString(),
  };

  messages.push(nouveau);
  // TODO: emettre 'message:nouveau' sur la room de l equipe (B-16)
  res.status(201).json(nouveau);
});

export default router;
