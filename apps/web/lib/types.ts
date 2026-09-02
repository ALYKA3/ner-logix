export type Role = "ADMIN" | "DRIVER" | "FIELD_OFFICER";

export type Vehicle = {
  vehicle_id: string;
  vehicle_type: string;
  cargo: string;
  priority: string;
  lat: number;
  lng: number;
  speed_kmph: number;
  status: string;
  destination: string;
  eta_minutes: number;
  reroute_status: string;
  last_instruction: string;
  updated_at: string;
  telemetry_source?: string;
  accuracy_m?: number;
};

export type RiskFactor = {
  name: string;
  value: number | null;
  unit: string;
  contribution: number;
};

export type Road = {
  id: string;
  name: string;
  risk_score: number;
  risk_level: string;
  status: string;
  confidence: number;
  reason: string;
  coordinates: number[][];
  last_evaluated: string;
  data_status: "LIVE" | "STALE" | "UNAVAILABLE" | "INITIALIZING" | "DISABLED";
  data_source: string;
  source_observed_at?: string;
  geometry_source?: string;
  road_distance_km?: number;
  factors: RiskFactor[];
};

export type Incident = {
  id: number;
  road_id: string;
  incident_type: string;
  severity: string;
  description: string;
  lat: number;
  lng: number;
  source: string;
  verified: boolean;
  status: string;
  created_at: string;
  road_status?: string | null;
  affected_direction?: string | null;
  vehicle_access?: string | null;
  clearance_estimate?: string | null;
  landmark?: string | null;
  photo_url?: string | null;
};

export type Reroute = {
  id: number;
  vehicle_id: string;
  status: string;
  route_name: string;
  reason: string;
  distance_km: number;
  eta_minutes: number;
  risk_score: number;
  coordinates: number[][];
  road_ids?: string[];
  approved_by?: string;
  approved_at?: string;
  accepted_at?: string;
  geometry_source?: string;
};

export type Bootstrap = {
  region: { name: string; center: number[]; zoom: number };
  vehicle: Vehicle;
  vehicles?: Vehicle[];
  simulation?: SimulationStatus;
  network_nodes?: NetworkNode[];
  roads: Road[];
  incidents: Incident[];
  reroute: Reroute | null;
  current_route: number[][];
  current_route_source?: string;
  route_exposure?: RouteExposure | null;
  network_summary: Record<string, number>;
  mission_priority: number;
};

export type RouteExposure = {
  vehicle_id: string;
  road_id: string;
  road_name: string;
  risk_score: number;
  road_status: string;
  distance_ahead_km: number;
  eta_to_hazard_seconds?: number | null;
  action: "MONITOR" | "WARN_AND_PREPARE_REROUTE" | "HOLD_AND_REROUTE";
  urgency: "ADVISORY" | "WARNING" | "CRITICAL";
  reason: string;
  reroute?: Reroute | null;
  route_error?: string | null;
};

export type NetworkNode = { id: string; name: string; lat: number; lng: number };

export type SimulationStatus = {
  running: boolean;
  paused?: boolean;
  vehicle_count: number;
  source_node: string;
  source_name: string;
  destination_node: string;
  destination_name: string;
  interval_seconds: number;
  route_road_ids?: string[];
  updated_at?: string;
  label: "DEMO GPS REPLAY";
};
