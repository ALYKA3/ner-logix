from typing import Protocol


class WeatherAdapter(Protocol):
    async def corridor_snapshot(self, corridor_id: str) -> dict: ...


class GovernmentRoadAdapter(Protocol):
    async def active_closures(self, district: str) -> list[dict]: ...


class BridgeMonitoringAdapter(Protocol):
    async def bridge_status(self, bridge_id: str) -> dict: ...

