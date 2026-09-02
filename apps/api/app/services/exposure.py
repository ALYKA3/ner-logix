from __future__ import annotations

from math import asin, cos, radians, sin, sqrt


EARLY_WARNING_KM = 5.0
EMERGENCY_HOLD_KM = 1.5


def haversine_km(left: tuple[float, float] | list[float], right: tuple[float, float] | list[float]) -> float:
    lat1, lng1 = radians(left[0]), radians(left[1])
    lat2, lng2 = radians(right[0]), radians(right[1])
    dlat, dlng = lat2 - lat1, lng2 - lng1
    value = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlng / 2) ** 2
    return 6371.0088 * 2 * asin(sqrt(value))


def _nearest_index(route: list[list[float]], point: tuple[float, float] | list[float]) -> int:
    return min(range(len(route)), key=lambda index: haversine_km(route[index], point))


def _cumulative_distances(route: list[list[float]]) -> list[float]:
    distances = [0.0]
    for left, right in zip(route, route[1:]):
        distances.append(distances[-1] + haversine_km(left, right))
    return distances


def assess_route_exposure(
    vehicle: dict,
    route: list[list[float]],
    route_road_ids: list[str],
    roads: list[dict],
) -> dict | None:
    """Return the nearest critical road ahead, measured along the remaining route."""
    if len(route) < 2 or not route_road_ids:
        return None
    current_index = _nearest_index(route, [vehicle["lat"], vehicle["lng"]])
    cumulative = _cumulative_distances(route)
    candidates: list[dict] = []
    for road in roads:
        if road["id"] not in route_road_ids:
            continue
        is_critical = road["status"] == "BLOCKED" or road["risk_score"] >= 75
        if not is_critical or not road.get("coordinates"):
            continue
        route_indices = sorted({_nearest_index(route, point) for point in road["coordinates"]})
        road_start, road_end = route_indices[0], route_indices[-1]
        if current_index > road_end:
            continue
        if current_index < road_start:
            # A closed/high-risk edge is inaccessible from its first point.
            hazard_index = road_start
        else:
            # If the vehicle is already on the affected edge, use the verified
            # incident position ahead. Without one, stop immediately rather than
            # incorrectly allowing travel to the far end of a blocked road.
            incident_indices = sorted({
                _nearest_index(route, [item["lat"], item["lng"]])
                for item in road.get("hazard_locations", [])
                if item.get("lat") is not None and item.get("lng") is not None
            })
            ahead_incidents = [index for index in incident_indices if current_index <= index <= road_end]
            hazard_index = min(ahead_incidents) if ahead_incidents else current_index
        distance_ahead = max(0.0, cumulative[hazard_index] - cumulative[current_index])
        candidates.append({"road": road, "route_index": hazard_index, "distance_ahead_km": distance_ahead})
    if not candidates:
        return None

    nearest = min(candidates, key=lambda item: item["distance_ahead_km"])
    road = nearest["road"]
    distance_ahead = nearest["distance_ahead_km"]
    if distance_ahead <= EMERGENCY_HOLD_KM:
        action = "HOLD_AND_REROUTE"
        urgency = "CRITICAL"
    elif distance_ahead <= EARLY_WARNING_KM:
        action = "WARN_AND_PREPARE_REROUTE"
        urgency = "WARNING"
    else:
        action = "MONITOR"
        urgency = "ADVISORY"
    speed = max(0.0, float(vehicle.get("speed_kmph") or 0))
    eta_seconds = round(distance_ahead / speed * 3600) if speed > 1 else None
    return {
        "vehicle_id": vehicle["vehicle_id"],
        "road_id": road["id"],
        "road_name": road["name"],
        "risk_score": road["risk_score"],
        "road_status": road["status"],
        "distance_ahead_km": round(distance_ahead, 2),
        "eta_to_hazard_seconds": eta_seconds,
        "action": action,
        "urgency": urgency,
        "reason": road["reason"],
        "thresholds": {"early_warning_km": EARLY_WARNING_KM, "emergency_hold_km": EMERGENCY_HOLD_KM},
    }
