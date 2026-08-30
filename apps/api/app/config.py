from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "NER Smart Logistics API"
    database_url: str = "sqlite:///./smart_logistics.db"
    cors_origins: str = "http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000,http://127.0.0.1:3001"
    simulation_interval_seconds: float = 2.0
    gps_simulation_enabled: bool = False
    live_data_enabled: bool = True
    risk_refresh_seconds: float = 10.0
    risk_snapshot_retention_hours: int = 24
    live_data_timeout_seconds: float = 12.0
    jwt_secret: str = "change-this-secret-before-deployment"
    jwt_expire_minutes: int = 720
    upload_dir: str = "uploads"
    demo_admin_password: str = "admin123"
    demo_driver_password: str = "driver123"
    demo_field_password: str = "field123"
    frontend_dir: str = ""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]


@lru_cache
def get_settings() -> Settings:
    return Settings()
