import asyncio
from datetime import datetime, timezone

from .routing import NODES, safest_route


VEHICLE_PATH = [
    (26.1445, 91.7362), (26.1390, 91.7630), (26.1335, 91.7900),
    (26.1280, 91.8170), (26.1225, 91.8440), (26.1164, 91.8721),
    (26.1280, 91.8960), (26.1430, 91.9250), (26.1600, 91.9550),
    (26.1804, 91.9953), (26.1580, 92.0300), (26.1360, 92.0700),
    (26.1021, 92.1124), (26.1300, 92.1240), (26.1580, 92.1360),
    (26.1810, 92.1452),
]


class FleetState:
    def __init__(self) -> None:
        self.path_index = 0
        self.current_position = VEHICLE_PATH[0]
        self.reroute_status = "MONITORING"
        self.last_instruction = "Proceed on assigned route"
        self.speed_kmph = 0.0
        self.telemetry_source = "WAITING_FOR_DEVICE_GPS"
        self.accuracy_m: float | None = None
        self.status_override: str | None = None
        self.updated_at = datetime.now(timezone.utc).isoformat()

    def vehicle(self) -> dict:
        lat, lng = self.current_position
        return {
            "vehicle_id": "MED-001",
            "vehicle_type": "Medicine",
            "cargo": "Emergency antibiotics and insulin",
            "priority": "CRITICAL",
            "lat": lat,
            "lng": lng,
            "speed_kmph": self.speed_kmph,
            "status": self.status_override or ("IN_TRANSIT" if self.telemetry_source != "WAITING_FOR_DEVICE_GPS" else "AWAITING_GPS"),
            "destination": "District Relief Hub",
            "eta_minutes": max(0, (len(VEHICLE_PATH) - self.path_index - 1) * 3),
            "reroute_status": self.reroute_status,
            "last_instruction": self.last_instruction,
            "updated_at": self.updated_at,
            "telemetry_source": self.telemetry_source,
            "accuracy_m": self.accuracy_m,
        }

    def advance(self) -> dict:
        self.path_index = (self.path_index + 1) % len(VEHICLE_PATH)
        self.current_position = VEHICLE_PATH[self.path_index]
        self.speed_kmph = 38 if self.path_index < len(VEHICLE_PATH) - 1 else 0
        self.telemetry_source = "GPS_SIMULATOR"
        self.updated_at = datetime.now(timezone.utc).isoformat()
        return self.vehicle()

    def ingest(self, lat: float, lng: float, speed_kmph: float, accuracy_m: float | None, captured_at: str | None) -> dict:
        self.current_position = (lat, lng)
        self.speed_kmph = speed_kmph
        self.accuracy_m = accuracy_m
        self.telemetry_source = "DEVICE_GPS"
        self.updated_at = captured_at or datetime.now(timezone.utc).isoformat()
        return self.vehicle()

    def hold(self, instruction: str) -> dict:
        self.status_override = "HOLD_POSITION"
        self.speed_kmph = 0
        self.reroute_status = "NO_SAFE_ROUTE"
        self.last_instruction = instruction
        self.updated_at = datetime.now(timezone.utc).isoformat()
        return self.vehicle()

    def release_hold(self) -> dict:
        self.status_override = None
        self.reroute_status = "MONITORING"
        self.last_instruction = "Hold released by control room; await route instruction"
        self.updated_at = datetime.now(timezone.utc).isoformat()
        return self.vehicle()


fleet_state = FleetState()


VEHICLE_TEMPLATES = [
    ("MED-001", "Medicine", "Emergency antibiotics and insulin", "CRITICAL"),
    ("FOOD-002", "Food", "Emergency food packets", "ESSENTIAL"),
    ("RELIEF-003", "Relief", "Shelter and rescue supplies", "CRITICAL"),
    ("WATER-004", "Water", "Potable water and purification kits", "ESSENTIAL"),
    ("MED-005", "Medicine", "Vaccines and first-aid kits", "CRITICAL"),
    ("FUEL-006", "Fuel", "Emergency generator fuel", "ESSENTIAL"),
    ("RESCUE-007", "Rescue", "NDRF response equipment", "CRITICAL"),
    ("POWER-008", "Power", "Mobile power restoration equipment", "ESSENTIAL"),
]


def _smooth_path(points: list[list[float]], steps: int = 9) -> list[tuple[float, float]]:
    if len(points) > 80:
        # OSRM already supplies dense, road-following points. Bound the replay length
        # so vehicles visibly advance during a short judging demonstration.
        stride = max(1, len(points) // 180)
        sampled = points[::stride]
        if sampled[-1] != points[-1]:
            sampled.append(points[-1])
        return [(point[0], point[1]) for point in sampled]
    path: list[tuple[float, float]] = []
    for left, right in zip(points, points[1:]):
        for index in range(steps):
            ratio = index / steps
            path.append((left[0] + (right[0] - left[0]) * ratio, left[1] + (right[1] - left[1]) * ratio))
    path.append((points[-1][0], points[-1][1]))
    return path


class DemoFleetReplay:
    def __init__(self) -> None:
        self.running = False
        self.vehicle_count = 0
        self.source_node = "A"
        self.destination_node = "F"
        self.interval_seconds = 2.0
        self.path: list[tuple[float, float]] = []
        self.route_coordinates: list[list[float]] = []
        self.route_distance_km = 0.0
        self.indices: list[int] = []
        self.updated_at: str | None = None

    def configure(
        self,
        vehicle_count: int,
        source_node: str,
        destination_node: str,
        interval_seconds: float,
        route_coordinates: list[list[float]] | None = None,
        route_distance_km: float | None = None,
    ) -> dict:
        if source_node == destination_node:
            raise ValueError("Source and destination must be different")
        route = safest_route(source_node, destination_node, [])
        self.route_coordinates = route_coordinates or route["coordinates"]
        self.route_distance_km = route_distance_km or route["distance_km"]
        self.path = _smooth_path(self.route_coordinates)
        self.vehicle_count = vehicle_count
        self.source_node = source_node
        self.destination_node = destination_node
        self.interval_seconds = interval_seconds
        spacing = max(1, len(self.path) // max(vehicle_count, 1))
        self.indices = [(index * spacing) % len(self.path) for index in range(vehicle_count)]
        self.running = True
        self.updated_at = datetime.now(timezone.utc).isoformat()
        return self.snapshot()

    def stop(self) -> dict:
        self.running = False
        self.updated_at = datetime.now(timezone.utc).isoformat()
        return self.status()

    def tick(self) -> dict:
        if self.running and self.path:
            self.indices = [(index + 1) % len(self.path) for index in self.indices]
            self.updated_at = datetime.now(timezone.utc).isoformat()
        return self.snapshot()

    def vehicles(self) -> list[dict]:
        if not self.running or not self.path:
            return []
        destination_name = NODES[self.destination_node][2]
        vehicles = []
        for position, path_index in enumerate(self.indices):
            vehicle_id, vehicle_type, cargo, priority = VEHICLE_TEMPLATES[position]
            lat, lng = self.path[path_index]
            progress = path_index / max(1, len(self.path) - 1)
            remaining_km = max(0.0, self.route_distance_km * (1 - progress))
            vehicles.append({
                "vehicle_id": vehicle_id,
                "vehicle_type": vehicle_type,
                "cargo": cargo,
                "priority": priority,
                "lat": lat,
                "lng": lng,
                "speed_kmph": 38 + (position % 3) * 4,
                "status": "DEMO_REPLAY",
                "destination": destination_name,
                "eta_minutes": max(1, round(remaining_km / (38 + (position % 3) * 4) * 60)),
                "reroute_status": "MONITORING",
                "last_instruction": f"Demo replay: {NODES[self.source_node][2]} to {destination_name}",
                "updated_at": self.updated_at,
                "telemetry_source": "DEMO_GPS_REPLAY",
                "accuracy_m": None,
            })
        return vehicles

    def status(self) -> dict:
        return {
            "running": self.running,
            "vehicle_count": self.vehicle_count,
            "source_node": self.source_node,
            "source_name": NODES[self.source_node][2],
            "destination_node": self.destination_node,
            "destination_name": NODES[self.destination_node][2],
            "interval_seconds": self.interval_seconds,
            "updated_at": self.updated_at,
            "label": "DEMO GPS REPLAY",
        }

    def snapshot(self) -> dict:
        return {"vehicles": self.vehicles(), "simulation": self.status(), "current_route": self.route_coordinates}


demo_fleet = DemoFleetReplay()


async def run_simulation(broadcast, interval: float) -> None:
    while True:
        await asyncio.sleep(interval)
        await broadcast({"type": "vehicle.location", "data": fleet_state.advance()})


async def run_demo_replay(broadcast) -> None:
    while True:
        await asyncio.sleep(demo_fleet.interval_seconds if demo_fleet.running else 0.5)
        if demo_fleet.running:
            await broadcast({"type": "fleet.snapshot", "data": demo_fleet.tick()})
