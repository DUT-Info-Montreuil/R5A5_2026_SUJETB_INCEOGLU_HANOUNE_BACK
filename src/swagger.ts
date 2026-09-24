import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'API Plateforme de tournois',
      version: '1.0.0',
      description:
        'API de la plateforme de tournois de jeux competitifs (R5A5, Sujet B). ' +
        "Authentification par JWT : se connecter via POST /api/auth/login puis cliquer sur Authorize et coller le token.",
    },
    servers: [{ url: 'http://localhost:3000' }],
    tags: [
      { name: 'Auth', description: 'Inscription, connexion et utilisateur courant' },
      { name: 'Tournois', description: 'Gestion et consultation des tournois' },
      { name: 'Equipes', description: 'Creation et composition des equipes' },
      { name: 'Matchs', description: 'Saisie des resultats et forfaits' },
      { name: 'Messages', description: "Espace d'echange interne a une equipe" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        Erreur: {
          type: 'object',
          properties: { message: { type: 'string', example: 'Tournoi introuvable' } },
        },
        User: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 2 },
            nom: { type: 'string', example: 'Zeki' },
            email: { type: 'string', example: 'zeki@iut.fr' },
            role: { type: 'string', enum: ['joueur', 'administrateur'], example: 'joueur' },
          },
        },
        Tournoi: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            nom: { type: 'string', example: 'Coupe IUT Automne' },
            jeu: { type: 'string', example: 'Valorant' },
            etat: {
              type: 'string',
              enum: ['inscriptions_ouvertes', 'inscriptions_closes', 'en_cours', 'termine'],
              example: 'inscriptions_ouvertes',
            },
          },
        },
        MembreEquipe: {
          type: 'object',
          properties: {
            userId: { type: 'integer', example: 2 },
            nom: { type: 'string', example: 'Zeki' },
            roleJeu: { type: 'string', nullable: true, example: 'duelliste' },
          },
        },
        Equipe: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            tournoiId: { type: 'integer', example: 1 },
            nom: { type: 'string', example: 'Les Montreuillois' },
            capitaineId: { type: 'integer', example: 2 },
            eliminee: { type: 'boolean', example: false },
            membres: { type: 'array', items: { $ref: '#/components/schemas/MembreEquipe' } },
          },
        },
        Match: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            tournoiId: { type: 'integer', example: 2 },
            round: { type: 'integer', example: 1 },
            position: { type: 'integer', example: 1 },
            equipe1Id: { type: 'integer', nullable: true, example: 1 },
            equipe2Id: { type: 'integer', nullable: true, example: 2 },
            vainqueurId: { type: 'integer', nullable: true, example: null },
            matchSuivantId: { type: 'integer', nullable: true, example: 2 },
          },
        },
        Message: {
          type: 'object',
          properties: {
            id: { type: 'integer', example: 1 },
            equipeId: { type: 'integer', example: 1 },
            userId: { type: 'integer', example: 2 },
            contenu: { type: 'string', example: 'On se retrouve a 18h' },
            createdAt: { type: 'string', format: 'date-time', example: '2026-09-17T16:00:00Z' },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
