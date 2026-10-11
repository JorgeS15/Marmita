-- Definições partilhadas (chave/valor), preparações por dia e bloco de ideias.

CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

CREATE TABLE preparations (
  id           INTEGER PRIMARY KEY,
  date         TEXT NOT NULL,
  title        TEXT NOT NULL,
  notes        TEXT NOT NULL DEFAULT '',
  person_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','done')),
  item_id      INTEGER REFERENCES items(id) ON DELETE SET NULL,  -- item criado/reforçado ao confirmar
  units_added  INTEGER NOT NULL DEFAULT 0,                       -- doses somadas ao item (para desfazer)
  created_by   INTEGER REFERENCES users(id),
  updated_by   INTEGER REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_prep_date ON preparations(date);

CREATE TABLE ideas (
  id          INTEGER PRIMARY KEY,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  created_by  INTEGER REFERENCES users(id),
  updated_by  INTEGER REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
