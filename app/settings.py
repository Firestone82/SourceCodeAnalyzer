import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv
from app.analyzer.servers import ensure_openai_servers_config

load_dotenv()


@dataclass(frozen=True)
class Settings:
    app_name: str
    app_env: str
    log_level: str

    data_dir: Path
    database_url: str
    redis_url: str

    cors_origins: list[str]

    critiquer_model: str | None
    critiquer_openai_server: str | None

    @staticmethod
    def load() -> "Settings":
        data_dir_raw: str = os.getenv("DATA_DIR", "data").strip()
        data_dir: Path = Path(data_dir_raw).resolve()
        cors_origins_raw: str = os.getenv(
            "CORS_ORIGINS",
            "http://localhost:4200,http://127.0.0.1:4200",
        ).strip()
        cors_origins: list[str] = [
            origin.strip() for origin in cors_origins_raw.split(",") if origin.strip()
        ]
        # Ensure OpenAI server config exists at startup so operators can edit defaults.
        ensure_openai_servers_config(data_dir)

        critiquer_model_raw: str = os.getenv("CRITIQUER_MODEL", "").strip()
        critiquer_openai_server_raw: str = os.getenv("CRITIQUER_OPENAI_SERVER", "").strip()

        return Settings(
            app_name=os.getenv("APP_NAME", "analyzer-backend").strip(),
            app_env=os.getenv("APP_ENV", "dev").strip(),
            log_level=os.getenv("LOG_LEVEL", "INFO").strip(),

            data_dir=data_dir,
            database_url=os.getenv("DATABASE_URL", "sqlite:///./dev.db").strip(),
            redis_url=os.getenv("REDIS_URL", "redis://localhost:6379/0").strip(),
            cors_origins=cors_origins,
            critiquer_model=critiquer_model_raw or None,
            critiquer_openai_server=critiquer_openai_server_raw or None,
        )


settings: Settings = Settings.load()
