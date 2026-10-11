-- Notificações push: subscrições por dispositivo, preferências por pessoa e registo de envios.

CREATE TABLE push_subscriptions (
  id               INTEGER PRIMARY KEY,
  user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint         TEXT NOT NULL UNIQUE,
  p256dh           TEXT NOT NULL,
  auth             TEXT NOT NULL,
  user_agent       TEXT NOT NULL DEFAULT '',
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  last_success_at  TEXT
);

CREATE INDEX idx_push_user ON push_subscriptions(user_id);

CREATE TABLE notification_prefs (
  user_id       INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  thaw          INTEGER NOT NULL DEFAULT 1,
  thaw_time     TEXT NOT NULL DEFAULT '21:00',
  preps         INTEGER NOT NULL DEFAULT 1,
  preps_time    TEXT NOT NULL DEFAULT '21:00',
  pending       INTEGER NOT NULL DEFAULT 1,
  pending_time  TEXT NOT NULL DEFAULT '22:30',
  expiry        INTEGER NOT NULL DEFAULT 1,
  expiry_time   TEXT NOT NULL DEFAULT '10:00'
);

-- Uma linha por pessoa, tipo e dia: evita enviar a mesma notificação duas vezes.
CREATE TABLE notification_log (
  user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind     TEXT NOT NULL,
  date     TEXT NOT NULL,
  PRIMARY KEY (user_id, kind, date)
);
