import { User, Tournoi, Equipe, Match, Message, Credentials } from './types';
import { genererArbre } from '../services/bracket.service';

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

// --- Tournoi 2 : un tournoi en cours, complet et coherent, pour le front ---
// Huit equipes de cinq joueurs (B-08) engagees sur le tournoi 2. Les joueurs sont
// generes : ecrire quarante comptes a la main n'apporterait rien de plus.
// Tous partagent le hash du mot de passe de test, le hash ne depend que du mot de passe.
const HASH_MOT_DE_PASSE_DE_TEST = '$2b$10$0P.cKnI4lL5CdmlglEM68emr8BrW8Il/Btyph88A/hF6y4YJMwEcq';

const NOMS_EQUIPES_TOURNOI_2 = [
  'Nova Esport',
  'Les Rouages',
  'Paris Phoenix',
  'Sud Gaming',
  'Atlas Five',
  'Riverside',
  'Montreuil Legends',
  'Kappa Squad',
];

const PREMIERE_EQUIPE_TOURNOI_2 = 3;
const PREMIER_JOUEUR_TOURNOI_2 = 6;
const EFFECTIF_TOURNOI_2 = 5;

NOMS_EQUIPES_TOURNOI_2.forEach((nomEquipe, indexEquipe) => {
  const equipeId = PREMIERE_EQUIPE_TOURNOI_2 + indexEquipe;
  const membres = [];

  for (let indexMembre = 0; indexMembre < EFFECTIF_TOURNOI_2; indexMembre++) {
    const userId = PREMIER_JOUEUR_TOURNOI_2 + indexEquipe * EFFECTIF_TOURNOI_2 + indexMembre;
    const nom = `${nomEquipe} ${indexMembre + 1}`;

    users.push({ id: userId, nom, email: `joueur${userId}@iut.fr`, role: 'joueur' });
    credentials.push({ userId, passwordHash: HASH_MOT_DE_PASSE_DE_TEST });
    membres.push({ userId, nom, roleJeu: null });
  }

  equipes.push({
    id: equipeId,
    tournoiId: 2,
    nom: nomEquipe,
    capitaineId: membres[0].userId,
    eliminee: false,
    membres,
  });
});

// B-12 : l'arbre du tournoi 2 est produit par le meme service que la cloture des
// inscriptions, pour que le jeu de donnees ne puisse pas diverger du code.
export const matchs: Match[] = genererArbre(
  2,
  NOMS_EQUIPES_TOURNOI_2.map((_, index) => PREMIERE_EQUIPE_TOURNOI_2 + index),
  1
);

export const messages: Message[] = [
  { id: 1, equipeId: 1, userId: 2, contenu: 'On se retrouve a 18h', createdAt: '2026-09-17T16:00:00Z' },
];
