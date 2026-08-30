from app.services.risk import BASE_ROADS, calculate_road_risk
from app.database import normalize_database_url


def snapshot(precipitation: float, six_hour: float, soil: float, gust: float, river: float) -> dict:
    return {
        "precipitation_mm": precipitation,
        "precipitation_6h_mm": six_hour,
        "soil_moisture_root": soil,
        "wind_gust_kmph": gust,
        "river_pressure_ratio": river,
        "data_status": "LIVE",
        "source": "test live fixture",
        "weather_observed_at": "2026-08-28T10:00",
    }


def test_risk_is_deterministic_and_responds_to_live_inputs():
    road = BASE_ROADS[0]
    dry = snapshot(0, 0, 0.20, 10, 0.40)
    wet = snapshot(2.2, 24, 0.48, 55, 1.45)
    first = calculate_road_risk(road, dry, [])
    second = calculate_road_risk(road, dry, [])
    hazardous = calculate_road_risk(road, wet, [])
    assert first["risk_score"] == second["risk_score"]
    assert hazardous["risk_score"] > first["risk_score"]
    assert hazardous["data_status"] == "LIVE"
    assert all(factor["value"] is not None for factor in hazardous["factors"][:-1])


def test_trusted_severe_incident_is_a_safety_override():
    incident = {"id": 10, "road_id": "R-01", "status": "ACTIVE", "severity": "CRITICAL", "verified": True, "source": "field-10"}
    result = calculate_road_risk(BASE_ROADS[0], snapshot(0, 0, 0.20, 10, 0.40), [incident])
    assert result["status"] == "BLOCKED"
    assert result["risk_score"] >= 92
    assert result["provenance"]["incidents"][0]["verified"] is True


def test_render_postgres_url_uses_installed_psycopg_driver():
    assert normalize_database_url("postgresql://user:pass@db/name") == "postgresql+psycopg://user:pass@db/name"
