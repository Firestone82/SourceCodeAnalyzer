import json
import os
from pathlib import Path

from pydantic import BaseModel, Field

class OpenAIServer(BaseModel):
    id: str = Field(min_length=1)
    label: str = Field(min_length=1)
    base_url: str = Field(min_length=1)
    api_key: str = ""
    models: list[str] = Field(default_factory=list)


class OpenAIServerConfig(BaseModel):
    servers: list[OpenAIServer] = Field(default_factory=list)


def default_openai_server_config() -> OpenAIServerConfig:
    return OpenAIServerConfig(
        servers=[
            OpenAIServer(
                id="server-1",
                label="OpenAI server 1",
                base_url="http://localhost:11434/v1",
                api_key="",
                models=["qwen3", "qwen3-coder"],
            )
        ],
    )


def resolve_data_dir(data_dir: Path | None = None) -> Path:
    if data_dir is not None:
        return data_dir.resolve()

    data_dir_raw = os.getenv("DATA_DIR", "data").strip()
    return Path(data_dir_raw).resolve()


def openai_servers_config_path(data_dir: Path | None = None) -> Path:
    return resolve_data_dir(data_dir) / "openai_servers.json"


def ensure_openai_servers_config(data_dir: Path | None = None) -> OpenAIServerConfig:
    path = openai_servers_config_path(data_dir)
    path.parent.mkdir(parents=True, exist_ok=True)

    if not path.exists():
        config = default_openai_server_config()
        path.write_text(config.model_dump_json(indent=2), encoding="utf-8")
        return config

    raw = path.read_text(encoding="utf-8").strip()
    if not raw:
        config = default_openai_server_config()
        path.write_text(config.model_dump_json(indent=2), encoding="utf-8")
        return config

    parsed = OpenAIServerConfig.model_validate(json.loads(raw))
    if not parsed.servers:
        raise ValueError("openai_servers.json must define at least one server")

    return parsed


def get_openai_servers() -> list[OpenAIServer]:
    return ensure_openai_servers_config().servers


def get_default_openai_server_id() -> str:
    config = ensure_openai_servers_config()
    if not config.servers:
        raise ValueError("openai_servers.json must define at least one server")
    return config.servers[0].id


def get_openai_server(server_id: str | None) -> OpenAIServer:
    config = ensure_openai_servers_config()
    target_id = (server_id or "").strip() or config.servers[0].id

    if target_id == "default" and config.servers:
        return config.servers[0]

    for server in config.servers:
        if server.id == target_id:
            return server

    raise ValueError(f"OpenAI server '{target_id}' not found")
