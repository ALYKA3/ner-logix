from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from statistics import quantiles
from time import monotonic

import httpx


WEATHER_URL = "https://api.open-meteo.com/v1/forecast"
FLOOD_URL = "https://flood-api.open-meteo.com/v1/flood"


def _safe_number(value: object) -> float | None:
    return float(value) if isinstance(value, (int, float)) else None


def _percentile_90(values: list[float]) -> float | None:
    if not values:
        return None
    if len(values) < 2:
        return values[0]
    return quantiles(values, n=10, method="inclusive")[8]


class OpenMeteoAdapter:
    """Live model-data adapter. It never substitutes generated weather values."""

    def __init__(self, timeout_seconds: float = 12.0) -> None:
        self.timeout_seconds = timeout_seconds
        self.cache_seconds = 60.0
        self._cache: dict[str, tuple[float, dict]] = {}

    async def _weather(self, lat: float, lng: float) -> dict:
        params = {
            "latitude": lat,
            "longitude": lng,
            "current": ",".join((
                "precipitation", "rain", "showers", "soil_moisture_0_to_1cm",
                "soil_moisture_9_to_27cm", "wind_gusts_10m", "weather_code",
            )),
            "hourly": "precipitation",
            "past_hours": 6,
            "forecast_hours": 1,
            "timezone": "UTC",
        }
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.get(WEATHER_URL, params=params)
            response.raise_for_status()
            payload = response.json()
        current = payload.get("current", {})
        hourly_precip = [
            number for value in payload.get("hourly", {}).get("precipitation", [])
            if (number := _safe_number(value)) is not None
        ]
        return {
            "precipitation_mm": _safe_number(current.get("precipitation")),
            "rain_mm": _safe_number(current.get("rain")),
            "showers_mm": _safe_number(current.get("showers")),
            "precipitation_6h_mm": round(sum(hourly_precip[:-1] or hourly_precip), 2),
            "soil_moisture_surface": _safe_number(current.get("soil_moisture_0_to_1cm")),
            "soil_moisture_root": _safe_number(current.get("soil_moisture_9_to_27cm")),
            "wind_gust_kmph": _safe_number(current.get("wind_gusts_10m")),
            "weather_code": current.get("weather_code"),
            "weather_observed_at": current.get("time"),
        }

    async def _flood(self, lat: float, lng: float) -> dict:
        params = {
            "latitude": lat,
            "longitude": lng,
            "daily": "river_discharge,river_discharge_max",
            "past_days": 30,
            "forecast_days": 2,
        }
        async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
            response = await client.get(FLOOD_URL, params=params)
            response.raise_for_status()
            payload = response.json()
        daily = payload.get("daily", {})
        discharge = [
            number for value in daily.get("river_discharge", [])
            if (number := _safe_number(value)) is not None
        ]
        discharge_max = [
            number for value in daily.get("river_discharge_max", [])
            if (number := _safe_number(value)) is not None
        ]
        historical = discharge[:-2] if len(discharge) > 2 else discharge
        current = discharge[-2] if len(discharge) >= 2 else (discharge[-1] if discharge else None)
        current_max = discharge_max[-2] if len(discharge_max) >= 2 else (discharge_max[-1] if discharge_max else None)
        p90 = _percentile_90(historical)
        return {
            "river_discharge_m3s": current,
            "river_discharge_max_m3s": current_max,
            "river_discharge_p90_m3s": round(p90, 3) if p90 is not None else None,
            "river_pressure_ratio": round(current / p90, 3) if current is not None and p90 else None,
            "flood_observed_at": daily.get("time", [None])[-2] if len(daily.get("time", [])) >= 2 else None,
        }

    async def road_snapshot(self, road: dict) -> dict:
        cached = self._cache.get(road["id"])
        if cached and monotonic() - cached[0] < self.cache_seconds:
            return {**cached[1], "cache_age_seconds": round(monotonic() - cached[0], 1)}
        coordinates = road["coordinates"]
        lat = sum(point[0] for point in coordinates) / len(coordinates)
        lng = sum(point[1] for point in coordinates) / len(coordinates)
        weather, flood = await asyncio.gather(self._weather(lat, lng), self._flood(lat, lng))
        snapshot = {
            **weather,
            **flood,
            "source": "Open-Meteo Forecast API + GloFAS v4 Flood API",
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "data_status": "LIVE",
        }
        self._cache[road["id"]] = (monotonic(), snapshot)
        return snapshot

    async def corridor_snapshots(self, roads: list[dict]) -> dict[str, dict]:
        snapshots = await asyncio.gather(
            *(self.road_snapshot(road) for road in roads), return_exceptions=True
        )
        result: dict[str, dict] = {}
        for road, snapshot in zip(roads, snapshots):
            if isinstance(snapshot, Exception):
                result[road["id"]] = {
                    "source": "Open-Meteo / GloFAS",
                    "data_status": "UNAVAILABLE",
                    "error": type(snapshot).__name__,
                    "fetched_at": datetime.now(timezone.utc).isoformat(),
                }
            else:
                result[road["id"]] = snapshot
        return result
