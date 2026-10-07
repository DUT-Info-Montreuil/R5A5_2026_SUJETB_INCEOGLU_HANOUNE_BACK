import { genererArbre } from '../src/services/bracket.service';
import { Match } from '../src/models/types';

// B-12 : tests unitaires de la generation de l'arbre. La fonction est pure,
// aucun appel HTTP et aucune donnee de fakeData n'intervient ici.
describe('Generation de l arbre (B-12)', () => {
  const TOURNOI_ID = 42;
  const EQUIPES = [11, 12, 13, 14, 15, 16, 17, 18];
  const PREMIER_ID = 100;

  let arbre: Match[];

  const trouver = (round: number, position: number) =>
    arbre.find((m) => m.round === round && m.position === position)!;

  beforeEach(() => {
    arbre = genererArbre(TOURNOI_ID, EQUIPES, PREMIER_ID);
  });

  it('B-12 : huit equipes engagees produisent sept matchs sur trois tours', () => {
    expect(arbre).toHaveLength(7);
    expect(arbre.filter((m) => m.round === 1)).toHaveLength(4);
    expect(arbre.filter((m) => m.round === 2)).toHaveLength(2);
    expect(arbre.filter((m) => m.round === 3)).toHaveLength(1);
    expect(arbre.every((m) => m.tournoiId === TOURNOI_ID)).toBe(true);
  });

  it('B-12 : les equipes sont placees au premier tour dans l ordre d inscription', () => {
    expect([trouver(1, 1).equipe1Id, trouver(1, 1).equipe2Id]).toEqual([11, 12]);
    expect([trouver(1, 2).equipe1Id, trouver(1, 2).equipe2Id]).toEqual([13, 14]);
    expect([trouver(1, 3).equipe1Id, trouver(1, 3).equipe2Id]).toEqual([15, 16]);
    expect([trouver(1, 4).equipe1Id, trouver(1, 4).equipe2Id]).toEqual([17, 18]);
  });

  it('B-14 : les tours suivants n ont pas encore d equipes connues', () => {
    for (const m of arbre.filter((match) => match.round > 1)) {
      expect(m.equipe1Id).toBeNull();
      expect(m.equipe2Id).toBeNull();
    }
    expect(arbre.every((m) => m.vainqueurId === null)).toBe(true);
  });

  it('B-12 : chaque match pointe vers le match du tour suivant a la position attendue', () => {
    expect(trouver(1, 1).matchSuivantId).toBe(trouver(2, 1).id);
    expect(trouver(1, 2).matchSuivantId).toBe(trouver(2, 1).id);
    expect(trouver(1, 3).matchSuivantId).toBe(trouver(2, 2).id);
    expect(trouver(1, 4).matchSuivantId).toBe(trouver(2, 2).id);
    expect(trouver(2, 1).matchSuivantId).toBe(trouver(3, 1).id);
    expect(trouver(2, 2).matchSuivantId).toBe(trouver(3, 1).id);
  });

  it('B-12 : la finale ne pointe vers aucun match suivant', () => {
    expect(trouver(3, 1).matchSuivantId).toBeNull();
    // Un seul match sans suite : l'arbre converge bien vers une unique finale
    expect(arbre.filter((m) => m.matchSuivantId === null)).toHaveLength(1);
  });

  it('B-12 : les ids sont attribues a partir du premier id fourni, sans doublon', () => {
    const ids = arbre.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Math.min(...ids)).toBe(PREMIER_ID);
    expect(Math.max(...ids)).toBe(PREMIER_ID + 6);
  });

  it('B-12 : un nombre d equipes different de huit est refuse', () => {
    expect(() => genererArbre(TOURNOI_ID, EQUIPES.slice(0, 7), PREMIER_ID)).toThrow();
    expect(() => genererArbre(TOURNOI_ID, [...EQUIPES, 19], PREMIER_ID)).toThrow();
  });
});
