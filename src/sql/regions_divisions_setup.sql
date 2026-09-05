-- Regions & Divisions Setup
-- Run this in PocketBase SQL console or via migration

-- Regions table
CREATE TABLE IF NOT EXISTS regions (
  id TEXT PRIMARY KEY,
  region_code TEXT NOT NULL UNIQUE,
  region_name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  status TEXT DEFAULT 'Active',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Divisions table
CREATE TABLE IF NOT EXISTS divisions (
  id TEXT PRIMARY KEY,
  division_code TEXT NOT NULL UNIQUE,
  division_name TEXT NOT NULL,
  region_id TEXT REFERENCES regions(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'Active',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_regions_region_code ON regions (region_code);
CREATE INDEX IF NOT EXISTS idx_regions_status ON regions (status);
CREATE INDEX IF NOT EXISTS idx_divisions_division_code ON divisions (division_code);
CREATE INDEX IF NOT EXISTS idx_divisions_region_id ON divisions (region_id);
CREATE INDEX IF NOT EXISTS idx_divisions_status ON divisions (status);