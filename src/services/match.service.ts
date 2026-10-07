import { matchs, equipes, tournois } from '../models/fakeData';
import { Match } from '../models/types';
import { logger } from '../logger';

// B-08 : une equipe est au complet a cinq joueurs
export const EFFECTIF_COMPLET = 5;

/** Marque une equipe comme eliminee (B-18). */
function eliminer(equipeId: number | null): void {
  const equipe = equipes.find((e) => e.id === equipeId);
  if (equipe) equipe.eliminee = true;
}

/** Le tournoi n'a plus de match a jouer : il est termine. */
function terminerTournoi(tournoiId: number): void {
  const tournoi = tournois.find((t) => t.id === tournoiId);
  if (tournoi) tournoi.etat = 'termine';
}

/**
 * Match qui alimente le creneau demande du match passe en parametre.
 * Reciproque du chainage de l'arbre : (round r, position p) alimente
 * (round r + 1, position arrondi(p / 2)), en equipe1 si p est impair, en equipe2 sinon.
 */
function matchNourricier(match: Match, creneau: 1 | 2): Match | undefined {
  const position = match.position * 2 - (creneau === 1 ? 1 : 0);
  return matchs.find(
    (m) => m.tournoiId === match.tournoiId && m.round === match.round - 1 && m.position === position
  );
}

/** Un match est clos sans vainqueur quand ses deux equipes ont declare forfait (B-04). */
function estClosSansVainqueur(match: Match): boolean {
  if (match.vainqueurId) return false;

  // Les deux equipes sont connues et eliminees : double forfait
  if (match.equipe1Id && match.equipe2Id) {
    const equipe1 = equipes.find((e) => e.id === match.equipe1Id);
    const equipe2 = equipes.find((e) => e.id === match.equipe2Id);
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
function qualifierDOfficeSiPossible(match: Match): void {
  if (match.vainqueurId) return;

  const creneau1Mort = !match.equipe1Id && creneauMort(match, 1);
  const creneau2Mort = !match.equipe2Id && creneauMort(match, 2);

  if (match.equipe1Id && creneau2Mort) {
    logger.info('Qualification d office', {
      matchId: match.id,
      equipeId: match.equipe1Id,
      motif: 'adversaire_forfait',
    });
    return enregistrerVainqueur(match, match.equipe1Id);
  }

  if (match.equipe2Id && creneau1Mort) {
    logger.info('Qualification d office', {
      matchId: match.id,
      equipeId: match.equipe2Id,
      motif: 'adversaire_forfait',
    });
    return enregistrerVainqueur(match, match.equipe2Id);
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
    const suivant = matchs.find((m) => m.id === match.matchSuivantId);
    if (suivant) qualifierDOfficeSiPossible(suivant);
  }
}

/**
 * Enregistre le vainqueur d'un match et en tire toutes les consequences (B-14, B-18) :
 * - le perdant est elimine ;
 * - le vainqueur prend sa place dans le match suivant s'il y en a un ;
 * - sinon le match etait la finale, le tournoi est termine.
 *
 * Appelee par la saisie de resultat (B-13) comme par le forfait (B-15) : les deux
 * designent un vainqueur, seule la facon de le determiner change.
 * L'appelant a deja verifie que le tournoi est en cours, que les deux equipes sont
 * connues et que le match n'a pas encore de vainqueur.
 */
export function enregistrerVainqueur(match: Match, vainqueurId: number): void {
  match.vainqueurId = vainqueurId;

  // Le perdant est l'autre equipe du match (B-18)
  eliminer(vainqueurId === match.equipe1Id ? match.equipe2Id : match.equipe1Id);

  if (!match.matchSuivantId) {
    // Pas de match suivant : c'etait la finale
    return terminerTournoi(match.tournoiId);
  }

  const suivant = matchs.find((m) => m.id === match.matchSuivantId);
  if (!suivant) return;

  // B-14 : la place occupee depend de la position du match, pas de l'ordre des resultats.
  // Position impaire vers equipe1, position paire vers equipe2 : l'arbre reste stable
  // quel que soit l'ordre dans lequel l'administrateur saisit les resultats.
  if (match.position % 2 === 1) suivant.equipe1Id = vainqueurId;
  else suivant.equipe2Id = vainqueurId;

  qualifierDOfficeSiPossible(suivant);
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
export function declarerDoubleForfait(match: Match): void {
  eliminer(match.equipe1Id);
  eliminer(match.equipe2Id);

  if (!match.matchSuivantId) {
    return terminerTournoi(match.tournoiId);
  }

  const suivant = matchs.find((m) => m.id === match.matchSuivantId);
  if (suivant) qualifierDOfficeSiPossible(suivant);
}

/** Une equipe est forfait si elle n'a pas l'effectif complet (B-04, B-08). */
export function estIncomplete(equipeId: number | null): boolean {
  const equipe = equipes.find((e) => e.id === equipeId);
  if (!equipe) return true;
  return equipe.membres.length < EFFECTIF_COMPLET;
}

/**
 * Applique les forfaits du premier tour au lancement du tournoi (B-04) :
 * les equipes qui ne sont pas au complet perdent leur premier match.
 */
export function appliquerForfaitsAuLancement(tournoiId: number): void {
  const premierTour = matchs
    .filter((m) => m.tournoiId === tournoiId && m.round === 1)
    .sort((a, b) => a.position - b.position);

  for (const match of premierTour) {
    if (match.vainqueurId) continue;

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
      declarerDoubleForfait(match);
      continue;
    }

    if (equipe1Incomplete && match.equipe2Id) {
      logger.info('Forfait automatique au lancement', {
        matchId: match.id,
        equipeId: match.equipe1Id,
        motif: 'effectif_incomplet',
      });
      enregistrerVainqueur(match, match.equipe2Id);
      continue;
    }

    if (equipe2Incomplete && match.equipe1Id) {
      logger.info('Forfait automatique au lancement', {
        matchId: match.id,
        equipeId: match.equipe2Id,
        motif: 'effectif_incomplet',
      });
      enregistrerVainqueur(match, match.equipe1Id);
    }
  }
}
