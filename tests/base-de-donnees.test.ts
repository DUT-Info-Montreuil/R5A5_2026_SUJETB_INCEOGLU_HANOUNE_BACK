import fs from 'fs';
import os from 'os';
import path from 'path';
import { db, enTransaction } from '../src/db/connexion';
import { compterEquipesDuTournoi, creerEquipe, estEngageSurTournoi } from '../src/db/equipes.repository';
import { definirVainqueur, trouverMatch } from '../src/db/matchs.repository';
import { changerEtatTournoi, creerTournoi, listerTournois, trouverTournoi } from '../src/db/tournois.repository';
import { EtatTournoi } from '../src/models/types';

// Couche base de donnees (fiche de decision 03) : persistance, transactions, et regles que
// la base garantit d'elle-meme, meme si une route oubliait un controle.
// Ce fichier a sa propre base ':memory:' (tests/setupEnv.ts), sauf le test de persistance
// qui ouvre un fichier temporaire, jamais data/tournois.db.

type ModuleConnexion = typeof import('../src/db/connexion');
type ModuleUtilisateurs = typeof import('../src/db/utilisateurs.repository');
type ModuleTournois = typeof import('../src/db/tournois.repository');

describe('Base de donnees', () => {
  describe('persistance', () => {
    let dossier: string;
    const dbPathInitial = process.env.DB_PATH;

    beforeAll(() => {
      dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'tournois-test-'));
      process.env.DB_PATH = path.join(dossier, 'tournois.db');
    });

    afterAll(() => {
      process.env.DB_PATH = dbPathInitial;
      fs.rmSync(dossier, { recursive: true, force: true });
    });

    // Simule un demarrage du serveur : modules neufs, donc nouvelle connexion au fichier
    function demarrer<T>(fn: (modules: { utilisateurs: ModuleUtilisateurs; tournois: ModuleTournois }) => T): T {
      let resultat!: T;
      jest.isolateModules(() => {
        const connexion = require('../src/db/connexion') as ModuleConnexion;
        try {
          resultat = fn({
            utilisateurs: require('../src/db/utilisateurs.repository'),
            tournois: require('../src/db/tournois.repository'),
          });
        } finally {
          connexion.db.close();
        }
      });
      return resultat;
    }

    it('les donnees creees survivent a un redemarrage, sans re-insertion du jeu de demonstration', () => {
      const avant = demarrer(({ utilisateurs, tournois }) => {
        const joueur = utilisateurs.creerJoueur('Persistant', 'persistant@iut.fr', 'hash-de-test');
        tournois.creerTournoi('Tournoi persistant', 'Valorant');
        return { joueur, nombreDeTournois: tournois.listerTournois({}).length };
      });

      demarrer(({ utilisateurs, tournois }) => {
        expect(utilisateurs.trouverUtilisateurParEmail('persistant@iut.fr')).toEqual(avant.joueur);
        // Le jeu de demonstration n'est insere que dans une base vide : rien n'est double
        expect(tournois.listerTournois({})).toHaveLength(avant.nombreDeTournois);
        expect(tournois.listerTournois({}).map((t) => t.nom)).toContain('Tournoi persistant');
      });
    });
  });

  describe('transactions', () => {
    it('une transaction interrompue par une erreur n applique aucune de ses ecritures', () => {
      const avant = listerTournois({});

      expect(() =>
        enTransaction(() => {
          creerTournoi('Tournoi annule', 'Valorant');
          throw new Error('panne simulee');
        })
      ).toThrow('panne simulee');

      expect(listerTournois({})).toEqual(avant);
    });
  });

  describe('regles garanties par la base', () => {
    // Sami (id 5) : joueur du jeu de demonstration membre d'aucune equipe
    const SAMI = 5;
    const TOURNOI_OUVERT = 1;

    it('B-07 : un second engagement du meme joueur sur un tournoi est refuse, sans equipe orpheline', () => {
      creerEquipe(TOURNOI_OUVERT, 'Premiere equipe de Sami', SAMI);
      const equipesAvant = compterEquipesDuTournoi(TOURNOI_OUVERT);

      // Contourne volontairement le controle de la route : c'est la base qui refuse
      expect(() => creerEquipe(TOURNOI_OUVERT, 'Seconde equipe de Sami', SAMI)).toThrow(/UNIQUE/);

      // L'equipe et son capitaine sont crees ensemble ou pas du tout
      expect(compterEquipesDuTournoi(TOURNOI_OUVERT)).toBe(equipesAvant);
      expect(estEngageSurTournoi(SAMI, TOURNOI_OUVERT)).toBe(true);
    });

    it('B-14 : un vainqueur etranger au match est refuse et le match reste inchange', () => {
      // Match 1 du jeu de demonstration : equipes 3 et 4, sans vainqueur
      const avant = trouverMatch(1);

      expect(() => definirVainqueur(1, 5)).toThrow(/CHECK/);

      expect(trouverMatch(1)).toEqual(avant);
    });

    it('un etat de tournoi inconnu est refuse', () => {
      const avant = trouverTournoi(TOURNOI_OUVERT);

      expect(() => changerEtatTournoi(TOURNOI_OUVERT, 'archive' as EtatTournoi)).toThrow(/CHECK/);

      expect(trouverTournoi(TOURNOI_OUVERT)).toEqual(avant);
    });

    // length() de SQLite s'arrete au premier caractere NUL : les CHECK du schema ne doivent
    // pas transformer en erreur 500 un texte que la validation de l'API accepte
    it('un texte commencant par un caractere NUL est stocke tel quel, comme avant la base', () => {
      const tournoi = creerTournoi('\u0000Coupe', 'Valorant');

      expect(trouverTournoi(tournoi.id)?.nom).toBe('\u0000Coupe');
    });

    it('les cles etrangeres sont verifiees : pas de membre dans une equipe inexistante', () => {
      const insertion = db.prepare('INSERT INTO membres (equipe_id, tournoi_id, user_id) VALUES (?, ?, ?)');
      // Zeki (id 2) n'est engage sur aucune equipe du tournoi 2 : seule la cle etrangere
      // peut refuser, quel que soit l'ordre d'execution des autres tests
      const ZEKI = 2;
      const TOURNOI_EN_COURS = 2;

      expect(() => insertion.run(9999, TOURNOI_EN_COURS, ZEKI)).toThrow(/FOREIGN KEY/);
      expect(estEngageSurTournoi(ZEKI, TOURNOI_EN_COURS)).toBe(false);
    });
  });
});
