from fastapi import APIRouter, Depends

from app.analyzer.servers import ensure_openai_servers_config
from app.api.dto import OpenAIServerListResponse, OpenAIServerResponse
from app.api.security import get_current_rater
from app.database.models import Rater

router = APIRouter(prefix="/config", tags=["config"])


@router.get("/openai-servers")
def list_openai_servers(current_rater: Rater = Depends(get_current_rater)) -> OpenAIServerListResponse:
    del current_rater
    config = ensure_openai_servers_config()
    return OpenAIServerListResponse(
        servers=[OpenAIServerResponse(id=server.id, label=server.label, models=server.models) for server in config.servers],
    )
