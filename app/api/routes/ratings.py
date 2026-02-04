from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.dto import IssueRatingRequest, SubmitRatingResponse, IssueRatingResponse
from app.api.security import get_current_rater
from app.database.db import get_database
from app.database.models import Issue, IssueRating, Rater, Submit

router = APIRouter(prefix="/ratings", tags=["ratings"])


def validate_rating_value(request: IssueRatingRequest) -> None:
    if request.rating < 1 or request.rating > 10:
        raise HTTPException(status_code=400, detail="Rating must be between 1 and 10")


def upsert_issue_rating(
        session: Session,
        *,
        rater_id: int,
        rating_value: int,
        issue_id: int | None,
        submit_id: int | None,
) -> IssueRating:
    existing_rating: IssueRating | None = (
        session.query(IssueRating)
        .filter(
            IssueRating.rater_id == rater_id,
            IssueRating.issue_id == issue_id,
            IssueRating.submit_id == submit_id,
        )
        .one_or_none()
    )

    if existing_rating is None:
        rating: IssueRating = IssueRating(
            issue_id=issue_id,
            submit_id=submit_id,
            rater_id=rater_id,
            rating=rating_value,
        )
        session.add(rating)
        session.commit()
        session.refresh(rating)
        return rating

    existing_rating.rating = rating_value
    session.commit()
    session.refresh(existing_rating)
    return existing_rating


@router.post("/issues/{issue_id}")
def rate_issue(
        issue_id: int,
        request: IssueRatingRequest,
        session: Session = Depends(get_database),
        current_rater: Rater = Depends(get_current_rater),
) -> IssueRatingResponse:
    issue: Issue | None = session.get(Issue, issue_id)
    if issue is None:
        raise HTTPException(status_code=404, detail="Issue not found")

    validate_rating_value(request)

    rating: IssueRating = upsert_issue_rating(
        session,
        rater_id=current_rater.id,
        rating_value=request.rating,
        issue_id=issue_id,
        submit_id=None,
    )

    return IssueRatingResponse(
        id=rating.id,
        issue_id=rating.issue_id,
        rater_id=rating.rater_id,
        rating=rating.rating,
        created_at=rating.created_at,
    )


@router.post("/submits/{submit_id}")
def rate_submit_summary(
        submit_id: int,
        request: IssueRatingRequest,
        session: Session = Depends(get_database),
        current_rater: Rater = Depends(get_current_rater),
) -> SubmitRatingResponse:
    submit: Submit | None = session.get(Submit, submit_id)
    if submit is None:
        raise HTTPException(status_code=404, detail="Submit not found")

    validate_rating_value(request)

    rating: IssueRating = upsert_issue_rating(
        session,
        rater_id=current_rater.id,
        rating_value=request.rating,
        issue_id=None,
        submit_id=submit_id,
    )

    return SubmitRatingResponse(
        id=rating.id,
        submit_id=rating.submit_id,
        rater_id=rating.rater_id,
        rating=rating.rating,
        created_at=rating.created_at,
    )
