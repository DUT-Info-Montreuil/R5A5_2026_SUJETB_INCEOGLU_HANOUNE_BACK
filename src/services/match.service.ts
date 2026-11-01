import { Match } from '../models/types';
import { logger } from '../logger';
import { enTransaction } from '../db/connexion';
import { marquerEliminee, trouverEquipe } from '../db/equipes.repository';
import {
  definirVainqueur,
  listerMatchsDuTournoi,
  placerEquipe,
  trouverMatch,
  trouverMatchParPlace,
} from '../db/matchs.repository';
import { changerEtatTournoi } from '../db/tournois.repository';
import { fermerEspaceEquipe } from '../realtime/diffusion';

// B-08 : une equipe est au complet a cinq joueurs
export const EFFECTIF_COMPLET = 5;

// Les fonctions internes ecrivent en base au fil de la cascade (avancement, qualifications
// d'office, eliminations). Les fonctions exportees les enveloppent dans UNE transaction :
// la cascade est appliquee en entier ou pas du tout.
// Les equipes eliminees sont collectees pendant la cascade et leur espace n'est ferme
// en temps reel qu'apres le commit : on ne diffuse jamais un etat qui pourrait etre annule.
type Eliminees = number[];

/** Marque une equipe comme eliminee (B-18). */
function eliminer(equipeId: number | null, eliminees: Eliminees): void {
  if (!equipeId || !trouverEquipe(equipeId)) return;
  marquerEliminee(equipeId);
  eliminees.push(equipeId);
}

/** B-18 : l'espace d'echange des equipes eliminees se ferme aussitot pour leurs membres. */
function fermerEspaces(eliminees: Eliminees): void {
  for (const equipeId of eliminees) {
    const equipe = trouverEquipe(equipeId);
    if (equipe) fermerEspaceEquipe(equipe);
  }
}

/** Le tournoi n'a plus de match a jouer : il est termine. */
function terminerTournoi(tournoiId: number): void {
  changerEtatTournoi(tournoiId, 'termine');
}

/**
 * Match qui alimente le creneau demande du match passe en parametre.
 * Reciproque du chainage de l'arbre : (round r, position p) alimente
 * (round r + 1, position arrondi(p / 2)), en equipe1 si p est impair, en equipe2 sinon.
 */
function matchNourricier(match: Match, creneau: 1 | 2): Match | undefined {
  const position = match.position * 2 - (creneau === 1 ? 1 : 0);
  return trouverMatchParPlace(match.tournoiId, match.round - 1, position);
}

/** Un match est clos sans vainqueur quand ses deux equipes ont declare forfait (B-04). */
function estClosSansVainqueur(match: Match): boolean {
  if (match.vainqueurId) return false;

  // Les deux equipes sont connues et eliminees : double forfait
  if (match.equipe1Id && match.equipe2Id) {
    const equipe1 = trouverEquipe(match.equipe1Id);
    const equipe2 = trouverEquipe(match.equipe2Id);
    return Boolean(equipe1?.eliminee && equipe2?.eliminee);
  }

  // Aucune equipe ne peut plus arriver : le match est mort par propagation
  return creneauMort(match, 1) && creneauMort(match, 2);
}

/**
 * Un creneau est mort quand aucune equipe ne pourra jamais l'occuper : le match qui
 * devait l'alimenter est lui-meme clos sans vainqueur (B-04, propagation du forfait).
 */
function creneauMort(match: Match, creneau: 1 | 2): boolean {
  // Les creneaux du premier tour sont pourvus des la cloture (B-12)
  if (match.round === 1) return false;

  const nourricier = matchNourricier(match, creneau);
  if (!nourricier) return false;

  return estClosSansVainqueur(nourricier);
}

/**
 * Qualifie d'office l'equipe presente quand son adversaire ne viendra jamais (B-04),
 * et propage la situation au tour suivant si le match ne peut plus etre joue du tout.
 * Sans cela, un match reste indefiniment injouable au sens de B-14.
 */
function qualifierDOfficeSiPossible(match: Match, eliminees: Eliminees): void {
  if (match.vainqueurId) return;

  const creneau1Mort = !match.equipe1Id && creneauMort(match, 1);
  const creneau2Mort = !match.equipe2Id && creneauMort(match, 2);

  if (match.equipe1Id && creneau2Mort) {
    logger.info('Qualification d office', {
      matchId: match.id,
      equipeId: match.equipe1Id,
      motif: 'adversaire_forfait',
    });
    return enregistrerVainqueur(match, match.equipe1Id, eliminees);
  }

  if (match.equipe2Id && creneau1Mort) {
    logger.info('Qualification d office', {
      matchId: match.id,
      equipeId: match.equipe2Id,
      motif: 'adversaire_forfait',
    });
    return enregistrerVainqueur(match, match.equipe2Id, eliminees);
  }

  if (creneau1Mort && creneau2Mort) {
    // Les deux branches sont mortes : ce match non plus ne sera jamais joue
    if (!match.matchSuivantId) {
      // Cas limite : plus aucune equipe ne peut atteindre la finale, le tournoi
      // se termine sans vainqueur plutot que de rester bloque en cours.
      logger.warn('Tournoi termine sans vainqueur', {
        tournoiId: match.tournoiId,
        matchId: match.id,
        motif: 'forfaits_en_cascade',
      });
      return terminerTournoi(match.tournoiId);
    }
    const suivant = trouverMatch(match.matchSuivantId);
    if (suivant) qualifierDOfficeSiPossible(suivant, eliminees);
  }
}

/**
 * Enregistre le vainqueur d'un match et en tire toutes les consequences (B-14, B-18) :
 * - le perdant est elimine ;
 * - le vainqueur prend sa place dans le match suivant s'il y en a un ;
 * - sinon le match etait la finale, le tournoi est termine.
 */
function enregistrerVainqueur(match: Match, vainqueurId: number, eliminees: Eliminees): void {
  definirVainqueur(match.id, vainqueurId);

  // Le perdant est l'autre equipe du match (B-18)
  eliminer(vainqueurId === match.equipe1Id ? match.equipe2Id : match.equipe1Id, eliminees);

  if (!match.matchSuivantId) {
    // Pas de match suivant : c'etait la finale
    return terminerTournoi(match.tournoiId);
  }

  // B-14 : la place occupee depend de la position du match, pas de l'ordre des resultats.
  // Position impaire vers equipe1, position paire vers equipe2 : l'arbre reste stable
  // quel que soit l'ordre dans lequel l'administrateur saisit les resultats.
  placerEquipe(match.matchSuivantId, match.position % 2 === 1 ? 1 : 2, vainqueurId);

  // Relu apres l'ecriture : la qualification d'office raisonne sur le match a jour
  const suivant = trouverMatch(match.matchSuivantId);
  if (suivant) qualifierDOfficeSiPossible(suivant, eliminees);
}

/**
 * Double forfait sur un meme match (B-04).
 *
 * Le sujet ne prevoit pas le cas ou les deux equipes d'un match sont incompletes au
 * lancement. Regle retenue : les deux sont eliminees, aucune n'avance, et le creneau
 * qu'elles devaient occuper au tour suivant reste vide. L'equipe qui se presente en face
 * au tour suivant est alors qualifiee d'office, ce qui fait remonter le forfait dans
 * l'arbre au lieu de bloquer le tournoi.
 */
function declarerDoubleForfait(match: Match, eliminees: Eliminees): void {
  eliminer(match.equipe1Id, eliminees);
  eliminer(match.equipe2Id, eliminees);

  if (!match.matchSuivantId) {
    return terminerTournoi(match.tournoiId);
  }

  const suivant = trouverMatch(match.matchSuivantId);
  if (suivant) qualifierDOfficeSiPossible(suivant, eliminees);
}

/** Une equipe est forfait si elle n'a pas l'effectif complet (B-04, B-08). */
export function estIncomplete(equipeId: number | null): boolean {
  const equipe = equipeId ? trouverEquipe(equipeId) : undefined;
  if (!equipe) return true;
  return equipe.membres.length < EFFECTIF_COMPLET;
}

/**
 * Applique les forfaits du premier tour au lancement du tournoi (B-04) :
 * les equipes qui ne sont pas au complet perdent leur premier match.
 */
function appliquerForfaitsAuLancement(tournoiId: number, eliminees: Eliminees): void {
  const positions = listerMatchsDuTournoi(tournoiId)
    .filter((m) => m.round === 1)
    .map((m) => m.position)
    .sort((a, b) => a - b);

  for (const position of positions) {
    // Relu a chaque tour de boucle : la cascade d'un forfait precedent a pu modifier l'arbre
    const match = trouverMatchParPlace(tournoiId, 1, position);
    if (!match || match.vainqueurId) continue;

    const equipe1Incomplete = estIncomplete(match.equipe1Id);
    const equipe2Incomplete = estIncomplete(match.equipe2Id);

    if (equipe1Incomplete && equipe2Incomplete) {
      logger.info('Forfait automatique au lancement', {
        matchId: match.id,
        equipeId: match.equipe1Id,
        motif: 'effectif_incomplet',
      });
      logger.info('Forfait automatique au lancement', {
        matchId: match.id,
        equipeId: match.equipe2Id,
        motif: 'effectif_incomplet',
      });
      declarerDoubleForfait(match, eliminees);
      continue;
    }

    if (equipe1Incomplete && match.equipe2Id) {
      logger.info('Forfait automatique au lancement', {
        matchId: match.id,
        equipeId: match.equipe1Id,
        motif: 'effectif_incomplet',
      });
      enregistrerVainqueur(match, match.equipe2Id, eliminees);
      continue;
    }

    if (equipe2Incomplete && match.equipe1Id) {
      logger.info('Forfait automatique au lancement', {
        matchId: match.id,
        equipeId: match.equipe2Id,
        motif: 'effectif_incomplet',
      });
      enregistrerVainqueur(match, match.equipe1Id, eliminees);
    }
  }
}

/**
 * Designe le vainqueur d'un match et applique toute la cascade en une transaction
 * (B-14, B-18). Appelee par la saisie de resultat (B-13) comme par le forfait (B-15) :
 * les deux designent un vainqueur, seule la facon de le determiner change.
 * L'appelant a deja verifie que le tournoi est en cours, que les deux equipes sont
 * connues, qu'aucune n'est eliminee et que le match n'a pas encore de vainqueur.
 */
export function designerVainqueur(matchId: number, vainqueurId: number): void {
  const eliminees = enTransaction(() => {
    const collecte: Eliminees = [];
    const match = trouverMatch(matchId);
    if (match) enregistrerVainqueur(match, vainqueurId, collecte);
    return collecte;
  });
  fermerEspaces(eliminees);
}

/**
 * Lance le tournoi (B-04) : passage en cours et forfaits des equipes incompletes au
 * premier tour, en une transaction. L'appelant a verifie que les inscriptions sont closes.
 */
export function lancerTournoi(tournoiId: number): void {
  const eliminees = enTransaction(() => {
    const collecte: Eliminees = [];
    changerEtatTournoi(tournoiId, 'en_cours');
    appliquerForfaitsAuLancement(tournoiId, collecte);
    return collecte;
  });
  fermerEspaces(eliminees);
}
