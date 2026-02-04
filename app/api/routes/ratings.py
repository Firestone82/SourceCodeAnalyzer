from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.dto import IssueRatingRequest
from app.api.security import get_current_rater
from app.database.db import get_database
from app.database.models import Issue, IssueRating, Rater, Submit

router = APIRouter(prefix="/ratings", tags=["ratings"])


@router.post("/issues/{issue_id}")
def rate_issue(
        issue_id: int,
        request: IssueRatingRequest,
        session: Session = Depends(get_database),
        current_rater: Rater = Depends(get_current_rater),
) -> dict:
    issue: Issue | None = session.get(Issue, issue_id)

    if issue is None:
        raise HTTPException(status_code=404, detail="Issue not found")

    if request.rating < 1 or request.rating > 10:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 10")

    existing_rating: IssueRating | None = (
        session.query(IssueRating)
        .filter(IssueRating.issue_id == issue_id, IssueRating.rater_id == current_rater.id)
        .one_or_none()
    )

    if existing_rating is None:
        rating = IssueRating(
            issue_id=issue_id,
            submit_id=issue.submit_id,
            rater_id=current_rater.id,
            rating=request.rating,
        )
        session.add(rating)
        session.commit()
        session.refresh(rating)
    else:
        existing_rating.rating = request.rating
        session.commit()
        session.refresh(existing_rating)
        rating = existing_rating

    # TODO: Return as data transfer object
    return {
        "id": rating.id,
        "issue_id": rating.issue_id,
        "submit_id": rating.submit_id,
        "rater_id": rating.rater_id,
        "rating": rating.rating,
        "created_at": rating.created_at,
    }


@router.post("/submits/{submit_id}")
def rate_submit_summary(
        submit_id: int,
        request: IssueRatingRequest,
        session: Session = Depends(get_database),
        current_rater: Rater = Depends(get_current_rater),
) -> dict:
    submit: Submit | None = session.get(Submit, submit_id)

    if submit is None:
        raise HTTPException(status_code=404, detail="Submit not found")

    if request.rating < 1 or request.rating > 10:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 10")

    existing_rating: IssueRating | None = (
        session.query(IssueRating)
        .filter(IssueRating.submit_id == submit_id, IssueRating.rater_id == current_rater.id)
        .one_or_none()
    )

    if existing_rating is None:
        rating = IssueRating(
            submit_id=submit_id,
            issue_id=None,
            rater_id=current_rater.id,
            rating=request.rating,
        )
        session.add(rating)
        session.commit()
        session.refresh(rating)
    else:
        existing_rating.rating = request.rating
        session.commit()
        session.refresh(existing_rating)
        rating = existing_rating

    # TODO: Return as data transfer object
    return {
        "id": rating.id,
        "issue_id": rating.issue_id,
        "submit_id": rating.submit_id,
        "rater_id": rating.rater_id,
        "rating": rating.rating,
        "created_at": rating.created_at,
    }
