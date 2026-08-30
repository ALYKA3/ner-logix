CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS road_segments (
  id text PRIMARY KEY,
  name text NOT NULL,
  district text,
  geometry geometry(LineString, 4326) NOT NULL,
  bridge_id text,
  base_risk numeric(5,2) DEFAULT 0,
  accessibility_status text DEFAULT 'UNKNOWN',
  last_verified_at timestamptz
);

CREATE INDEX IF NOT EXISTS road_segments_geometry_gix
  ON road_segments USING GIST (geometry);

CREATE TABLE IF NOT EXISTS vehicle_positions (
  id bigserial PRIMARY KEY,
  vehicle_id text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  position geometry(Point, 4326) NOT NULL,
  speed_kmph numeric(6,2),
  heading numeric(6,2),
  payload jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS vehicle_positions_position_gix
  ON vehicle_positions USING GIST (position);
CREATE INDEX IF NOT EXISTS vehicle_positions_vehicle_time_idx
  ON vehicle_positions (vehicle_id, recorded_at DESC);
