import os
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        extra="ignore",
    )

    app_name: str = "SAFI KARGO"
    database_url: str = f"sqlite:///{(BASE_DIR / 'data' / 'safi.db').as_posix()}"
    jwt_secret: str = "dev-only-change-me"
    jwt_days: int = 7
    admin_phone: str = "+992000000000"
    admin_password: str = "ChangeMe_Admin_2026"
    admin_first_name: str = "Super"
    admin_last_name: str = "Admin"
    sms_webhook_url: str = ""
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_publishable_key: str = ""
    dev_otp_reveal: bool = False
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    company_tz: str = "Asia/Dushanbe"
    storage_dir: str = str(BASE_DIR / "storage")
    rate_limit_enabled: bool = True

    @property
    def cors_list(self) -> list[str]:
        origins = [item.strip() for item in self.cors_origins.split(",") if item.strip()]
        frontend = os.environ.get("FRONTEND_URL", "").strip().rstrip("/")
        if frontend and frontend not in origins:
            origins.append(frontend)
        return origins

    @property
    def on_vercel(self) -> bool:
        return os.environ.get("VERCEL") == "1"

    @property
    def reveal_otp(self) -> bool:
        if self.on_vercel:
            return False
        return self.dev_otp_reveal

    @property
    def storage_backend(self) -> str:
        forced = os.environ.get("STORAGE_BACKEND", "").strip().lower()
        if forced in {"disk", "database"}:
            return forced
        return "database" if self.on_vercel else "disk"


settings = Settings()
