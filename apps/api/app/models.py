from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Incident(Base):
    __tablename__ = "incidents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    road_id: Mapped[str] = mapped_column(String(40), index=True)
    incident_type: Mapped[str] = mapped_column(String(40))
    severity: Mapped[str] = mapped_column(String(20))
    description: Mapped[str] = mapped_column(Text)
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(40), default="control_room")
    verified: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")
    reported_road_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    affected_direction: Mapped[str | None] = mapped_column(String(20), nullable=True)
    vehicle_access: Mapped[str | None] = mapped_column(String(30), nullable=True)
    clearance_estimate: Mapped[str | None] = mapped_column(String(80), nullable=True)
    landmark: Mapped[str | None] = mapped_column(String(160), nullable=True)
    photo_url: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Reroute(Base):
    __tablename__ = "reroutes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    vehicle_id: Mapped[str] = mapped_column(String(40), index=True)
    status: Mapped[str] = mapped_column(String(30), default="PENDING_APPROVAL")
    route_name: Mapped[str] = mapped_column(String(120))
    reason: Mapped[str] = mapped_column(Text)
    distance_km: Mapped[float] = mapped_column(Float)
    eta_minutes: Mapped[int] = mapped_column(Integer)
    risk_score: Mapped[int] = mapped_column(Integer)
    coordinates: Mapped[list] = mapped_column(JSON)
    approved_by: Mapped[str | None] = mapped_column(String(80), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class DriverEvent(Base):
    __tablename__ = "driver_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    vehicle_id: Mapped[str] = mapped_column(String(40), index=True)
    event_type: Mapped[str] = mapped_column(String(30))
    message: Mapped[str] = mapped_column(Text)
    lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class RiskSnapshot(Base):
    __tablename__ = "risk_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    road_id: Mapped[str] = mapped_column(String(40), index=True)
    risk_score: Mapped[int] = mapped_column(Integer)
    risk_level: Mapped[str] = mapped_column(String(20))
    status: Mapped[str] = mapped_column(String(20))
    confidence: Mapped[float] = mapped_column(Float)
    data_status: Mapped[str] = mapped_column(String(20))
    data_source: Mapped[str] = mapped_column(String(160))
    factors: Mapped[list] = mapped_column(JSON)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
