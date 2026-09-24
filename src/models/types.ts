export type Role = 'joueur' | 'administrateur';

export type EtatTournoi =
   'inscriptions_ouvertes'
  | 'inscriptions_closes'
  | 'en_cours'
  | 'termine';

export interface User {
  id: number;
  nom: string;
  email: string;
  role: Role;
}

export interface Tournoi {
  id: number;
  nom: string;
  jeu: string;
  etat: EtatTournoi;
}

export interface MembreEquipe {
  userId: number;
  nom: string;
  roleJeu: string | null;
}

export interface Equipe {
  id: number;
  tournoiId: number;
  nom: string;
  capitaineId: number;
  eliminee: boolean;
  membres: MembreEquipe[];
}
export interface Match {
  id: number;
  tournoiId: number;
  round: number;
  position: number;
  equipe1Id: number | null;
  equipe2Id: number | null;
  vainqueurId: number | null;
  matchSuivantId: number | null;
}

export interface Message {
  id: number;
  equipeId: number;
  userId: number;
  contenu: string;
  createdAt: string;
}
export interface Credentials{
  userId:number;
  passwordHash: string;
}