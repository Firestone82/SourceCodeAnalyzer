from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.database.db import get_database
from app.database.models import Rater


def get_current_rater(
        x_api_key: str | None = Header(default=None, alias="X-API-Key"),
        session: Session = Depends(get_database),
) -> Rater:
    if x_api_key is None or len(x_api_key.strip()) == 0:
        raise HTTPException(status_code=401, detail="Missing X-API-Key")

    key_hash: str = x_api_key.strip()
    rater: Rater | None = session.query(Rater).filter(Rater.key == key_hash).one_or_none()

    if rater is None:
        raise HTTPException(status_code=401, detail="Invalid API key")

    return rater


def require_admin(current_rater: Rater = Depends(get_current_rater)) -> Rater:
    if not current_rater.admin:
        raise HTTPException(status_code=403, detail="Admin only")

    return current_rater
