import request from 'supertest';
import app from '../src/app';
import { Match } from '../src/models/types';

// Comptes de fakeData.ts (meme mot de passe pour tous les comptes de test)
export const MOT_DE_PASSE = 'motdepasse';

export const COMPTES = {
  admin: 'admin@iut.fr',
  zeki: 'zeki@iut.fr',
  hanoune: 'hanoune@iut.fr',
  lea: 'lea@iut.fr',
  // Joueur membre d'aucune equipe
  sami: 'sami@iut.fr',
} as const;

// Se connecte et renvoie le JWT. Echoue bruyamment si le login ne passe pas,
// pour ne pas confondre "compte de test casse" et "regle d'acces violee".
export async function connexion(email: string, motDePasse: string = MOT_DE_PASSE): Promise<string> {
  const reponse = await request(app).post('/api/auth/login').send({ email, password: motDePasse });
  if (reponse.status !== 200) {
    throw new Error(`Connexion impossible pour ${email} (statut ${reponse.status})`);
  }
  return reponse.body.token;
}

// Cree un tournoi neuf (etat inscriptions_ouvertes) et renvoie son id.
// Chaque test qui modifie l'etat du tournoi travaille ainsi sur ses propres donnees.
export async function creerTournoi(jetonAdmin: string, nom: string): Promise<number> {
  const reponse = await request(app)
    .post('/api/tournois')
    .set('Authorization', `Bearer ${jetonAdmin}`)
    .send({ nom, jeu: 'Valorant' });
  if (reponse.status !== 201) {
    throw new Error(`Creation du tournoi impossible (statut ${reponse.status})`);
  }
  return reponse.body.id;
}

// Cree une equipe sur un tournoi : l'auteur du jeton devient capitaine.
export async function creerEquipe(jeton: string, tournoiId: number, nom: string): Promise<number> {
  const reponse = await request(app)
    .post('/api/equipes')
    .set('Authorization', `Bearer ${jeton}`)
    .send({ tournoiId, nom });
  if (reponse.status !== 201) {
    throw new Error(`Creation de l'equipe impossible (statut ${reponse.status})`);
  }
  return reponse.body.id;
}

// Fait rejoindre l'equipe par le porteur du jeton.
export async function rejoindreEquipe(jeton: string, equipeId: number): Promise<void> {
  const reponse = await request(app)
    .post(`/api/equipes/${equipeId}/membres`)
    .set('Authorization', `Bearer ${jeton}`)
    .send({});
  if (reponse.status !== 201) {
    throw new Error(`Adhesion a l'equipe impossible (statut ${reponse.status})`);
  }
}

// B-08 : une equipe est au complet a cinq joueurs
export const EFFECTIF_COMPLET = 5;

// B-12 : un tournoi se joue a huit equipes
export const NOMBRE_EQUIPES = 8;

// Vivier de joueurs de test, cree via l'API et reutilise d'un tournoi a l'autre :
// B-07 n'interdit qu'une double appartenance sur un meme tournoi. Jest donne a chaque
// fichier de test son propre registre de modules, donc son propre vivier et ses propres
// donnees en memoire. Creer les joueurs coute deux hachages bcrypt chacun, on ne les
// cree donc qu'une fois par fichier.
const vivierJetons: string[] = [];
let joueursCrees = 0;

async function jetonsDuVivier(nombre: number): Promise<string[]> {
  while (vivierJetons.length < nombre) {
    joueursCrees++;
    const email = `joueur.test.${joueursCrees}@iut.fr`;

    const inscription = await request(app)
      .post('/api/auth/register')
      .send({ nom: `Joueur test ${joueursCrees}`, email, password: MOT_DE_PASSE });
    if (inscription.status !== 201) {
      throw new Error(`Inscription impossible pour ${email} (statut ${inscription.status})`);
    }

    vivierJetons.push(await connexion(email));
  }
  return vivierJetons.slice(0, nombre);
}

/**
 * Cree d'avance les joueurs du vivier. A appeler dans un beforeAll : la creation coute
 * deux hachages bcrypt par joueur, autant la payer une fois, au vu de tous, plutot que
 * de la faire supporter au premier test qui en a besoin.
 */
export async function prechargerVivier(nombreDeJoueurs: number): Promise<void> {
  await jetonsDuVivier(nombreDeJoueurs);
}

export interface TournoiDeTest {
  tournoiId: number;
  /** Ids des huit equipes, dans l'ordre d'inscription, donc dans l'ordre de l'arbre (B-12). */
  equipeIds: number[];
}

/**
 * Construit via l'API un tournoi avec ses huit equipes engagees (B-12).
 *
 * effectifs : nombre de joueurs par equipe, soit un nombre applique aux huit equipes,
 * soit un tableau de huit valeurs pour melanger equipes completes et incompletes (B-04).
 * jetonsPremiereEquipe : comptes existants a placer dans la premiere equipe, le premier
 * en devenant capitaine ; le reste de l'effectif est complete avec le vivier.
 *
 * Rien n'est ecrit directement dans fakeData : tout passe par les routes.
 */
export async function creerTournoiAHuitEquipes(
  jetonAdmin: string,
  options: { nom: string; effectifs?: number | number[]; jetonsPremiereEquipe?: string[] }
): Promise<TournoiDeTest> {
  const { nom, jetonsPremiereEquipe = [] } = options;

  const effectifs =
    typeof options.effectifs === 'number' || options.effectifs === undefined
      ? new Array(NOMBRE_EQUIPES).fill(options.effectifs ?? EFFECTIF_COMPLET)
      : options.effectifs;

  if (effectifs.length !== NOMBRE_EQUIPES || effectifs.some((e) => e < 1)) {
    throw new Error(`effectifs doit decrire ${NOMBRE_EQUIPES} equipes d au moins un joueur`);
  }

  const fournisPremiereEquipe = jetonsPremiereEquipe.slice(0, effectifs[0]);
  const besoin =
    effectifs.reduce((total, effectif) => total + effectif, 0) - fournisPremiereEquipe.length;

  const vivier = await jetonsDuVivier(besoin);
  let curseur = 0;

  const tournoiId = await creerTournoi(jetonAdmin, nom);
  const equipeIds: number[] = [];

  for (let index = 0; index < NOMBRE_EQUIPES; index++) {
    const fournis = index === 0 ? fournisPremiereEquipe : [];
    const complement = vivier.slice(curseur, curseur + effectifs[index] - fournis.length);
    curseur += complement.length;

    const [jetonCapitaine, ...jetonsMembres] = [...fournis, ...complement];

    const equipeId = await creerEquipe(jetonCapitaine, tournoiId, `${nom} - equipe ${index + 1}`);
    for (const jetonMembre of jetonsMembres) {
      await rejoindreEquipe(jetonMembre, equipeId);
    }
    equipeIds.push(equipeId);
  }

  return { tournoiId, equipeIds };
}

/** Cloture les inscriptions : l'arbre est genere a ce moment-la (B-03, B-12). */
export async function cloturerInscriptions(jetonAdmin: string, tournoiId: number): Promise<void> {
  const reponse = await request(app)
    .patch(`/api/tournois/${tournoiId}/cloturer`)
    .set('Authorization', `Bearer ${jetonAdmin}`)
    .send({});
  if (reponse.status !== 200) {
    throw new Error(`Cloture impossible (statut ${reponse.status})`);
  }
}

/** Lance le tournoi : les equipes incompletes sont alors forfait (B-04). */
export async function lancerTournoi(jetonAdmin: string, tournoiId: number): Promise<void> {
  const reponse = await request(app)
    .patch(`/api/tournois/${tournoiId}/lancer`)
    .set('Authorization', `Bearer ${jetonAdmin}`)
    .send({});
  if (reponse.status !== 200) {
    throw new Error(`Lancement impossible (statut ${reponse.status})`);
  }
}

/** Matchs d'un tournoi, tries par round puis par position. */
export async function arbreDuTournoi(tournoiId: number): Promise<Match[]> {
  const reponse = await request(app).get(`/api/tournois/${tournoiId}/matchs`);
  if (reponse.status !== 200) {
    throw new Error(`Lecture de l arbre impossible (statut ${reponse.status})`);
  }
  return (reponse.body as Match[]).sort((a, b) => a.round - b.round || a.position - b.position);
}

/** Retrouve un match par son round et sa position dans l'arbre. */
export async function match(tournoiId: number, round: number, position: number): Promise<Match> {
  const trouve = (await arbreDuTournoi(tournoiId)).find(
    (m) => m.round === round && m.position === position
  );
  if (!trouve) {
    throw new Error(`Match introuvable (round ${round}, position ${position})`);
  }
  return trouve;
}
