import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    app_name: str
    app_env: str
    log_level: str

    data_dir: Path
    database_url: str
    redis_url: str

    analyzer_base_url: str
    analyzer_api_key: str

    @staticmethod
    def load() -> "Settings":
        data_dir_raw: str = os.getenv("DATA_DIR", "data").strip()
        return Settings(
            app_name=os.getenv("APP_NAME", "analyzer-backend").strip(),
            app_env=os.getenv("APP_ENV", "dev").strip(),
            log_level=os.getenv("LOG_LEVEL", "INFO").strip(),

            data_dir=Path(data_dir_raw).resolve(),
            database_url=os.getenv("DATABASE_URL", "sqlite:///./dev.db").strip(),
            redis_url=os.getenv("REDIS_URL", "redis://localhost:6379/0").strip(),

            analyzer_base_url=os.getenv("ANALYZER_BASE_URL", "").strip(),
            analyzer_api_key=os.getenv("ANALYZER_API_KEY", "").strip(),
        )


settings: Settings = Settings.load()
