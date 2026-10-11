CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name  TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  id          TEXT PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL
);

CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE items (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  category     TEXT NOT NULL DEFAULT 'outro',
  location     TEXT NOT NULL DEFAULT 'congelador',
  quantity     INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 0),
  stored_on    TEXT,
  best_before  TEXT,
  notes        TEXT NOT NULL DEFAULT '',
  archived     INTEGER NOT NULL DEFAULT 0,
  created_by   INTEGER REFERENCES users(id),
  updated_by   INTEGER REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE plan_entries (
  id          INTEGER PRIMARY KEY,
  date        TEXT NOT NULL,
  slot        TEXT NOT NULL CHECK (slot IN ('almoco','jantar')),
  position    INTEGER NOT NULL DEFAULT 0,
  item_id     INTEGER REFERENCES items(id) ON DELETE SET NULL,
  title       TEXT,
  units       INTEGER NOT NULL DEFAULT 1 CHECK (units >= 1),
  status      TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','eaten','skipped')),
  notes       TEXT NOT NULL DEFAULT '',
  created_by  INTEGER REFERENCES users(id),
  updated_by  INTEGER REFERENCES users(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (item_id IS NOT NULL OR title IS NOT NULL)
);

CREATE INDEX idx_plan_date ON plan_entries(date);
CREATE INDEX idx_plan_item_status ON plan_entries(item_id, status);

CREATE VIEW item_stock AS
SELECT i.*,
       COALESCE(SUM(CASE WHEN p.status = 'planned' THEN p.units END), 0) AS planned,
       i.quantity - COALESCE(SUM(CASE WHEN p.status = 'planned' THEN p.units END), 0) AS free
FROM items i
LEFT JOIN plan_entries p ON p.item_id = i.id
GROUP BY i.id;
