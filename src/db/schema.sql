-- Schema de la base SQLite (fiche de decision 03).
-- Applique a chaque demarrage par src/db/connexion.ts : IF NOT EXISTS le rend sans effet
-- sur une base deja creee. Les cles etrangeres ne sont verifiees qu'avec
-- PRAGMA foreign_keys = ON, active par connexion.ts sur chaque connexion.
--
-- Colonnes en snake_case ; les requetes des repositories les renomment en camelCase
-- (AS equipeId...) pour rendre exactement les formes JSON de l'API.
--
-- Textes : la base garantit seulement qu'ils ne sont pas vides (<> ''). Les longueurs
-- maximales restent controlees par src/validation.ts : length() de SQLite s'arrete au
-- premier caractere NUL, un CHECK sur length() refuserait en 500 un texte que l'API accepte.

CREATE TABLE IF NOT EXISTS users (
  id    INTEGER PRIMARY KEY,
  nom   TEXT NOT NULL CHECK (nom <> ''),
  email TEXT NOT NULL UNIQUE,
  role  TEXT NOT NULL CHECK (role IN ('joueur', 'administrateur'))
);

-- Le hash est dans sa propre table : un SELECT sur users ne peut pas le renvoyer par megarde
CREATE TABLE IF NOT EXISTS credentials (
  user_id       INTEGER PRIMARY KEY REFERENCES users (id),
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tournois (
  id   INTEGER PRIMARY KEY,
  nom  TEXT NOT NULL CHECK (nom <> ''),
  jeu  TEXT NOT NULL CHECK (jeu <> ''),
  etat TEXT NOT NULL DEFAULT 'inscriptions_ouvertes'
       CHECK (etat IN ('inscriptions_ouvertes', 'inscriptions_closes', 'en_cours', 'termine'))
);

CREATE TABLE IF NOT EXISTS equipes (
  id           INTEGER PRIMARY KEY,
  tournoi_id   INTEGER NOT NULL REFERENCES tournois (id),
  nom          TEXT NOT NULL CHECK (nom <> ''),
  capitaine_id INTEGER NOT NULL REFERENCES users (id),
  eliminee     INTEGER NOT NULL DEFAULT 0 CHECK (eliminee IN (0, 1)),
  -- Cible de la cle etrangere composee de membres (B-07)
  UNIQUE (id, tournoi_id)
);

CREATE INDEX IF NOT EXISTS idx_equipes_tournoi ON equipes (tournoi_id);

-- id : ordre d'arrivee dans l'equipe, l'ordre dans lequel l'API liste les membres.
-- tournoi_id est recopie depuis l'equipe (la cle etrangere composee garantit qu'il est
-- le bon) pour que la base elle-meme interdise deux equipes a un joueur sur un tournoi.
CREATE TABLE IF NOT EXISTS membres (
  id         INTEGER PRIMARY KEY,
  equipe_id  INTEGER NOT NULL,
  tournoi_id INTEGER NOT NULL,
  user_id    INTEGER NOT NULL REFERENCES users (id),
  -- B-08 : chaque joueur a un role de jeu, attribue par le capitaine (null tant qu'il ne l'a pas fait)
  role_jeu   TEXT CHECK (role_jeu IS NULL OR role_jeu <> ''),
  FOREIGN KEY (equipe_id, tournoi_id) REFERENCES equipes (id, tournoi_id),
  -- Un joueur une seule fois par equipe
  UNIQUE (equipe_id, user_id),
  -- B-07 : une seule equipe par joueur et par tournoi
  UNIQUE (tournoi_id, user_id)
);

-- B-12 : arbre genere a la cloture. match_suivant_id pointe vers un match du tour suivant,
-- insere dans la meme transaction : la verification est differee a la fin de celle-ci.
CREATE TABLE IF NOT EXISTS matchs (
  id               INTEGER PRIMARY KEY,
  tournoi_id       INTEGER NOT NULL REFERENCES tournois (id),
  round            INTEGER NOT NULL CHECK (round >= 1),
  position         INTEGER NOT NULL CHECK (position >= 1),
  equipe1_id       INTEGER REFERENCES equipes (id),
  equipe2_id       INTEGER REFERENCES equipes (id),
  vainqueur_id     INTEGER REFERENCES equipes (id),
  match_suivant_id INTEGER REFERENCES matchs (id) DEFERRABLE INITIALLY DEFERRED,
  UNIQUE (tournoi_id, round, position),
  CHECK (equipe1_id IS NULL OR equipe2_id IS NULL OR equipe1_id <> equipe2_id),
  -- B-14 : le vainqueur est forcement une des deux equipes du match
  CHECK (vainqueur_id IS NULL OR vainqueur_id = equipe1_id OR vainqueur_id = equipe2_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY,
  equipe_id  INTEGER NOT NULL REFERENCES equipes (id),
  user_id    INTEGER NOT NULL REFERENCES users (id),
  contenu    TEXT NOT NULL CHECK (contenu <> ''),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_equipe ON messages (equipe_id);

-- B-06 : demandes d'adhesion, soumises a l'accord du capitaine
CREATE TABLE IF NOT EXISTS demandes (
  id         INTEGER PRIMARY KEY,
  equipe_id  INTEGER NOT NULL REFERENCES equipes (id),
  user_id    INTEGER NOT NULL REFERENCES users (id),
  statut     TEXT NOT NULL DEFAULT 'en_attente'
             CHECK (statut IN ('en_attente', 'acceptee', 'refusee', 'annulee')),
  created_at TEXT NOT NULL
);

-- Au plus une demande en attente par joueur et par equipe ; l'historique (refusees,
-- annulees) peut en compter plusieurs.
CREATE UNIQUE INDEX IF NOT EXISTS idx_demandes_une_en_attente
  ON demandes (equipe_id, user_id) WHERE statut = 'en_attente';
