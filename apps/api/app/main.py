import asyncio
import base64
import binascii
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import Depends, FastAPI, File, HTTPException, Response, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import delete, func, inspect, select, text
from sqlalchemy.orm import Session

from .config import get_settings
from .auth import authenticate, create_access_token, current_user, decode_token, require_roles
from .adapters.live_weather import OpenMeteoAdapter
from .database import Base, SessionLocal, engine, get_db
from .models import DriverEvent, Incident, IncidentPhoto, Reroute, RiskSnapshot
from .schemas import (
    AlternateRouteRequest,
    ApproveRerouteRequest,
    ConfirmFieldReportRequest,
    DriverReportRequest,
    FieldVerificationRequest,
    IncidentCreate,
    LoginRequest,
    RoadBlockRequest,
    RiskRequest,
    SimulationConfigRequest,
    VehicleTelemetryRequest,
)
from .services.risk import BASE_ROADS, mission_priority, risk_engine
from .services.exposure import assess_route_exposure
from .services.road_geometry import road_geometry
from .services.routing import EDGES, NODES, ranked_routes, safest_route
from .services.simulation import VEHICLE_PATH, demo_fleet, fleet_state, run_demo_replay, run_simulation
from .websocket import manager

settings = get_settings()
upload_path = Path(settings.upload_dir)
upload_path.mkdir(parents=True, exist_ok=True)
weather_adapter = OpenMeteoAdapter(settings.live_data_timeout_seconds) if settings.live_data_enabled else None
latest_route_exposure: dict | None = None
last_auto_reroute_signature: tuple | None = None
last_auto_reroute: dict | None = None


def active_incidents() -> list[Incident]:
    with SessionLocal() as db:
        return list(db.scalars(select(Incident).where(Incident.status == "ACTIVE")))


def persist_risk_snapshots(roads: list[dict]) -> None:
    with SessionLocal() as db:
        for road in roads:
            db.add(RiskSnapshot(
                road_id=road["id"], risk_score=road["risk_score"], risk_level=road["risk_level"],
                status=road["status"], confidence=road["confidence"], data_status=road["data_status"],
                data_source=road["data_source"], factors=road["factors"],
            ))
        cutoff = datetime.now(timezone.utc) - timedelta(hours=settings.risk_snapshot_retention_hours)
        db.execute(delete(RiskSnapshot).where(RiskSnapshot.observed_at < cutoff))
        db.commit()


async def refresh_live_risk(broadcast: bool = True, evaluate_exposure: bool = True) -> list[dict]:
    roads = await risk_engine.refresh(active_incidents(), weather_adapter)
    persist_risk_snapshots(roads)
    if broadcast:
        await manager.broadcast({"type": "roads.risk_updated", "data": roads})
    if evaluate_exposure:
        await handle_route_exposure(roads)
    return roads


async def run_continuous_risk() -> None:
    while True:
        try:
            await refresh_live_risk()
        except Exception as exc:  # external-feed failures must not stop the service
            risk_engine.last_error = f"{type(exc).__name__}: {exc}"
        await asyncio.sleep(settings.risk_refresh_seconds)


def serialize_incident(item: Incident) -> dict:
    return {
        "id": item.id, "road_id": item.road_id, "incident_type": item.incident_type,
        "severity": item.severity, "description": item.description, "lat": item.lat,
        "lng": item.lng, "source": item.source, "verified": item.verified,
        "status": item.status, "created_at": item.created_at.isoformat(),
        "road_status": item.reported_road_status,
        "affected_direction": item.affected_direction,
        "vehicle_access": item.vehicle_access,
        "clearance_estimate": item.clearance_estimate,
        "landmark": item.landmark,
        "photo_url": item.photo_url,
    }


def ensure_incident_columns() -> None:
    """Upgrade existing prototype databases without deleting judge/demo data."""
    existing = {column["name"] for column in inspect(engine).get_columns("incidents")}
    additions = {
        "reported_road_status": "VARCHAR(20)",
        "affected_direction": "VARCHAR(20)",
        "vehicle_access": "VARCHAR(30)",
        "clearance_estimate": "VARCHAR(80)",
        "landmark": "VARCHAR(160)",
        "photo_url": "VARCHAR(255)",
    }
    with engine.begin() as connection:
        for name, sql_type in additions.items():
            if name not in existing:
                connection.execute(text(f"ALTER TABLE incidents ADD COLUMN {name} {sql_type}"))


def image_suffix(content: bytes) -> str | None:
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if content.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if len(content) >= 12 and content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return ".webp"
    return None


def store_image(content: bytes, db: Session, requested_suffix: str | None = None) -> str:
    if not content or len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Photo must be between 1 byte and 5 MB")
    detected_suffix = image_suffix(content)
    if not detected_suffix:
        raise HTTPException(status_code=415, detail="File content is not a valid JPG, PNG or WebP image")
    allowed_suffixes = {detected_suffix}
    if detected_suffix == ".jpg":
        allowed_suffixes.add(".jpeg")
    if requested_suffix and requested_suffix.lower() not in allowed_suffixes:
        raise HTTPException(status_code=415, detail="Photo extension does not match its file content")
    filename = f"{uuid4().hex}{detected_suffix}"
    media_type = {".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp"}[detected_suffix]
    db.add(IncidentPhoto(filename=filename, media_type=media_type, content=content))
    db.commit()
    return f"/uploads/{filename}"


def serialize_reroute(item: Reroute) -> dict:
    return {
        "id": item.id, "vehicle_id": item.vehicle_id, "status": item.status,
        "route_name": item.route_name, "reason": item.reason,
        "distance_km": item.distance_km, "eta_minutes": item.eta_minutes,
        "risk_score": item.risk_score, "coordinates": item.coordinates,
        "road_ids": route_road_ids(item.route_name),
        "approved_by": item.approved_by,
        "approved_at": item.approved_at.isoformat() if item.approved_at else None,
        "accepted_at": item.accepted_at.isoformat() if item.accepted_at else None,
        "created_at": item.created_at.isoformat(),
    }


def archive_reroutes(db: Session, vehicle_id: str, include_accepted: bool = False) -> int:
    """Archive superseded route decisions so only the current mission state is shown."""
    statuses = ["PENDING_APPROVAL", "APPROVED"]
    if include_accepted:
        statuses.append("DRIVER_ACCEPTED")
    items = list(db.scalars(select(Reroute).where(
        Reroute.vehicle_id == vehicle_id,
        Reroute.status.in_(statuses),
    )))
    for item in items:
        item.status = "ARCHIVED"
    return len(items)


async def create_alternate_route(payload: AlternateRouteRequest, db: Session) -> dict:
    """Persist one road-snapped route after removing every avoided graph edge."""
    live_risks = {road["id"]: road["risk_score"] for road in risk_engine.roads()}
    route = safest_route(payload.start_node, payload.destination_node, payload.avoid_road_ids, live_risks)
    geometry = await road_geometry.snap_segments(route["coordinates"])
    route["coordinates"] = geometry.coordinates
    route["geometry_source"] = geometry.source
    if geometry.distance_km:
        route["distance_km"] = geometry.distance_km
    if geometry.eta_minutes:
        route["eta_minutes"] = geometry.eta_minutes
    archive_reroutes(db, payload.vehicle_id, include_accepted=True)
    reroute = Reroute(vehicle_id=payload.vehicle_id, status="PENDING_APPROVAL", **{
        key: route[key] for key in (
            "route_name", "reason", "distance_km", "eta_minutes", "risk_score", "coordinates"
        )
    })
    db.add(reroute)
    db.commit()
    db.refresh(reroute)
    fleet_state.reroute_status = "PENDING_APPROVAL"
    fleet_state.last_instruction = "Safer route proposed; awaiting authority approval"
    result = {
        **serialize_reroute(reroute),
        "algorithm": route["algorithm"],
        "road_ids": route["road_ids"],
        "geometry_source": route["geometry_source"],
    }
    await manager.broadcast({"type": "reroute.proposed", "data": result})
    return result


def current_route_exposure(roads: list[dict]) -> dict | None:
    if demo_fleet.running and demo_fleet.path and demo_fleet.route_road_ids:
        vehicles = demo_fleet.vehicles()
        if not vehicles:
            return None
        selected = next((vehicle for vehicle in vehicles if vehicle["vehicle_id"] == "MED-001"), vehicles[0])
        dense_route = [[lat, lng] for lat, lng in demo_fleet.path]
        return assess_route_exposure(selected, dense_route, demo_fleet.route_road_ids, roads)
    return assess_route_exposure(
        fleet_state.vehicle(),
        fleet_state.assigned_route_coordinates,
        fleet_state.assigned_route_road_ids,
        roads,
    )


async def handle_route_exposure(roads: list[dict]) -> dict | None:
    """Warn early, prepare a detour, and hold before a critical hazard is reached."""
    global latest_route_exposure, last_auto_reroute_signature, last_auto_reroute
    exposure = current_route_exposure(roads)
    latest_route_exposure = exposure
    if not exposure:
        last_auto_reroute_signature = None
        last_auto_reroute = None
        return None
    if exposure["action"] not in {"WARN_AND_PREPARE_REROUTE", "HOLD_AND_REROUTE"}:
        return exposure

    avoid_road_ids = sorted({
        road["id"] for road in roads if road["status"] == "BLOCKED" or road["risk_score"] >= 75
    })
    if demo_fleet.running:
        start_node = demo_fleet.nearest_node_for_vehicle(exposure["vehicle_id"])
        destination_node = demo_fleet.destination_node
    else:
        vehicle = fleet_state.vehicle()
        start_node = min(NODES, key=lambda node: (NODES[node][0] - vehicle["lat"]) ** 2 + (NODES[node][1] - vehicle["lng"]) ** 2)
        destination_node = "F"
    signature = (exposure["vehicle_id"], start_node, destination_node, tuple(avoid_road_ids))
    if exposure["action"] == "HOLD_AND_REROUTE":
        if demo_fleet.running and not demo_fleet.paused:
            demo_fleet.pause_for_reroute(exposure["road_id"])
            await manager.broadcast({"type": "fleet.snapshot", "data": demo_fleet.snapshot()})
        elif not demo_fleet.running and fleet_state.status_override != "HOLD_POSITION":
            vehicle = fleet_state.hold(f"STOP: {exposure['road_id']} hazard is {exposure['distance_ahead_km']} km ahead. Await the safer route.")
            await manager.broadcast({"type": "vehicle.hold", "data": vehicle})
    if signature != last_auto_reroute_signature:
        try:
            with SessionLocal() as db:
                last_auto_reroute = await create_alternate_route(AlternateRouteRequest(
                    vehicle_id=exposure["vehicle_id"],
                    start_node=start_node,
                    destination_node=destination_node,
                    avoid_road_ids=avoid_road_ids,
                ), db)
        except ValueError as exc:
            last_auto_reroute = None
            exposure["route_error"] = str(exc)
            if exposure["action"] == "HOLD_AND_REROUTE":
                if demo_fleet.running:
                    demo_fleet.mark_no_safe_route()
                else:
                    fleet_state.hold("No safe route remains; hold at a verified safe point")
        last_auto_reroute_signature = signature
    exposure["reroute"] = last_auto_reroute
    latest_route_exposure = exposure
    await manager.broadcast({"type": "route.hazard_ahead", "data": exposure})
    return exposure


def route_road_ids(route_name: str) -> list[str]:
    node_by_name = {value[2]: key for key, value in NODES.items()}
    nodes = [node_by_name.get(name.strip()) for name in route_name.split("→")]
    edge_lookup = {frozenset((left, right)): road_id for left, right, _, _, road_id in EDGES}
    return [edge_lookup[frozenset((left, right))] for left, right in zip(nodes, nodes[1:]) if left and right]


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    ensure_incident_columns()
    # Older prototype builds stored authenticated Control Room closures with the
    # default verified=False flag. Normalize them before risk evaluation.
    with SessionLocal() as db:
        legacy_control_room_items = list(db.scalars(select(Incident).where(
            Incident.source == "control_room", Incident.verified.is_(False)
        )))
        for item in legacy_control_room_items:
            item.verified = True
        db.commit()
    tasks = [asyncio.create_task(run_continuous_risk()), asyncio.create_task(run_demo_replay(manager.broadcast))]
    if settings.gps_simulation_enabled:
        tasks.append(asyncio.create_task(run_simulation(manager.broadcast, settings.simulation_interval_seconds)))
    yield
    for task in tasks:
        task.cancel()


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="Decision-support prototype for emergency logistics in North-East India.",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/uploads/{filename}")
def incident_photo(filename: str, db: Session = Depends(get_db)) -> Response:
    photo = db.get(IncidentPhoto, filename)
    if photo:
        return Response(content=photo.content, media_type=photo.media_type, headers={"Cache-Control": "public, max-age=86400"})
    legacy_file = upload_path / Path(filename).name
    if legacy_file.exists() and legacy_file.is_file():
        return FileResponse(legacy_file)
    raise HTTPException(status_code=404, detail="Photo not found")


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok", "service": settings.app_name,
        "risk_engine": "live", "live_data_enabled": settings.live_data_enabled,
        "risk_last_refresh": risk_engine.last_refresh, "risk_error": risk_engine.last_error,
        "gps_mode": "simulator" if settings.gps_simulation_enabled else "device-telemetry",
    }


@app.get("/api/v1/admin/database/overview")
def database_overview(
    db: Session = Depends(get_db),
    _: dict = Depends(require_roles("ADMIN")),
) -> dict:
    table_models = {
        "incidents": Incident,
        "reroutes": Reroute,
        "driver_events": DriverEvent,
        "risk_snapshots": RiskSnapshot,
        "incident_photos": IncidentPhoto,
    }
    counts = {name: db.scalar(select(func.count()).select_from(model)) or 0 for name, model in table_models.items()}
    incidents = list(db.scalars(select(Incident).order_by(Incident.id.desc()).limit(5)))
    reroutes = list(db.scalars(select(Reroute).order_by(Reroute.id.desc()).limit(5)))
    driver_events = list(db.scalars(select(DriverEvent).order_by(DriverEvent.id.desc()).limit(5)))
    risk_snapshots = list(db.scalars(select(RiskSnapshot).order_by(RiskSnapshot.id.desc()).limit(5)))
    sqlite_path = Path(settings.database_url.removeprefix("sqlite:///")).resolve() if settings.database_url.startswith("sqlite") else None
    return {
        "active_engine": "SQLite" if sqlite_path else "PostgreSQL/PostGIS",
        "environment": "Development fallback" if sqlite_path else "Production geospatial database",
        "location": str(sqlite_path) if sqlite_path else "Configured PostgreSQL server",
        "deployment_target": "PostgreSQL 16 + PostGIS 3.4",
        "postgis_schema": "apps/api/sql/postgis_schema.sql",
        "refreshed_at": datetime.now(timezone.utc).isoformat(),
        "tables": [
            {
                "name": "incidents", "rows": counts["incidents"],
                "columns": ["id", "road_id", "incident_type", "severity", "lat", "lng", "source", "verified", "status", "created_at"],
                "recent": [{"id": item.id, "road": item.road_id, "type": item.incident_type, "severity": item.severity, "source": item.source, "status": item.status, "verified": item.verified, "created": item.created_at.isoformat()} for item in incidents],
            },
            {
                "name": "reroutes", "rows": counts["reroutes"],
                "columns": ["id", "vehicle_id", "status", "route_name", "distance_km", "eta_minutes", "risk_score", "approved_by", "approved_at", "accepted_at"],
                "recent": [{"id": item.id, "vehicle": item.vehicle_id, "status": item.status, "distance_km": item.distance_km, "eta_min": item.eta_minutes, "risk": item.risk_score, "approved_by": item.approved_by or "—"} for item in reroutes],
            },
            {
                "name": "driver_events", "rows": counts["driver_events"],
                "columns": ["id", "vehicle_id", "event_type", "message", "lat", "lng", "created_at"],
                "recent": [{"id": item.id, "vehicle": item.vehicle_id, "event": item.event_type, "message": item.message, "position": f"{item.lat:.4f}, {item.lng:.4f}" if item.lat is not None and item.lng is not None else "—", "created": item.created_at.isoformat()} for item in driver_events],
            },
            {
                "name": "risk_snapshots", "rows": counts["risk_snapshots"],
                "columns": ["id", "road_id", "risk_score", "risk_level", "status", "confidence", "data_status", "data_source", "factors", "observed_at"],
                "recent": [{"id": item.id, "road": item.road_id, "risk": item.risk_score, "level": item.risk_level, "status": item.status, "confidence": f"{round(item.confidence * 100)}%", "data": item.data_status, "observed": item.observed_at.isoformat()} for item in risk_snapshots],
            },
            {
                "name": "incident_photos", "rows": counts["incident_photos"],
                "columns": ["filename", "media_type", "content", "created_at"],
                "recent": [],
            },
        ],
    }


@app.post("/api/v1/auth/login")
def login(payload: LoginRequest) -> dict:
    user = authenticate(payload.username, payload.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return {"access_token": create_access_token(user), "token_type": "bearer", "user": user}


@app.get("/api/v1/auth/me")
def me(user: dict = Depends(current_user)) -> dict:
    return user


@app.get("/api/v1/bootstrap")
async def bootstrap(db: Session = Depends(get_db), _: dict = Depends(current_user)) -> dict:
    incidents = list(db.scalars(select(Incident).where(Incident.status == "ACTIVE")))
    latest_reroute = db.scalars(
        select(Reroute).where(Reroute.status != "ARCHIVED").order_by(Reroute.id.desc())
    ).first()
    if latest_reroute:
        node_by_name = {value[2]: key for key, value in NODES.items()}
        route_nodes = [node_by_name.get(name.strip()) for name in latest_reroute.route_name.split("→")]
        if route_nodes and all(route_nodes):
            reroute_waypoints = [[NODES[node][0], NODES[node][1]] for node in route_nodes]
            aligned_reroute = await road_geometry.snap_segments(reroute_waypoints)
            if aligned_reroute.source != "WAYPOINT_FALLBACK":
                latest_reroute.coordinates = aligned_reroute.coordinates
                latest_reroute.distance_km = aligned_reroute.distance_km
                latest_reroute.eta_minutes = aligned_reroute.eta_minutes
                db.commit()
                db.refresh(latest_reroute)
    road_assessments = risk_engine.roads()
    blocked = {road["id"] for road in road_assessments if road["status"] == "BLOCKED"}
    replay_vehicles = demo_fleet.vehicles()
    selected_vehicle = replay_vehicles[0] if replay_vehicles else fleet_state.vehicle()
    try:
        assigned_route = safest_route(
            "A", "F", list(blocked), {road["id"]: road["risk_score"] for road in road_assessments}
        )
        assigned_geometry = await road_geometry.snap_segments(assigned_route["coordinates"])
    except ValueError:
        assigned_geometry = None
    accepted_route_is_safe = bool(
        latest_reroute
        and latest_reroute.status == "DRIVER_ACCEPTED"
        and not blocked.intersection(route_road_ids(latest_reroute.route_name))
    )
    if demo_fleet.running:
        current_route = demo_fleet.display_route()
        current_route_source = "DEMO_GPS_REPLAY"
    elif accepted_route_is_safe:
        current_route = latest_reroute.coordinates
        current_route_source = "DRIVER_ACCEPTED_REROUTE"
    elif blocked and latest_reroute and latest_reroute.status in {"PENDING_APPROVAL", "APPROVED"}:
        current_route = []
        current_route_source = "HOLDING_FOR_SAFE_REROUTE"
    else:
        current_route = assigned_geometry.coordinates if assigned_geometry else []
        current_route_source = assigned_geometry.source if assigned_geometry else "NO_SAFE_ROUTE"
    return {
        "region": {"name": "Assam demo corridor", "center": [26.135, 91.95], "zoom": 10},
        "vehicle": selected_vehicle,
        "vehicles": replay_vehicles or [selected_vehicle],
        "simulation": demo_fleet.status(),
        "network_nodes": [{"id": key, "name": value[2], "lat": value[0], "lng": value[1]} for key, value in NODES.items()],
        "roads": road_assessments,
        "incidents": [serialize_incident(item) for item in incidents],
        "reroute": serialize_reroute(latest_reroute) if latest_reroute else None,
        "current_route": current_route,
        "current_route_source": current_route_source,
        "route_exposure": current_route_exposure(road_assessments),
        "network_summary": {
            "active_vehicles": len(replay_vehicles) if replay_vehicles else 1,
            "critical_deliveries": len([item for item in replay_vehicles if item["priority"] == "CRITICAL"]) if replay_vehicles else 1,
            "high_risk_roads": len(blocked), "districts_connected": 2,
        },
        "mission_priority": mission_priority(100, 95, 90, 70),
    }


@app.post("/api/v1/risk/pre-trip")
def pre_trip(payload: RiskRequest, _: dict = Depends(require_roles("ADMIN", "DRIVER"))) -> dict:
    return risk_engine.pre_trip(payload.vehicle_id, payload.cargo_priority)


@app.post("/api/v1/risk/recalculate")
async def recalculate_risk(_: dict = Depends(require_roles("ADMIN"))) -> dict:
    roads = await refresh_live_risk()
    return {
        "roads": roads, "engine": "explainable-live-risk-v2",
        "last_refresh": risk_engine.last_refresh, "error": risk_engine.last_error,
    }


@app.get("/api/v1/simulation/options")
def simulation_options(_: dict = Depends(require_roles("ADMIN"))) -> dict:
    return {
        "nodes": [{"id": key, "name": value[2], "lat": value[0], "lng": value[1]} for key, value in NODES.items()],
        "max_vehicles": 8,
        "mode": "DEMO_GPS_REPLAY",
    }


@app.post("/api/v1/simulation/start")
async def start_simulation(
    payload: SimulationConfigRequest,
    db: Session = Depends(get_db),
    _: dict = Depends(require_roles("ADMIN")),
) -> dict:
    try:
        current_roads = risk_engine.roads()
        blocked = [road["id"] for road in current_roads if road["status"] == "BLOCKED"]
        live_risks = {road["id"]: road["risk_score"] for road in current_roads}
        route = safest_route(payload.source_node, payload.destination_node, blocked, live_risks)
        geometry = await road_geometry.snap_segments(route["coordinates"])
        snapshot = demo_fleet.configure(
            payload.vehicle_count,
            payload.source_node,
            payload.destination_node,
            payload.interval_seconds,
            geometry.coordinates,
            geometry.distance_km or route["distance_km"],
            route["road_ids"],
        )
        archive_reroutes(db, "MED-001", include_accepted=True)
        db.commit()
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    await manager.broadcast({"type": "reroute.reset", "data": None})
    await manager.broadcast({"type": "simulation.started", "data": snapshot})
    return snapshot


@app.post("/api/v1/simulation/stop")
async def stop_simulation(_: dict = Depends(require_roles("ADMIN"))) -> dict:
    simulation = demo_fleet.stop()
    result = {"vehicles": [fleet_state.vehicle()], "simulation": simulation}
    await manager.broadcast({"type": "simulation.stopped", "data": result})
    return result


@app.post("/api/v1/incidents", status_code=201)
async def create_incident(
    payload: IncidentCreate,
    db: Session = Depends(get_db),
    user: dict = Depends(require_roles("ADMIN", "FIELD_OFFICER")),
) -> dict:
    incident_data = payload.model_dump()
    if user["role"] == "ADMIN":
        incident_data.update(source="control_room", verified=True)
    else:
        incident_data.update(source=user["id"], verified=False)
    incident = Incident(**incident_data)
    db.add(incident)
    db.commit()
    db.refresh(incident)
    result = serialize_incident(incident)
    await manager.broadcast({"type": "incident.created", "data": result})
    await refresh_live_risk()
    return result


@app.get("/api/v1/incidents")
def incident_history(
    db: Session = Depends(get_db),
    _: dict = Depends(current_user),
) -> list[dict]:
    items = list(db.scalars(select(Incident).order_by(Incident.id.desc()).limit(100)))
    return [serialize_incident(item) for item in items]


@app.post("/api/v1/incidents/{incident_id}/resolve")
async def resolve_incident(
    incident_id: int,
    db: Session = Depends(get_db),
    user: dict = Depends(require_roles("ADMIN")),
) -> dict:
    incident = db.get(Incident, incident_id)
    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")
    incident.status = "RESOLVED"
    archived_reroutes = archive_reroutes(db, "MED-001")
    db.commit()
    db.refresh(incident)
    result = serialize_incident(incident)
    result["resolved_by"] = user["id"]
    result["archived_reroutes"] = archived_reroutes
    await manager.broadcast({"type": "incident.resolved", "data": result})
    if archived_reroutes:
        await manager.broadcast({"type": "reroute.reset", "data": None})
    await refresh_live_risk()
    return result


@app.post("/api/v1/roads/{road_id}/reopen")
async def reopen_road(
    road_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(require_roles("ADMIN")),
) -> dict:
    if road_id not in {road["id"] for road in BASE_ROADS}:
        raise HTTPException(status_code=404, detail="Road segment not found")
    active = list(db.scalars(select(Incident).where(Incident.road_id == road_id, Incident.status == "ACTIVE")))
    for incident in active:
        incident.status = "RESOLVED"
    archived_reroutes = archive_reroutes(db, "MED-001")
    db.commit()
    result = {
        "road_id": road_id,
        "status": "REOPENED",
        "resolved_incidents": len(active),
        "archived_reroutes": archived_reroutes,
        "reopened_by": user["id"],
        "reopened_at": datetime.now(timezone.utc).isoformat(),
    }
    await manager.broadcast({"type": "road.reopened", "data": result})
    if archived_reroutes:
        await manager.broadcast({"type": "reroute.reset", "data": None})
    roads = await refresh_live_risk(evaluate_exposure=False)
    result["road"] = next(road for road in roads if road["id"] == road_id)
    result["roads"] = roads
    result["reroute"] = None
    result["resumed_current_route"] = False
    blocked_road_ids = [road["id"] for road in roads if road["status"] == "BLOCKED"]
    if demo_fleet.running and demo_fleet.paused:
        route_still_blocked = any(item in blocked_road_ids for item in demo_fleet.route_road_ids)
        if route_still_blocked:
            try:
                result["reroute"] = await create_alternate_route(AlternateRouteRequest(
                    vehicle_id="MED-001",
                    start_node=demo_fleet.nearest_node_for_vehicle("MED-001"),
                    destination_node=demo_fleet.destination_node,
                    avoid_road_ids=blocked_road_ids,
                ), db)
            except ValueError:
                demo_fleet.mark_no_safe_route()
        else:
            result["resumed_current_route"] = True
            demo_fleet.resume_current_route()
        await manager.broadcast({"type": "fleet.snapshot", "data": demo_fleet.snapshot()})
    if demo_fleet.running:
        result["current_route"] = demo_fleet.display_route()
    else:
        try:
            route = safest_route("A", "F", blocked_road_ids, {road["id"]: road["risk_score"] for road in roads})
            geometry = await road_geometry.snap_segments(route["coordinates"])
            result["current_route"] = geometry.coordinates
        except ValueError:
            result["current_route"] = []
    return result


@app.post("/api/v1/roads/{road_id}/block", status_code=201)
async def block_road(
    road_id: str,
    payload: RoadBlockRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(require_roles("ADMIN")),
) -> dict:
    """Close one complete registered road edge and immediately calculate a safe alternative."""
    registered = next((road for road in BASE_ROADS if road["id"] == road_id), None)
    if not registered:
        raise HTTPException(status_code=404, detail="Road segment not found")

    active_closure = db.scalars(select(Incident).where(
        Incident.road_id == road_id,
        Incident.status == "ACTIVE",
        Incident.source == "control_room",
        Incident.severity.in_(("HIGH", "CRITICAL")),
    ).order_by(Incident.id.desc())).first()
    if active_closure is None:
        current_road = next((road for road in risk_engine.roads() if road["id"] == road_id), registered)
        coordinates = current_road["coordinates"]
        midpoint = coordinates[len(coordinates) // 2]
        active_closure = Incident(
            road_id=road_id,
            incident_type="BLOCKAGE",
            severity="CRITICAL",
            description=payload.description,
            lat=midpoint[0],
            lng=midpoint[1],
            source="control_room",
            verified=True,
            status="ACTIVE",
            reported_road_status="BLOCKED",
            affected_direction="BOTH",
            vehicle_access="NONE",
        )
        db.add(active_closure)
        db.commit()
        db.refresh(active_closure)
        await manager.broadcast({"type": "incident.created", "data": serialize_incident(active_closure)})

    affected_replay = demo_fleet.running and road_id in demo_fleet.route_road_ids
    if affected_replay:
        demo_fleet.pause_for_reroute(road_id)
        await manager.broadcast({"type": "fleet.snapshot", "data": demo_fleet.snapshot()})

    roads = await refresh_live_risk(evaluate_exposure=False)
    blocked_road_ids = [road["id"] for road in roads if road["status"] == "BLOCKED"]
    blocked_road = next(road for road in roads if road["id"] == road_id)
    reroute = None
    route_error = None
    try:
        reroute = await create_alternate_route(AlternateRouteRequest(
            vehicle_id=payload.vehicle_id,
            start_node=demo_fleet.nearest_node_for_vehicle(payload.vehicle_id) if demo_fleet.running else payload.start_node,
            destination_node=demo_fleet.destination_node if demo_fleet.running else payload.destination_node,
            avoid_road_ids=blocked_road_ids,
        ), db)
    except ValueError as exc:
        route_error = str(exc)
        fleet_state.reroute_status = "NO_SAFE_ROUTE"
        fleet_state.last_instruction = "No safe route remains; hold at a verified safe point"
        if affected_replay:
            demo_fleet.mark_no_safe_route()
            await manager.broadcast({"type": "fleet.snapshot", "data": demo_fleet.snapshot()})

    route_exposure = current_route_exposure(roads)
    if route_exposure:
        route_exposure["reroute"] = reroute
        route_exposure["route_error"] = route_error
        await manager.broadcast({"type": "route.hazard_ahead", "data": route_exposure})

    result = {
        "status": "BLOCKED_AND_REROUTED" if reroute else "BLOCKED_NO_SAFE_ROUTE",
        "road_id": road_id,
        "closure_scope": "ENTIRE_REGISTERED_ROAD_EDGE",
        "blocked_from": registered["coordinates"][0],
        "blocked_to": registered["coordinates"][-1],
        "blocked_road_ids": blocked_road_ids,
        "road": blocked_road,
        "roads": roads,
        "incident": serialize_incident(active_closure),
        "reroute": reroute,
        "route_error": route_error,
        "blocked_by": user["id"],
        "vehicle_held": affected_replay,
        "vehicle": demo_fleet.vehicles()[0] if affected_replay and demo_fleet.vehicles() else fleet_state.vehicle(),
        "current_route": demo_fleet.display_route() if demo_fleet.running else [],
        "route_exposure": route_exposure,
    }
    await manager.broadcast({"type": "road.blocked", "data": result})
    return result


@app.post("/api/v1/incidents/{incident_id}/confirm-closure", status_code=201)
async def confirm_field_report_closure(
    incident_id: int,
    payload: ConfirmFieldReportRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(require_roles("ADMIN")),
) -> dict:
    """Accept a Field Officer report, map it, and issue one end-to-end road closure."""
    report = db.get(Incident, incident_id)
    if not report:
        raise HTTPException(status_code=404, detail="Field report not found")
    if report.source == "control_room":
        raise HTTPException(status_code=422, detail="This is already a Control Room incident")
    if report.status != "ACTIVE":
        raise HTTPException(status_code=409, detail="This field report is no longer awaiting action")
    if report.verified:
        raise HTTPException(status_code=409, detail="This field report was already confirmed")

    registered = next((road for road in BASE_ROADS if road["id"] == payload.road_id), None)
    if not registered:
        raise HTTPException(status_code=404, detail="Select a registered road segment")

    closure = await block_road(
        payload.road_id,
        RoadBlockRequest(
            vehicle_id=payload.vehicle_id,
            start_node=payload.start_node,
            destination_node=payload.destination_node,
            description=(
                f"Control Room confirmed Field Officer report INC-{report.id}: "
                f"{report.description}"
            ),
        ),
        db,
        user,
    )

    report.road_id = payload.road_id
    report.verified = True
    report.status = "RESOLVED"
    report.reported_road_status = "BLOCKED"
    db.commit()
    db.refresh(report)
    reviewed_report = serialize_incident(report)
    reviewed_report["confirmed_by"] = user["id"]
    closure["reviewed_report"] = reviewed_report
    await manager.broadcast({"type": "field.report_confirmed", "data": reviewed_report})
    return closure


@app.post("/api/v1/routes/alternate", status_code=201)
async def alternate_route(
    payload: AlternateRouteRequest,
    db: Session = Depends(get_db),
    _: dict = Depends(require_roles("ADMIN")),
) -> dict:
    try:
        return await create_alternate_route(payload, db)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/api/v1/routes/monitor")
def monitor_routes(
    start_node: str = "A",
    destination_node: str = "F",
    _: dict = Depends(require_roles("ADMIN")),
) -> dict:
    assessments = {road["id"]: road for road in risk_engine.roads()}
    try:
        routes = ranked_routes(start_node, destination_node, assessments, limit=4)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {
        "routes": routes,
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
        "refresh_seconds": settings.risk_refresh_seconds,
        "risk_engine_refresh": risk_engine.last_refresh,
        "algorithm": "All paths ranked by risk-adjusted travel cost; blocked paths are never recommended",
    }


@app.post("/api/v1/reroutes/{reroute_id}/approve")
async def approve_reroute(
    reroute_id: int, payload: ApproveRerouteRequest, db: Session = Depends(get_db),
    _: dict = Depends(require_roles("ADMIN")),
) -> dict:
    reroute = db.get(Reroute, reroute_id)
    if not reroute:
        raise HTTPException(status_code=404, detail="Reroute not found")
    if reroute.status not in {"PENDING_APPROVAL", "APPROVED"}:
        raise HTTPException(status_code=409, detail=f"Cannot approve reroute in {reroute.status} state")
    reroute.status = "APPROVED"
    reroute.approved_by = payload.approved_by
    reroute.approved_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(reroute)
    fleet_state.reroute_status = "AWAITING_DRIVER"
    fleet_state.last_instruction = "New safe route approved — review and accept"
    if demo_fleet.running and demo_fleet.paused:
        demo_fleet.mark_awaiting_driver()
        await manager.broadcast({"type": "fleet.snapshot", "data": demo_fleet.snapshot()})
    result = serialize_reroute(reroute)
    await manager.broadcast({"type": "reroute.approved", "data": result})
    return result


@app.post("/api/v1/vehicles/{vehicle_id}/hold")
async def hold_vehicle(
    vehicle_id: str,
    _: dict = Depends(require_roles("ADMIN")),
) -> dict:
    if vehicle_id != "MED-001":
        raise HTTPException(status_code=404, detail="Vehicle is not assigned to this pilot corridor")
    vehicle = fleet_state.hold("No safe route is available. Stop at the nearest safe holding point and await control-room clearance.")
    await manager.broadcast({"type": "vehicle.hold", "data": vehicle})
    return vehicle


@app.post("/api/v1/vehicles/{vehicle_id}/release-hold")
async def release_vehicle_hold(
    vehicle_id: str,
    _: dict = Depends(require_roles("ADMIN")),
) -> dict:
    if vehicle_id != "MED-001":
        raise HTTPException(status_code=404, detail="Vehicle is not assigned to this pilot corridor")
    vehicle = fleet_state.release_hold()
    await manager.broadcast({"type": "vehicle.hold_released", "data": vehicle})
    return vehicle


@app.post("/api/v1/driver/{vehicle_id}/routes/{reroute_id}/accept")
async def driver_accept(
    vehicle_id: str, reroute_id: int, db: Session = Depends(get_db),
    _: dict = Depends(require_roles("DRIVER")),
) -> dict:
    reroute = db.get(Reroute, reroute_id)
    if not reroute or reroute.vehicle_id != vehicle_id:
        raise HTTPException(status_code=404, detail="Reroute not found for vehicle")
    if reroute.status not in {"APPROVED", "DRIVER_ACCEPTED"}:
        raise HTTPException(status_code=409, detail="Control-room approval is required first")
    reroute.status = "DRIVER_ACCEPTED"
    reroute.accepted_at = datetime.now(timezone.utc)
    db.add(DriverEvent(vehicle_id=vehicle_id, event_type="ROUTE_ACCEPTED", message=f"Accepted reroute {reroute_id}"))
    db.commit()
    db.refresh(reroute)
    fleet_state.reroute_status = "REROUTED"
    fleet_state.last_instruction = f"Follow approved route: {reroute.route_name}"
    result = serialize_reroute(reroute)
    await manager.broadcast({"type": "reroute.driver_accepted", "data": result})
    if demo_fleet.running:
        snapshot = demo_fleet.apply_reroute(
            reroute.coordinates,
            reroute.distance_km,
            route_road_ids(reroute.route_name),
        )
        await manager.broadcast({"type": "fleet.snapshot", "data": snapshot})
    else:
        vehicle = fleet_state.apply_reroute(reroute.coordinates, route_road_ids(reroute.route_name))
        await manager.broadcast({"type": "vehicle.location", "data": vehicle})
    return result


@app.post("/api/v1/driver/{vehicle_id}/reports", status_code=201)
async def driver_report(
    vehicle_id: str, payload: DriverReportRequest, db: Session = Depends(get_db),
    _: dict = Depends(require_roles("DRIVER")),
) -> dict:
    event = DriverEvent(vehicle_id=vehicle_id, event_type="UNSAFE_REPORT", **payload.model_dump())
    db.add(event)
    db.commit()
    db.refresh(event)
    result = {"id": event.id, "vehicle_id": vehicle_id, "event_type": event.event_type, "message": event.message}
    await manager.broadcast({"type": "driver.unsafe_report", "data": result})
    return result


@app.post("/api/v1/driver/{vehicle_id}/sos", status_code=201)
async def driver_sos(
    vehicle_id: str, payload: DriverReportRequest, db: Session = Depends(get_db),
    _: dict = Depends(require_roles("DRIVER")),
) -> dict:
    event = DriverEvent(vehicle_id=vehicle_id, event_type="SOS", **payload.model_dump())
    db.add(event)
    db.commit()
    db.refresh(event)
    fleet_state.last_instruction = "SOS acknowledged — control room coordinating assistance"
    result = {"id": event.id, "vehicle_id": vehicle_id, "event_type": "SOS", "status": "ACKNOWLEDGED", "message": event.message}
    await manager.broadcast({"type": "driver.sos", "data": result})
    return result


@app.post("/api/v1/telemetry/vehicles/{vehicle_id}/location")
async def ingest_vehicle_telemetry(
    vehicle_id: str, payload: VehicleTelemetryRequest,
    _: dict = Depends(require_roles("DRIVER", "ADMIN")),
) -> dict:
    if vehicle_id != "MED-001":
        raise HTTPException(status_code=404, detail="Vehicle is not assigned to this pilot corridor")
    vehicle = fleet_state.ingest(
        payload.lat, payload.lng, payload.speed_kmph, payload.accuracy_m, payload.captured_at
    )
    await manager.broadcast({"type": "vehicle.location", "data": vehicle})
    await handle_route_exposure(risk_engine.roads())
    return vehicle


@app.post("/api/v1/uploads/incident-photo", status_code=201)
async def upload_incident_photo(
    photo: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: dict = Depends(require_roles("FIELD_OFFICER")),
) -> dict:
    suffix = Path(photo.filename or "photo.jpg").suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise HTTPException(status_code=415, detail="Only JPG, PNG and WebP photos are accepted")
    content = await photo.read()
    photo_url = store_image(content, db, suffix)
    return {"photo_url": photo_url, "size_bytes": len(content)}


@app.post("/api/v1/field/verify", status_code=201)
async def field_verify(
    payload: FieldVerificationRequest,
    db: Session = Depends(get_db),
    user: dict = Depends(require_roles("FIELD_OFFICER")),
) -> dict:
    resolved_type = (payload.incident_type_other or "OTHER").strip() if payload.incident_type == "OTHER" else payload.incident_type
    resolved_description = f"Landmark: {payload.landmark.strip()}. {payload.description}" if payload.landmark else payload.description
    photo_url = payload.photo_url
    if payload.photo_data_url:
        try:
            header, encoded = payload.photo_data_url.split(",", 1)
            if not header.startswith("data:image/") or ";base64" not in header:
                raise ValueError
            photo_url = store_image(base64.b64decode(encoded, validate=True), db)
        except (ValueError, binascii.Error) as exc:
            raise HTTPException(status_code=422, detail="Offline photo data is invalid") from exc
    incident = Incident(
        road_id=payload.road_id, incident_type=resolved_type, severity=payload.severity,
        description=resolved_description, lat=payload.lat, lng=payload.lng,
        source=user["id"], verified=False,
        status="ACTIVE" if payload.road_status != "SAFE" else "RESOLVED",
        reported_road_status=payload.road_status,
        affected_direction=payload.affected_direction,
        vehicle_access=payload.vehicle_access,
        clearance_estimate=payload.clearance_estimate,
        landmark=payload.landmark,
        photo_url=photo_url,
    )
    db.add(incident)
    db.commit()
    db.refresh(incident)
    result = {
        **serialize_incident(incident), "road_status": payload.road_status,
        "affected_direction": payload.affected_direction,
        "vehicle_access": payload.vehicle_access,
        "clearance_estimate": payload.clearance_estimate,
        "landmark": payload.landmark,
        "photo_url": photo_url,
        "sync_status": "SYNCED",
    }
    await manager.broadcast({"type": "field.verification", "data": result})
    await refresh_live_risk()
    return result


@app.websocket("/ws/fleet")
async def fleet_socket(websocket: WebSocket) -> None:
    requested_protocols = [item.strip() for item in websocket.headers.get("sec-websocket-protocol", "").split(",") if item.strip()]
    token = requested_protocols[1] if len(requested_protocols) >= 2 and requested_protocols[0] == "ner-logix" else None
    if not token:
        await websocket.close(code=4401)
        return
    try:
        decode_token(token)
    except HTTPException:
        await websocket.close(code=4401)
        return
    await manager.connect(websocket, subprotocol="ner-logix")
    try:
        replay_vehicles = demo_fleet.vehicles()
        await websocket.send_json({"type": "connected", "data": replay_vehicles[0] if replay_vehicles else fleet_state.vehicle()})
        if replay_vehicles:
            await websocket.send_json({"type": "fleet.snapshot", "data": demo_fleet.snapshot()})
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(websocket)


frontend_path = Path(settings.frontend_dir) if settings.frontend_dir else None
if frontend_path and frontend_path.exists():
    app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")
