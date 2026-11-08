-- Fonte dos dados iniciais: BOLAO em index.html na ramificação cloudflare-acesso-privado.
-- A data da confirmação original não consta no site e permanece desconhecida.
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO settings (key, value) VALUES ('share_price_cents', '5000');

CREATE TABLE participants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  shares INTEGER NOT NULL CHECK (shares BETWEEN 1 AND 1000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  participant_id INTEGER NOT NULL REFERENCES participants(id) ON DELETE RESTRICT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  confirmed_on TEXT,
  status TEXT NOT NULL CHECK (status IN ('confirmed', 'voided')),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  voided_at TEXT
);
CREATE UNIQUE INDEX one_confirmed_payment_per_participant
  ON payments(participant_id) WHERE status = 'confirmed';

CREATE TABLE expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 200),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  incurred_on TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE bets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  numbers_json TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  placed_on TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Links são metadados. Arquivos não são enviados ao Git nem ao Worker.
CREATE TABLE receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  kind TEXT NOT NULL CHECK (kind IN ('bet', 'expense', 'other')),
  document_url TEXT NOT NULL DEFAULT '',
  document_date TEXT NOT NULL,
  reviewed INTEGER NOT NULL DEFAULT 0 CHECK (reviewed IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO participants (name, shares) VALUES ('Ibsen P.', 1);
INSERT INTO payments (participant_id, amount_cents, confirmed_on, status, note)
VALUES (1, 5000, NULL, 'confirmed', 'Registro existente no site; data não informada');
