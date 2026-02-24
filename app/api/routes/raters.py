from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dto import AdminRaterResponse, RaterCreateRequest, RaterDeleteResponse, RatersResponse, RaterUpdateRequest
from app.api.security import get_current_rater, require_admin
from app.database.db import get_database
from app.database.models import Rater, RaterLoginEvent, Submit

router = APIRouter(prefix="/raters", tags=["raters"])


@router.get("")
def list_raters(
        current_rater: Rater = Depends(require_admin),
        session: Session = Depends(get_database),
) -> RatersResponse:
    del current_rater

    rows = (
        session.query(Rater, RaterLoginEvent)
        .outerjoin(RaterLoginEvent, RaterLoginEvent.rater_id == Rater.id)
        .order_by(Rater.name.asc())
        .all()
    )
    return RatersResponse(
        items=[
            AdminRaterResponse(
                id=rater.id,
                name=rater.name,
                key=rater.key,
                admin=rater.admin,
                last_login_at=login_event.last_login_at if login_event else None,
            )
            for rater, login_event in rows
        ]
    )


@router.post("")
def create_rater(
        request: RaterCreateRequest,
        current_rater: Rater = Depends(require_admin),
        session: Session = Depends(get_database),
) -> AdminRaterResponse:
    del current_rater

    name = request.name.strip()
    key = request.key.strip()
    if not name or not key:
        raise HTTPException(status_code=400, detail="Name and key are required")

    existing_rater = session.query(Rater).filter(Rater.key == key).one_or_none()
    if existing_rater is not None:
        raise HTTPException(status_code=409, detail="Rater with this key already exists")

    rater = Rater(name=name, key=key, admin=request.admin)
    session.add(rater)
    session.commit()
    session.refresh(rater)

    return AdminRaterResponse(id=rater.id, name=rater.name, key=rater.key, admin=rater.admin, last_login_at=None)


@router.put("/{rater_id}")
def update_rater(
        rater_id: int,
        request: RaterUpdateRequest,
        current_rater: Rater = Depends(require_admin),
        session: Session = Depends(get_database),
) -> AdminRaterResponse:
    rater = session.query(Rater).filter(Rater.id == rater_id).one_or_none()
    if rater is None:
        raise HTTPException(status_code=404, detail="Rater not found")

    name = request.name.strip()
    key = request.key.strip() if request.key is not None else None
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")

    if key:
        existing_rater = session.query(Rater).filter(Rater.key == key, Rater.id != rater_id).one_or_none()
        if existing_rater is not None:
            raise HTTPException(status_code=409, detail="Rater with this key already exists")

    if current_rater.id == rater_id and not request.admin:
        raise HTTPException(status_code=400, detail="You cannot remove admin role from yourself")

    rater.name = name
    if key:
        rater.key = key
    rater.admin = request.admin

    session.add(rater)
    session.commit()
    session.refresh(rater)

    login_event = session.query(RaterLoginEvent).filter(RaterLoginEvent.rater_id == rater.id).one_or_none()
    return AdminRaterResponse(
        id=rater.id,
        name=rater.name,
        key=rater.key,
        admin=rater.admin,
        last_login_at=login_event.last_login_at if login_event else None,
    )


@router.delete("/{rater_id}")
def delete_rater(
        rater_id: int,
        current_rater: Rater = Depends(get_current_rater),
        session: Session = Depends(get_database),
) -> RaterDeleteResponse:
    if not current_rater.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")

    if current_rater.id == rater_id:
        raise HTTPException(status_code=400, detail="You cannot delete yourself")

    rater = session.query(Rater).filter(Rater.id == rater_id).one_or_none()
    if rater is None:
        raise HTTPException(status_code=404, detail="Rater not found")

    has_created_submits = session.query(Submit.id).filter(Submit.created_by_id == rater_id).first() is not None
    if has_created_submits:
        raise HTTPException(status_code=400, detail="Cannot delete rater who created submits")

    session.delete(rater)
    session.commit()

    return RaterDeleteResponse(id=rater_id, deleted=True)
