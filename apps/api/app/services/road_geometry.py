from __future__ import annotations

import asyncio
from dataclasses import dataclass

import httpx


OSRM_ROUTE_URL = "https://router.project-osrm.org/route/v1/driving"


@dataclass
class SnappedRoute:
    coordinates: list[list[float]]
    distance_km: float
    eta_minutes: int
    source: str


class RoadGeometryService:
    """Road-snaps sparse WGS84 waypoints; safe fallback keeps the demo operational offline."""

    def __init__(self) -> None:
        self._cache: dict[tuple[tuple[float, float], ...], SnappedRoute] = {}
        self._lock = asyncio.Lock()

    async def snap(self, points: list[list[float]] | list[tuple[float, float]]) -> SnappedRoute:
        normalized = tuple((round(float(lat), 6), round(float(lng), 6)) for lat, lng in points)
        if len(normalized) < 2:
            return SnappedRoute([[lat, lng] for lat, lng in normalized], 0, 0, "WAYPOINT_FALLBACK")
        if normalized in self._cache:
            return self._cache[normalized]
        async with self._lock:
            if normalized in self._cache:
                return self._cache[normalized]
            coordinate_path = ";".join(f"{lng},{lat}" for lat, lng in normalized)
            try:
                async with httpx.AsyncClient(timeout=15.0) as client:
                    response = await client.get(
                        f"{OSRM_ROUTE_URL}/{coordinate_path}",
                        params={"overview": "full", "geometries": "geojson", "steps": "false"},
                    )
                    response.raise_for_status()
                    payload = response.json()
                route = payload["routes"][0]
                raw = route["geometry"]["coordinates"]
                # Retain road bends while bounding payload size for realtime WebSocket/UI updates.
                stride = max(1, len(raw) // 450)
                sampled = raw[::stride]
                if sampled[-1] != raw[-1]:
                    sampled.append(raw[-1])
                result = SnappedRoute(
                    coordinates=[[lat, lng] for lng, lat in sampled],
                    distance_km=round(route["distance"] / 1000, 1),
                    eta_minutes=max(1, round(route["duration"] / 60)),
                    source="OSRM + OpenStreetMap road geometry",
                )
            except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError):
                result = SnappedRoute(
                    coordinates=[[lat, lng] for lat, lng in normalized],
                    distance_km=0,
                    eta_minutes=0,
                    source="WAYPOINT_FALLBACK",
                )
            self._cache[normalized] = result
            return result

    async def snap_segments(self, points: list[list[float]] | list[tuple[float, float]]) -> SnappedRoute:
        """Snap each graph edge independently so route and road-risk layers share identical corridors."""
        if len(points) < 2:
            return await self.snap(points)
        segments = await asyncio.gather(*(self.snap([left, right]) for left, right in zip(points, points[1:])))
        coordinates: list[list[float]] = []
        for segment in segments:
            segment_points = segment.coordinates
            if coordinates and segment_points and coordinates[-1] == segment_points[0]:
                segment_points = segment_points[1:]
            coordinates.extend(segment_points)
        genuine = all(segment.source != "WAYPOINT_FALLBACK" for segment in segments)
        return SnappedRoute(
            coordinates=coordinates,
            distance_km=round(sum(segment.distance_km for segment in segments), 1),
            eta_minutes=sum(segment.eta_minutes for segment in segments),
            source="OSRM + OpenStreetMap segment-aligned geometry" if genuine else "WAYPOINT_FALLBACK",
        )


road_geometry = RoadGeometryService()
