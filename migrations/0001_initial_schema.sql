-- This schema resets everything and creates the tables needed for MapChan.
DROP TABLE IF EXISTS comments;
DROP TABLE IF EXISTS locations;

CREATE TABLE locations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  image_url TEXT,
  handle TEXT NOT NULL,
  report_count INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  location_id TEXT NOT NULL,
  handle TEXT NOT NULL,
  comment TEXT NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
);

CREATE INDEX idx_locations_created_at ON locations(created_at);
CREATE INDEX idx_comments_location_id ON comments(location_id);
