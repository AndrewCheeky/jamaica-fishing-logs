CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL UNIQUE,
  browser_hash TEXT NOT NULL,
  trip_fingerprint TEXT NOT NULL,
  angler_name TEXT NOT NULL DEFAULT 'Anonymous',
  fishing_date TEXT NOT NULL,
  bank TEXT NOT NULL,
  method TEXT NOT NULL,
  mixed_methods TEXT NOT NULL DEFAULT '[]',
  target_species TEXT NOT NULL,
  hours_fished REAL NOT NULL,
  anglers_count INTEGER NOT NULL,
  caught_any INTEGER NOT NULL CHECK (caught_any IN (0,1)),
  notes TEXT NOT NULL DEFAULT '',
  edit_token_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trips_browser_date ON trips(browser_hash, fishing_date);
CREATE INDEX IF NOT EXISTS idx_trips_fingerprint_time ON trips(trip_fingerprint, created_at);
CREATE INDEX IF NOT EXISTS idx_trips_bank_date ON trips(bank, fishing_date);
CREATE TABLE IF NOT EXISTS catches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  species TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity > 0)
);
CREATE INDEX IF NOT EXISTS idx_catches_trip ON catches(trip_id);
CREATE TABLE IF NOT EXISTS trip_edits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id TEXT NOT NULL REFERENCES trips(id),
  edited_at TEXT NOT NULL,
  previous_json TEXT NOT NULL
);
