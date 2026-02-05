from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.dto import LoginRequest, RaterResponse
from app.api.security import get_current_rater
from app.database.db import get_database
from app.database.models import Rater

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login")
def login(
        request: LoginRequest,
        session: Session = Depends(get_database),
) -> RaterResponse:
    key = request.key.strip()

    if not key:
        raise HTTPException(status_code=400, detail="API key is required")

    rater: Rater | None = session.query(Rater).filter(Rater.key == key).one_or_none()
    if rater is None:
        raise HTTPException(status_code=401, detail="Invalid API key")

    return RaterResponse(id=rater.id, name=rater.name, admin=rater.admin)


@router.get("/me")
def get_me(current_rater: Rater = Depends(get_current_rater)) -> RaterResponse:
    return RaterResponse(id=current_rater.id, name=current_rater.name, admin=current_rater.admin)
