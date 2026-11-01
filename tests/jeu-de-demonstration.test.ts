import { api } from './api';
import { COMPTES, arbreDuTournoi, cloturerInscriptions, connexion, lancerTournoi } from './helpers';
import { Equipe } from '../src/models/types';

// Jeu de demonstration (src/db/seed.ts), tournoi 3 « Coupe de demonstration » : il doit permettre
// de tester en un clic la cloture (arbre), le lancement (forfait B-04) et les resultats.
// Seul ce fichier depend du tournoi 3 : les autres tests creent leurs donnees via l'API.
// Le scenario tient en un seul test, il ne depend donc pas de l'ordre d'execution.
describe('Jeu de demonstration : tournoi 3', () => {
  const TOURNOI_DEMO = 3;
  // Equipes 11 a 18 ; la derniere (Demo Hotel) n'a que quatre joueurs
  const EQUIPE_INCOMPLETE = 18;

  it('cloture, lancement avec forfait de l equipe incomplete, puis saisie d un resultat', async () => {
    const tournoi = await api().get(`/api/tournois/${TOURNOI_DEMO}`);
    expect(tournoi.body).toMatchObject({ nom: 'Coupe de demonstration', etat: 'inscriptions_ouvertes' });

    // Huit equipes : sept completes, une a quatre ; chaque joueur a un role de jeu (B-08)
    const equipes = (await api().get(`/api/tournois/${TOURNOI_DEMO}/equipes`)).body as Equipe[];
    expect(equipes.map((e) => e.membres.length).sort()).toEqual([4, 5, 5, 5, 5, 5, 5, 5]);
    expect(equipes.find((e) => e.id === EQUIPE_INCOMPLETE)?.membres).toHaveLength(4);
    expect(equipes.every((e) => e.membres.every((m) => m.roleJeu !== null))).toBe(true);

    // Les comptes joueurN@iut.fr du tournoi 3 se connectent avec le mot de passe commun
    await connexion('joueur46@iut.fr');
    await connexion('joueur84@iut.fr');

    const jetonAdmin = await connexion(COMPTES.admin);

    // B-03, B-12 : la cloture genere l'arbre
    await cloturerInscriptions(jetonAdmin, TOURNOI_DEMO);
    expect(await arbreDuTournoi(TOURNOI_DEMO)).toHaveLength(7);

    // B-04 : au lancement, l'equipe incomplete est forfait au premier match
    await lancerTournoi(jetonAdmin, TOURNOI_DEMO);
    const arbre = await arbreDuTournoi(TOURNOI_DEMO);
    const matchIncomplet = arbre.find(
      (m) => m.round === 1 && (m.equipe1Id === EQUIPE_INCOMPLETE || m.equipe2Id === EQUIPE_INCOMPLETE)
    )!;
    const adversaire =
      matchIncomplet.equipe1Id === EQUIPE_INCOMPLETE ? matchIncomplet.equipe2Id : matchIncomplet.equipe1Id;
    expect(matchIncomplet.vainqueurId).toBe(adversaire);
    expect((await api().get(`/api/equipes/${EQUIPE_INCOMPLETE}`)).body.eliminee).toBe(true);

    // B-13, B-14 : un match de premier tour entre deux equipes completes se joue normalement
    const matchJouable = arbre.find((m) => m.round === 1 && m.vainqueurId === null)!;
    const resultat = await api()
      .patch(`/api/matchs/${matchJouable.id}/resultat`)
      .set('Authorization', `Bearer ${jetonAdmin}`)
      .send({ vainqueurId: matchJouable.equipe1Id });
    expect(resultat.status).toBe(200);
    // Le gagnant avance au match suivant
    const suivant = (await arbreDuTournoi(TOURNOI_DEMO)).find((m) => m.id === matchJouable.matchSuivantId)!;
    expect([suivant.equipe1Id, suivant.equipe2Id]).toContain(matchJouable.equipe1Id);
  });
});
