from fastapi import Header, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database.db import get_database
from app.database.models import Rater


def get_current_rater(
        authorization_header: str | None = Header(default=None, alias="Authorization"),
        api_key_query: str | None = Query(default=None, alias="api_key"),
        session: Session = Depends(get_database),
) -> Rater:
    api_key_value: str | None = None

    if api_key_query is not None and len(api_key_query.strip()) > 0:
        api_key_value = api_key_query.strip()
    elif authorization_header is not None and len(authorization_header.strip()) > 0:
        authorization_value: str = authorization_header.strip()

        if not authorization_value.lower().startswith("x-api-key "):
            raise HTTPException(
                status_code=401,
                detail="Invalid Authorization scheme",
            )

        api_key_value = authorization_value[10:].strip()

    if api_key_value is None or len(api_key_value) == 0:
        raise HTTPException(
            status_code=401,
            detail="Missing API key",
        )

    rater: Rater | None = (
        session
        .query(Rater)
        .filter(Rater.key == api_key_value)
        .one_or_none()
    )

    if rater is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid API key",
        )

    return rater


def require_admin(current_rater: Rater = Depends(get_current_rater)) -> Rater:
    if not current_rater.admin:
        raise HTTPException(status_code=403, detail="Admin only")

    return current_rater
