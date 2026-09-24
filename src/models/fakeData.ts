import { User, Tournoi, Equipe, Match, Message, Credentials } from './types';

export const users: User[] = [
  { id: 1, nom: 'Admin', email: 'admin@iut.fr', role: 'administrateur' },
  { id: 2, nom: 'Zeki', email: 'zeki@iut.fr', role: 'joueur' },
  { id: 3, nom: 'Hanoune', email: 'hanoune@iut.fr', role: 'joueur' },
  { id: 4, nom: 'Lea', email: 'lea@iut.fr', role: 'joueur' },
  // Joueur inscrit sur la plateforme mais membre d'aucune equipe
  { id: 5, nom: 'Sami', email: 'sami@iut.fr', role: 'joueur' },
];
// Hash bcrypt des comptes de test (mot de passe : "motdepasse" pour tous)
export const credentials: Credentials[] = [
  { userId: 1, passwordHash: '$2b$10$q5FkCVnfE.NAoikgfGKAqeJ0K2G53StToYUc3TXhfrs1Sh5VErXby' },
  { userId: 2, passwordHash: '$2b$10$0jS5hOKTatyoWp4fXF7S5OP8LhXVoI4zEansnA04k38EoOvEIl/lC' },
  { userId: 3, passwordHash: '$2b$10$OP6OHUJBOWRUJ2Swail9q.aKY/jU3IfDUbAHke9CoUFR1ay/Ul.cu' },
  { userId: 4, passwordHash: '$2b$10$rVO4iUeIM7Kv40p7vBhLtepmCq65HItg2Q8Mbf4ektwH7HaaoDvZq' },
  { userId: 5, passwordHash: '$2b$10$0P.cKnI4lL5CdmlglEM68emr8BrW8Il/Btyph88A/hF6y4YJMwEcq' },
];

export const tournois: Tournoi[] = [
  { id: 1, nom: 'Coupe IUT Automne', jeu: 'Valorant', etat: 'inscriptions_ouvertes' },
  { id: 2, nom: 'Tournoi inter-IUT', jeu: 'League of Legends', etat: 'en_cours' },
];

export const equipes: Equipe[] = [
  {
    id: 1,
    tournoiId: 1,
    nom: 'Les Montreuillois',
    capitaineId: 2,
    eliminee: false,
    membres: [
      { userId: 2, nom: 'Zeki', roleJeu: 'duelliste' },
      { userId: 3, nom: 'Hanoune', roleJeu: 'sentinelle' },
    ],
  },
  {
    id: 2,
    tournoiId: 1,
    nom: 'Team Paris 8',
    capitaineId: 4,
    eliminee: false,
    membres: [{ userId: 4, nom: 'Lea', roleJeu: 'controleur' }],
  },
];

export const matchs: Match[] = [
  { id: 1, tournoiId: 2, round: 1, position: 1, equipe1Id: 1, equipe2Id: 2, vainqueurId: null, matchSuivantId: 2 },
];

export const messages: Message[] = [
  { id: 1, equipeId: 1, userId: 2, contenu: 'On se retrouve a 18h', createdAt: '2026-09-17T16:00:00Z' },
];
