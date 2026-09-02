from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any

from ..adapters.live_weather import OpenMeteoAdapter
from .road_geometry import road_geometry


# Physical corridor configuration. Dynamic hazard values never live in this table.
BASE_ROADS = [
    {"id": "R-01", "name": "Guwahati - Jorabat",
     "coordinates": [[26.1445, 91.7362], [26.1164, 91.8721]]},
    {"id": "R-02", "name": "Jorabat - Sonapur",
     "coordinates": [[26.1164, 91.8721], [26.1127, 91.9898]]},
    {"id": "R-03", "name": "Sonapur - Khetri",
     "coordinates": [[26.1127, 91.9898], [26.1021, 92.1124]]},
    {"id": "R-04", "name": "Jorabat - Chandrapur",
     "coordinates": [[26.1164, 91.8721], [26.1804, 91.9953]]},
    {"id": "R-05", "name": "Chandrapur - Khetri",
     "coordinates": [[26.1804, 91.9953], [26.1021, 92.1124]]},
    {"id": "R-06", "name": "Khetri - District Relief Hub",
     "coordinates": [[26.1021, 92.1124], [26.1810, 92.1452]]},
    {"id": "R-07", "name": "Chandrapur - District Relief Hub",
     "coordinates": [[26.1804, 91.9953], [26.1810, 92.1452]]},
    {"id": "R-08", "name": "Sonapur - Chandrapur Connector",
     "coordinates": [[26.1127, 91.9898], [26.1804, 91.9953]]},
]


def risk_level(score: int) -> str:
    if score >= 75:
        return "CRITICAL"
    if score >= 50:
        return "HIGH"
    if score >= 25:
        return "MEDIUM"
    return "LOW"


def _value(item: Any, name: str, default: Any = None) -> Any:
    return item.get(name, default) if isinstance(item, dict) else getattr(item, name, default)


def _scaled(value: float | None, lower: float, upper: float, maximum: float) -> float:
    if value is None or value <= lower:
        return 0.0
    return min(maximum, (value - lower) / max(upper - lower, 0.0001) * maximum)


def calculate_road_risk(road: dict, live: dict, incidents: list[Any]) -> dict:
    relevant = [item for item in incidents if _value(item, "road_id") == road["id"] and _value(item, "status") == "ACTIVE"]
    trusted = [item for item in relevant if _value(item, "verified") or _value(item, "source") == "control_room"]
    severity_weight = {"LOW": 8, "MEDIUM": 18, "HIGH": 38, "CRITICAL": 55}
    incident_contribution = max((severity_weight.get(_value(item, "severity"), 12) for item in (trusted or relevant)), default=0)
    if relevant and not trusted:
        incident_contribution = min(25, incident_contribution)

    precipitation = live.get("precipitation_mm")
    precipitation_6h = live.get("precipitation_6h_mm")
    soil_moisture = live.get("soil_moisture_root")
    wind_gust = live.get("wind_gust_kmph")
    river_ratio = live.get("river_pressure_ratio")
    factors = [
        {"name": "current_precipitation", "value": precipitation, "unit": "mm/h", "contribution": round(_scaled(precipitation, 0, 2.0, 18), 1)},
        {"name": "six_hour_precipitation", "value": precipitation_6h, "unit": "mm", "contribution": round(_scaled(precipitation_6h, 2, 25, 14), 1)},
        {"name": "soil_saturation", "value": soil_moisture, "unit": "m³/m³", "contribution": round(_scaled(soil_moisture, 0.25, 0.50, 13), 1)},
        {"name": "wind_gust", "value": wind_gust, "unit": "km/h", "contribution": round(_scaled(wind_gust, 30, 80, 5), 1)},
        {"name": "river_discharge_pressure", "value": river_ratio, "unit": "ratio-to-30d-p90", "contribution": round(_scaled(river_ratio, 0.70, 1.50, 20), 1)},
        {"name": "trusted_live_incidents", "value": len(trusted), "unit": "reports", "contribution": float(incident_contribution)},
    ]
    score = min(100, round(sum(item["contribution"] for item in factors)))
    blocked = any(_value(item, "severity") in {"HIGH", "CRITICAL"} for item in trusted)
    if blocked:
        score = max(score, 92)

    live_fields = [precipitation, precipitation_6h, soil_moisture, wind_gust, river_ratio]
    completeness = sum(value is not None for value in live_fields) / len(live_fields)
    confidence = min(0.99, 0.40 + completeness * 0.55 + (0.04 if trusted else 0))
    active_factors = sorted((item for item in factors if item["contribution"] > 0), key=lambda item: item["contribution"], reverse=True)
    reason = "; ".join(f"{item['name'].replace('_', ' ')} +{item['contribution']:g}" for item in active_factors[:3]) or "No active hazard signal"
    now = datetime.now(timezone.utc).isoformat()
    return {
        **road,
        "risk_score": score,
        "risk_level": risk_level(score),
        "status": "BLOCKED" if blocked else "OPEN",
        "reason": reason,
        "confidence": round(confidence, 2),
        "factors": factors,
        "data_status": live.get("data_status", "UNAVAILABLE"),
        "data_source": live.get("source", "No live source available"),
        "source_observed_at": live.get("weather_observed_at") or live.get("fetched_at"),
        "last_evaluated": now,
        "provenance": {
            "weather": live,
            "incidents": [{"id": _value(item, "id"), "source": _value(item, "source"), "verified": bool(_value(item, "verified"))} for item in relevant],
            "corridor_registry": "NER-LOGIX road identifiers and WGS84 geometry",
        },
        "hazard_locations": [
            {
                "incident_id": _value(item, "id"),
                "lat": _value(item, "lat"),
                "lng": _value(item, "lng"),
                "source": _value(item, "source"),
            }
            for item in trusted
            if _value(item, "lat") is not None and _value(item, "lng") is not None
        ],
    }


class LiveRiskEngine:
    def __init__(self) -> None:
        self._roads: list[dict] = []
        self._lock = asyncio.Lock()
        self.last_refresh: str | None = None
        self.last_error: str | None = None

    def roads(self) -> list[dict]:
        if self._roads:
            return self._roads
        unavailable = {"data_status": "INITIALIZING", "source": "Live feeds pending"}
        return [calculate_road_risk(road, unavailable, []) for road in BASE_ROADS]

    async def refresh(self, incidents: list[Any], adapter: OpenMeteoAdapter | None) -> list[dict]:
        async with self._lock:
            if adapter is None:
                # Keep unit tests and deliberately offline deployments deterministic.
                corridor_roads = BASE_ROADS
                snapshots = {road["id"]: {"data_status": "DISABLED", "source": "Live data disabled by configuration"} for road in corridor_roads}
            else:
                snapped = await asyncio.gather(*(road_geometry.snap(road["coordinates"]) for road in BASE_ROADS))
                corridor_roads = [
                    {
                        **road,
                        "coordinates": geometry.coordinates,
                        "geometry_source": geometry.source,
                        "road_distance_km": geometry.distance_km or None,
                    }
                    for road, geometry in zip(BASE_ROADS, snapped)
                ]
                snapshots = await adapter.corridor_snapshots(corridor_roads)
            calculated = [calculate_road_risk(road, snapshots[road["id"]], incidents) for road in corridor_roads]
            live_count = sum(road["data_status"] == "LIVE" for road in calculated)
            # Incident closures and reopenings remain authoritative even when the
            # deployment intentionally disables external weather feeds.
            if adapter is None or live_count or not self._roads:
                self._roads = calculated
            else:
                now = datetime.now(timezone.utc).isoformat()
                self._roads = [{**road, "data_status": "STALE", "last_evaluated": now} for road in self._roads]
            self.last_refresh = datetime.now(timezone.utc).isoformat()
            self.last_error = None if live_count else "All external live feeds unavailable"
            return self._roads

    def pre_trip(self, vehicle_id: str, cargo_priority: str) -> dict:
        roads = self.roads()
        max_risk = max(road["risk_score"] for road in roads)
        average_risk = round(sum(road["risk_score"] for road in roads) / len(roads))
        critical_uplift = 8 if cargo_priority == "CRITICAL" else 4 if cargo_priority == "ESSENTIAL" else 0
        dispatch_risk = min(100, round(max_risk * 0.65 + average_risk * 0.35 + critical_uplift))
        return {
            "vehicle_id": vehicle_id,
            "risk_score": dispatch_risk,
            "risk_level": risk_level(dispatch_risk),
            "confidence": round(sum(road["confidence"] for road in roads) / len(roads), 2),
            "cargo_priority": cargo_priority,
            "recommendation": "Control-room approval required before dispatch" if dispatch_risk >= 50 else "Proceed with continuous monitoring",
            "road_assessments": [{"road_id": road["id"], "risk_score": road["risk_score"], "status": road["status"]} for road in roads],
            "evaluated_at": datetime.now(timezone.utc).isoformat(),
            "model": "explainable-live-risk-v2",
            "data_sources": sorted({road["data_source"] for road in roads}),
        }


risk_engine = LiveRiskEngine()


def mission_priority(cargo_urgency: int, destination_criticality: int, stock_risk: int, delay_risk: int) -> int:
    return round(cargo_urgency * 0.40 + destination_criticality * 0.25 + stock_risk * 0.20 + delay_risk * 0.15)
