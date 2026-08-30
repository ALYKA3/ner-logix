import os
import tempfile
from pathlib import Path

test_root = Path(tempfile.mkdtemp(prefix="ner-logix-tests-"))
os.environ["DATABASE_URL"] = f"sqlite:///{test_root / 'test.db'}"
os.environ["UPLOAD_DIR"] = str(test_root / "uploads")
os.environ["SIMULATION_INTERVAL_SECONDS"] = "60"
os.environ["GPS_SIMULATION_ENABLED"] = "false"
os.environ["LIVE_DATA_ENABLED"] = "false"

from fastapi.testclient import TestClient

from app.main import app


def test_vertical_slice():
    with TestClient(app) as client:
        assert client.get("/health").status_code == 200

        def auth(username: str, password: str) -> dict[str, str]:
            response = client.post("/api/v1/auth/login", json={"username": username, "password": password})
            assert response.status_code == 200
            return {"Authorization": f"Bearer {response.json()['access_token']}"}

        admin_headers = auth("admin", "admin123")
        driver_headers = auth("driver", "driver123")
        field_headers = auth("field", "field123")

        database_overview = client.get("/api/v1/admin/database/overview", headers=admin_headers)
        assert database_overview.status_code == 200
        assert database_overview.json()["active_engine"] == "SQLite"
        assert {table["name"] for table in database_overview.json()["tables"]} == {
            "incidents", "reroutes", "driver_events", "risk_snapshots",
        }

        route_monitor = client.get("/api/v1/routes/monitor", headers=admin_headers)
        assert route_monitor.status_code == 200
        assert len(route_monitor.json()["routes"]) == 4
        assert route_monitor.json()["refresh_seconds"] == 10
        assert route_monitor.json()["routes"][0]["route_id"] == "Route 1"

        photo = client.post(
            "/api/v1/uploads/incident-photo", headers=field_headers,
            files={"photo": ("evidence.png", b"\x89PNG\r\n\x1a\nprototype", "image/png")},
        )
        assert photo.status_code == 201
        assert photo.json()["photo_url"].startswith("/uploads/")

        risk = client.post("/api/v1/risk/pre-trip", headers=driver_headers, json={"vehicle_id": "MED-001", "cargo_priority": "CRITICAL"})
        assert risk.status_code == 200
        assert risk.json()["model"] == "explainable-live-risk-v2"
        assert risk.json()["risk_level"] in {"LOW", "MEDIUM", "HIGH", "CRITICAL"}

        telemetry = client.post("/api/v1/telemetry/vehicles/MED-001/location", headers=driver_headers, json={
            "lat": 26.1446, "lng": 91.7363, "speed_kmph": 36, "accuracy_m": 8,
        })
        assert telemetry.status_code == 200
        assert telemetry.json()["telemetry_source"] == "DEVICE_GPS"

        incident = client.post("/api/v1/incidents", headers=admin_headers, json={
            "road_id": "R-02", "incident_type": "FLOOD", "severity": "HIGH",
            "description": "Flooded carriageway", "lat": 26.1127, "lng": 91.9898,
        })
        assert incident.status_code == 201
        assert incident.json()["verified"] is True
        assert incident.json()["source"] == "control_room"
        history = client.get("/api/v1/incidents", headers=field_headers)
        assert history.status_code == 200
        assert any(item["id"] == incident.json()["id"] for item in history.json())

        route = client.post("/api/v1/routes/alternate", headers=admin_headers, json={
            "vehicle_id": "MED-001", "start_node": "A", "destination_node": "F",
            "avoid_road_ids": ["R-02"],
        })
        assert route.status_code == 201
        assert "R-02" not in route.json()["road_ids"]

        reroute_id = route.json()["id"]
        approved = client.post(f"/api/v1/reroutes/{reroute_id}/approve", headers=admin_headers, json={"approved_by": "Test Control Room"})
        assert approved.json()["status"] == "APPROVED"

        accepted = client.post(f"/api/v1/driver/MED-001/routes/{reroute_id}/accept", headers=driver_headers)
        assert accepted.json()["status"] == "DRIVER_ACCEPTED"

        replay = client.post("/api/v1/simulation/start", headers=admin_headers, json={
            "vehicle_count": 3, "source_node": "A", "destination_node": "F", "interval_seconds": 1,
        })
        assert replay.status_code == 200
        assert replay.json()["simulation"]["running"] is True
        assert len(replay.json()["vehicles"]) == 3
        assert all(item["telemetry_source"] == "DEMO_GPS_REPLAY" for item in replay.json()["vehicles"])
        assert len(replay.json()["current_route"]) > 20
        assert abs(replay.json()["current_route"][0][0] - 26.1445) < 0.001
        assert abs(replay.json()["current_route"][0][1] - 91.7362) < 0.001
        assert all(item["eta_minutes"] >= 1 for item in replay.json()["vehicles"])

        stopped = client.post("/api/v1/simulation/stop", headers=admin_headers)
        assert stopped.status_code == 200
        assert stopped.json()["simulation"]["running"] is False

        bootstrap = client.get("/api/v1/bootstrap", headers=admin_headers).json()
        assert bootstrap["vehicle"]["vehicle_id"] == "MED-001"
        assert any(road["status"] == "BLOCKED" for road in bootstrap["roads"])

        verification = client.post("/api/v1/field/verify", headers=field_headers, json={
            "incident_type": "FLOOD", "road_status": "BLOCKED", "severity": "HIGH",
            "description": "Verified flood", "affected_direction": "BOTH",
            "vehicle_access": "NONE", "clearance_estimate": "Unknown",
            "lat": 26.1127, "lng": 91.9898, "photo_url": photo.json()["photo_url"],
        })
        assert verification.status_code == 201
        assert verification.json()["sync_status"] == "SYNCED"
        assert verification.json()["verified"] is False
        assert verification.json()["road_status"] == "BLOCKED"
        assert verification.json()["photo_url"] == photo.json()["photo_url"]

        custom_verification = client.post("/api/v1/field/verify", headers=field_headers, json={
            "road_id": "UNMAPPED", "landmark": "Near Sonapur market",
            "incident_type": "OTHER", "incident_type_other": "CULVERT_COLLAPSE",
            "road_status": "RESTRICTED", "severity": "HIGH",
            "description": "One lane is inaccessible", "affected_direction": "BOTH",
            "vehicle_access": "LIGHT_ONLY", "clearance_estimate": "Unknown",
        })
        assert custom_verification.status_code == 201
        assert custom_verification.json()["road_id"] == "UNMAPPED"
        assert custom_verification.json()["incident_type"] == "CULVERT_COLLAPSE"
        assert custom_verification.json()["landmark"] == "Near Sonapur market"

        field_resolve = client.post(
            f"/api/v1/incidents/{verification.json()['id']}/resolve", headers=field_headers,
        )
        assert field_resolve.status_code == 403
        resolved = client.post(
            f"/api/v1/incidents/{verification.json()['id']}/resolve", headers=admin_headers,
        )
        assert resolved.status_code == 200
        assert resolved.json()["status"] == "RESOLVED"

        reopened = client.post("/api/v1/roads/R-02/reopen", headers=admin_headers)
        assert reopened.status_code == 200
        assert reopened.json()["status"] == "REOPENED"
        assert reopened.json()["road"]["status"] == "OPEN"

        forbidden = client.post("/api/v1/routes/alternate", headers=driver_headers, json={
            "vehicle_id": "MED-001", "start_node": "A", "destination_node": "F",
            "avoid_road_ids": ["R-02"],
        })
        assert forbidden.status_code == 403

        held = client.post("/api/v1/vehicles/MED-001/hold", headers=admin_headers)
        assert held.status_code == 200
        assert held.json()["status"] == "HOLD_POSITION"
        assert held.json()["reroute_status"] == "NO_SAFE_ROUTE"

        release = client.post("/api/v1/vehicles/MED-001/release-hold", headers=admin_headers)
        assert release.status_code == 200
        assert release.json()["status"] != "HOLD_POSITION"
