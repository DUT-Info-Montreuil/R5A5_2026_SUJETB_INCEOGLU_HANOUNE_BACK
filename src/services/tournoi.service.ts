import { enTransaction } from '../db/connexion';
import { insererMatchs, prochainIdDeMatch } from '../db/matchs.repository';
import { changerEtatTournoi } from '../db/tournois.repository';
import { genererArbre } from './bracket.service';

/**
 * Cloture les inscriptions et genere l'arbre (B-03, B-12), en une transaction : un tournoi
 * clos a toujours son arbre, et un arbre n'existe jamais sur un tournoi encore ouvert.
 *
 * equipeIds : les huit equipes engagees, dans l'ordre d'inscription (id croissant), qui est
 * l'ordre de placement dans l'arbre. L'appelant a verifie l'etat du tournoi et le nombre
 * d'equipes. Renvoie le nombre de matchs crees.
 */
export function cloturerEtGenererArbre(tournoiId: number, equipeIds: number[]): number {
  return enTransaction(() => {
    changerEtatTournoi(tournoiId, 'inscriptions_closes');
    // Le premier id libre est lu dans la transaction : genererArbre en deduit les matchSuivantId
    const arbre = genererArbre(tournoiId, equipeIds, prochainIdDeMatch());
    insererMatchs(arbre);
    return arbre.length;
  });
}
