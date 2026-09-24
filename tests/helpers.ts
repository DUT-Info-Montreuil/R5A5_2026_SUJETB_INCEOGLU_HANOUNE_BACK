import request from 'supertest';
import app from '../src/app';

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
