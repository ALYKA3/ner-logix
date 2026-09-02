import asyncio
from types import SimpleNamespace

from app.services import risk as risk_module


class UnavailableAdapter:
    async def corridor_snapshots(self, roads):
        return {
            road["id"]: {"data_status": "UNAVAILABLE", "source": "feed timeout"}
            for road in roads
        }


def incident(road_id: str) -> dict:
    return {
        "id": 1,
        "road_id": road_id,
        "status": "ACTIVE",
        "verified": True,
        "source": "control_room",
        "severity": "CRITICAL",
        "lat": 26.1,
        "lng": 91.9,
    }


def test_stale_weather_cache_still_applies_current_incident_state(monkeypatch):
    async def snap(points):
        return SimpleNamespace(coordinates=points, source="TEST", distance_km=1.0)

    monkeypatch.setattr(risk_module.road_geometry, "snap", snap)
    engine = risk_module.LiveRiskEngine()
    prior_live = {
        "data_status": "LIVE",
        "source": "test feed",
        "precipitation_mm": 0,
        "precipitation_6h_mm": 0,
        "soil_moisture_root": 0.2,
        "wind_gust_kmph": 5,
        "river_pressure_ratio": 0.2,
    }
    # Simulate an older cached closure on R-07.
    engine._roads = [
        risk_module.calculate_road_risk(road, prior_live, [incident("R-07")])
        for road in risk_module.BASE_ROADS
    ]

    # Live feeds now fail, R-07 has been reopened, and R-02 is newly blocked.
    roads = asyncio.run(engine.refresh([incident("R-02")], UnavailableAdapter()))
    by_id = {road["id"]: road for road in roads}

    assert by_id["R-02"]["status"] == "BLOCKED"
    assert by_id["R-07"]["status"] == "OPEN"
    assert all(road["data_status"] == "STALE" for road in roads)

