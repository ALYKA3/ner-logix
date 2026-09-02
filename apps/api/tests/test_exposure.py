from app.services.exposure import assess_route_exposure


def vehicle_at(lat: float, lng: float, speed: float = 36) -> dict:
    return {"vehicle_id": "MED-001", "lat": lat, "lng": lng, "speed_kmph": speed}


def road(status: str = "BLOCKED", risk: int = 92, hazards: list[dict] | None = None) -> dict:
    return {
        "id": "R-01", "name": "Test corridor", "status": status,
        "risk_score": risk, "reason": "verified flood",
        "coordinates": [[0.0, 0.0], [0.0, 0.10]],
        "hazard_locations": hazards or [],
    }


def test_blocked_edge_ahead_is_measured_from_road_entry():
    route = [[0.0, value / 100] for value in range(-1, 21)]
    exposure = assess_route_exposure(vehicle_at(0.0, -0.01), route, ["R-01"], [road()])
    assert exposure is not None
    assert 1.0 < exposure["distance_ahead_km"] < 1.2
    assert exposure["action"] == "HOLD_AND_REROUTE"


def test_verified_hazard_ahead_is_used_when_vehicle_is_already_on_edge():
    route = [[0.0, value / 1000] for value in range(101)]
    exposure = assess_route_exposure(
        vehicle_at(0.0, 0.04), route, ["R-01"],
        [road(hazards=[{"lat": 0.0, "lng": 0.05}])],
    )
    assert exposure is not None
    assert 1.0 < exposure["distance_ahead_km"] < 1.2
    assert exposure["action"] == "HOLD_AND_REROUTE"


def test_hazard_behind_vehicle_is_not_an_exposure():
    route = [[0.0, value / 1000] for value in range(201)]
    exposure = assess_route_exposure(vehicle_at(0.0, 0.15), route, ["R-01"], [road()])
    assert exposure is None
