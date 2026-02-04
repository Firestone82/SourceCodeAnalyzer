from fastapi import Header, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.db import get_database
from app.database.models import Rater


def get_current_rater(
        authorization: str | None = Header(default=None, alias="Authorization"),
        session: Session = Depends(get_database),
) -> Rater:
    if authorization is None or len(authorization.strip()) == 0:
        raise HTTPException(status_code=401, detail="Missing Authorization header")

    authorization_value: str = authorization.strip()

    if not authorization_value.lower().startswith("x-api-key "):
        raise HTTPException(status_code=401, detail="Invalid Authorization scheme")

    api_key: str = authorization_value[10:].strip()

    if len(api_key) == 0:
        raise HTTPException(status_code=401, detail="Missing API key")

    rater: Rater | None = (
        session
        .query(Rater)
        .filter(Rater.key == api_key)
        .one_or_none()
    )

    if rater is None:
        raise HTTPException(status_code=401, detail="Invalid API key")

    return rater


def require_admin(current_rater: Rater = Depends(get_current_rater)) -> Rater:
    if not current_rater.admin:
        raise HTTPException(status_code=403, detail="Admin only")

    return current_rater
