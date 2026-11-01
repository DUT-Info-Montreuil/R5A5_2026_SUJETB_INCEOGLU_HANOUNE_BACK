import Database from 'better-sqlite3';
import { genererArbre } from '../services/bracket.service';

// Jeu de donnees de demonstration, insere par connexion.ts quand la base est vide :
// premier demarrage, ou base de test ':memory:' (une par fichier de test jest).
// Tournois 1 et 2 : les donnees de l'ancien src/models/fakeData.ts. Tournoi 3 : pret a etre
// cloture puis lance, pour tester cloture, lancement et resultats sans rien preparer.

// Hash bcrypt des comptes de test (mot de passe : "motdepasse" pour tous)
const COMPTES = [
  { id: 1, nom: 'Admin', email: 'admin@iut.fr', role: 'administrateur', hash: '$2b$10$q5FkCVnfE.NAoikgfGKAqeJ0K2G53StToYUc3TXhfrs1Sh5VErXby' },
  { id: 2, nom: 'Zeki', email: 'zeki@iut.fr', role: 'joueur', hash: '$2b$10$0jS5hOKTatyoWp4fXF7S5OP8LhXVoI4zEansnA04k38EoOvEIl/lC' },
  { id: 3, nom: 'Hanoune', email: 'hanoune@iut.fr', role: 'joueur', hash: '$2b$10$OP6OHUJBOWRUJ2Swail9q.aKY/jU3IfDUbAHke9CoUFR1ay/Ul.cu' },
  { id: 4, nom: 'Lea', email: 'lea@iut.fr', role: 'joueur', hash: '$2b$10$rVO4iUeIM7Kv40p7vBhLtepmCq65HItg2Q8Mbf4ektwH7HaaoDvZq' },
  // Joueur inscrit sur la plateforme mais membre d'aucune equipe
  { id: 5, nom: 'Sami', email: 'sami@iut.fr', role: 'joueur', hash: '$2b$10$0P.cKnI4lL5CdmlglEM68emr8BrW8Il/Btyph88A/hF6y4YJMwEcq' },
];

const TOURNOIS = [
  { id: 1, nom: 'Coupe IUT Automne', jeu: 'Valorant', etat: 'inscriptions_ouvertes' },
  { id: 2, nom: 'Tournoi inter-IUT', jeu: 'League of Legends', etat: 'en_cours' },
  { id: 3, nom: 'Coupe de demonstration', jeu: 'Valorant', etat: 'inscriptions_ouvertes' },
];

// Tournoi 1 : deux equipes en cours de constitution
const EQUIPES_TOURNOI_1 = [
  {
    id: 1,
    nom: 'Les Montreuillois',
    capitaineId: 2,
    membres: [
      { userId: 2, roleJeu: 'duelliste' },
      { userId: 3, roleJeu: 'sentinelle' },
    ],
  },
  { id: 2, nom: 'Team Paris 8', capitaineId: 4, membres: [{ userId: 4, roleJeu: 'controleur' }] },
];

// --- Tournoi 2 : un tournoi en cours, complet et coherent, pour le front ---
// Huit equipes de cinq joueurs (B-08). Les joueurs sont generes : ecrire quarante comptes
// a la main n'apporterait rien de plus. Tous partagent le hash du mot de passe de test,
// le hash ne depend que du mot de passe.
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

// --- Tournoi 3 : "Coupe de demonstration", inscriptions ouvertes, huit equipes deja engagees ---
// De quoi tester en un clic : la cloture genere l'arbre (B-03, B-12), le lancement declare
// forfait l'equipe incomplete au premier match (B-04), puis les resultats (B-13, B-14).
// Comptes et equipes a la suite de ceux du tournoi 2 (joueur46@iut.fr et suivants).
const NOMS_EQUIPES_TOURNOI_3 = [
  'Demo Alpha',
  'Demo Bravo',
  'Demo Charlie',
  'Demo Delta',
  'Demo Echo',
  'Demo Foxtrot',
  'Demo Golf',
  'Demo Hotel',
];

// Sept equipes completes et une derniere a quatre joueurs (B-04, B-08)
const EFFECTIFS_TOURNOI_3 = [5, 5, 5, 5, 5, 5, 5, 4];

const PREMIERE_EQUIPE_TOURNOI_3 = PREMIERE_EQUIPE_TOURNOI_2 + NOMS_EQUIPES_TOURNOI_2.length;
const PREMIER_JOUEUR_TOURNOI_3 = PREMIER_JOUEUR_TOURNOI_2 + NOMS_EQUIPES_TOURNOI_2.length * EFFECTIF_TOURNOI_2;

// B-08 : chaque joueur du tournoi 3 a deja son role de jeu, dans l'ordre d'entree dans l'equipe
const ROLES_DE_JEU_TOURNOI_3 = ['duelliste', 'initiateur', 'controleur', 'sentinelle', 'flex'];

const MESSAGES = [
  { id: 1, equipeId: 1, userId: 2, contenu: 'On se retrouve a 18h', createdAt: '2026-09-17T16:00:00Z' },
];

// B-06 : aucune demande d'adhesion au demarrage

/** Insere le jeu de demonstration dans une base vide, en une seule transaction. */
export function insererDonneesDeDemonstration(db: Database.Database): void {
  const insererUser = db.prepare('INSERT INTO users (id, nom, email, role) VALUES (?, ?, ?, ?)');
  const insererCredential = db.prepare('INSERT INTO credentials (user_id, password_hash) VALUES (?, ?)');
  const insererTournoi = db.prepare('INSERT INTO tournois (id, nom, jeu, etat) VALUES (?, ?, ?, ?)');
  const insererEquipe = db.prepare(
    'INSERT INTO equipes (id, tournoi_id, nom, capitaine_id, eliminee) VALUES (?, ?, ?, ?, 0)'
  );
  const insererMembre = db.prepare(
    'INSERT INTO membres (equipe_id, tournoi_id, user_id, role_jeu) VALUES (?, ?, ?, ?)'
  );
  const insererMatch = db.prepare(
    `INSERT INTO matchs (id, tournoi_id, round, position, equipe1_id, equipe2_id, vainqueur_id, match_suivant_id)
     VALUES (@id, @tournoiId, @round, @position, @equipe1Id, @equipe2Id, @vainqueurId, @matchSuivantId)`
  );
  const insererMessage = db.prepare(
    'INSERT INTO messages (id, equipe_id, user_id, contenu, created_at) VALUES (?, ?, ?, ?, ?)'
  );

  // Equipes generees (tournois 2 et 3) : comptes joueur<id>@iut.fr numerotes a la suite, le premier
  // joueur de chaque equipe en est le capitaine. rolesDeJeu[i] : role du i-eme joueur (null si absent).
  function insererEquipesGenerees(
    tournoiId: number,
    nomsEquipes: string[],
    premiereEquipeId: number,
    premierJoueurId: number,
    effectifs: number[],
    rolesDeJeu: string[]
  ): void {
    let prochainJoueurId = premierJoueurId;

    nomsEquipes.forEach((nomEquipe, indexEquipe) => {
      const equipeId = premiereEquipeId + indexEquipe;
      const capitaineId = prochainJoueurId;
      const effectif = effectifs[indexEquipe];

      for (let indexMembre = 0; indexMembre < effectif; indexMembre++) {
        const userId = capitaineId + indexMembre;
        insererUser.run(userId, `${nomEquipe} ${indexMembre + 1}`, `joueur${userId}@iut.fr`, 'joueur');
        insererCredential.run(userId, HASH_MOT_DE_PASSE_DE_TEST);
      }

      insererEquipe.run(equipeId, tournoiId, nomEquipe, capitaineId);
      for (let indexMembre = 0; indexMembre < effectif; indexMembre++) {
        insererMembre.run(equipeId, tournoiId, capitaineId + indexMembre, rolesDeJeu[indexMembre] ?? null);
      }

      prochainJoueurId += effectif;
    });
  }

  db.transaction(() => {
    for (const compte of COMPTES) {
      insererUser.run(compte.id, compte.nom, compte.email, compte.role);
      insererCredential.run(compte.id, compte.hash);
    }

    for (const tournoi of TOURNOIS) {
      insererTournoi.run(tournoi.id, tournoi.nom, tournoi.jeu, tournoi.etat);
    }

    for (const equipe of EQUIPES_TOURNOI_1) {
      insererEquipe.run(equipe.id, 1, equipe.nom, equipe.capitaineId);
      for (const membre of equipe.membres) insererMembre.run(equipe.id, 1, membre.userId, membre.roleJeu);
    }

    insererEquipesGenerees(
      2,
      NOMS_EQUIPES_TOURNOI_2,
      PREMIERE_EQUIPE_TOURNOI_2,
      PREMIER_JOUEUR_TOURNOI_2,
      NOMS_EQUIPES_TOURNOI_2.map(() => EFFECTIF_TOURNOI_2),
      [] // roles de jeu pas encore attribues
    );

    // B-12 : l'arbre du tournoi 2 est produit par le meme service que la cloture des
    // inscriptions, pour que le jeu de donnees ne puisse pas diverger du code.
    const arbre = genererArbre(
      2,
      NOMS_EQUIPES_TOURNOI_2.map((_, index) => PREMIERE_EQUIPE_TOURNOI_2 + index),
      1
    );
    for (const match of arbre) insererMatch.run(match);

    insererEquipesGenerees(
      3,
      NOMS_EQUIPES_TOURNOI_3,
      PREMIERE_EQUIPE_TOURNOI_3,
      PREMIER_JOUEUR_TOURNOI_3,
      EFFECTIFS_TOURNOI_3,
      ROLES_DE_JEU_TOURNOI_3
    );

    for (const message of MESSAGES) {
      insererMessage.run(message.id, message.equipeId, message.userId, message.contenu, message.createdAt);
    }
  })();
}
