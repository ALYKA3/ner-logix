from typing import Literal

from pydantic import BaseModel, Field, model_validator


class Coordinate(BaseModel):
    lat: float
    lng: float


class LoginRequest(BaseModel):
    username: str
    password: str


class IncidentCreate(BaseModel):
    road_id: str = "R-02"
    incident_type: Literal["FLOOD", "LANDSLIDE", "BLOCKAGE", "BRIDGE_DAMAGE"] = "FLOOD"
    severity: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] = "HIGH"
    description: str = Field(default="Water level rising near Sonapur", min_length=3, max_length=1000)
    lat: float = Field(default=26.1127, ge=-90, le=90)
    lng: float = Field(default=91.9898, ge=-180, le=180)
    source: str = "control_room"


class RiskRequest(BaseModel):
    vehicle_id: str = "MED-001"
    cargo_priority: Literal["ROUTINE", "ESSENTIAL", "CRITICAL"] = "CRITICAL"


class VehicleTelemetryRequest(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    speed_kmph: float = Field(default=0, ge=0, le=180)
    accuracy_m: float | None = Field(default=None, ge=0)
    heading_degrees: float | None = Field(default=None, ge=0, le=360)
    captured_at: str | None = None


class SimulationConfigRequest(BaseModel):
    vehicle_count: int = Field(default=3, ge=1, le=8)
    source_node: str = "A"
    destination_node: str = "F"
    interval_seconds: float = Field(default=2.0, ge=0.5, le=10)


class AlternateRouteRequest(BaseModel):
    vehicle_id: str = "MED-001"
    start_node: str = "A"
    destination_node: str = "F"
    avoid_road_ids: list[str] = Field(default_factory=lambda: ["R-02"])


class RoadBlockRequest(BaseModel):
    vehicle_id: str = "MED-001"
    start_node: str = "A"
    destination_node: str = "F"
    description: str = Field(
        default="Road blocked directly from the Control Room map after a verified safety report",
        min_length=3,
        max_length=1000,
    )


class ConfirmFieldReportRequest(BaseModel):
    road_id: str
    vehicle_id: str = "MED-001"
    start_node: str = "A"
    destination_node: str = "F"


class ApproveRerouteRequest(BaseModel):
    approved_by: str = "Assam Control Room"


class DriverReportRequest(BaseModel):
    message: str = Field(default="Road is unsafe due to standing water", min_length=3, max_length=1000)
    lat: float | None = Field(default=None, ge=-90, le=90)
    lng: float | None = Field(default=None, ge=-180, le=180)


class FieldVerificationRequest(BaseModel):
    road_id: str = "R-02"
    landmark: str | None = Field(default=None, max_length=160)
    incident_type: Literal["FLOOD", "LANDSLIDE", "BLOCKAGE", "BRIDGE_DAMAGE", "OTHER"] = "FLOOD"
    incident_type_other: str | None = Field(default=None, max_length=40)
    road_status: Literal["SAFE", "CAUTION", "RESTRICTED", "BLOCKED"] = "BLOCKED"
    severity: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"] = "HIGH"
    description: str = Field(default="Road is not passable", min_length=3, max_length=1000)
    affected_direction: Literal["BOTH", "EASTBOUND", "WESTBOUND"] = "BOTH"
    vehicle_access: Literal["ALL", "LIGHT_ONLY", "EMERGENCY_ONLY", "NONE"] = "NONE"
    clearance_estimate: str = "Unknown"
    lat: float = Field(default=26.1127, ge=-90, le=90)
    lng: float = Field(default=91.9898, ge=-180, le=180)
    photo_url: str | None = Field(default=None, max_length=255)
    photo_data_url: str | None = Field(default=None, max_length=7_500_000)

    @model_validator(mode="after")
    def validate_custom_location_and_type(self):
        if self.road_id == "UNMAPPED" and not (self.landmark or "").strip():
            raise ValueError("Add a landmark when the road segment is unknown")
        if self.incident_type == "OTHER" and not (self.incident_type_other or "").strip():
            raise ValueError("Describe the other inspection type")
        return self
