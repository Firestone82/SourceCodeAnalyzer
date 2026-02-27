from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.dto import IssueRatingRequest, RatingResponse, SubmitRatingRequest
from app.api.security import get_current_rater
from app.database.db import get_database
from app.database.models import Issue, IssueRating, Rater, Submit, SubmitRating

router = APIRouter(prefix="/ratings", tags=["ratings"])


def validate_rating_value(value: int | None, label: str) -> None:
    if value is None:
        return

    if value < 1 or value > 10:
        raise HTTPException(status_code=400, detail=f"{label} must be between 1 and 10")


def upsert_issue_rating(
        session: Session,
        *,
        rater_id: int,
        issue_id: int | None,
        relevance_rating: int | None,
        quality_rating: int | None,
        comment: str | None,
) -> IssueRating:
    existing_rating: IssueRating | None = (
        session.query(IssueRating)
        .filter(
            IssueRating.rater_id == rater_id,
            IssueRating.issue_id == issue_id,
        )
        .one_or_none()
    )

    if existing_rating is None:
        rating: IssueRating = IssueRating(
            issue_id=issue_id,
            rater_id=rater_id,
            relevance_rating=relevance_rating,
            quality_rating=quality_rating,
            comment=comment,
        )
        session.add(rating)
        session.commit()
        session.refresh(rating)
        return rating

    existing_rating.relevance_rating = relevance_rating
    existing_rating.quality_rating = quality_rating
    existing_rating.comment = comment
    session.commit()
    session.refresh(existing_rating)
    return existing_rating


@router.post("/issues/{issue_id}")
def rate_issue(
        issue_id: int,
        request: IssueRatingRequest,
        session: Session = Depends(get_database),
        current_rater: Rater = Depends(get_current_rater),
) -> RatingResponse:
    issue: Issue | None = session.get(Issue, issue_id)
    if issue is None:
        raise HTTPException(status_code=404, detail="Issue not found")

    submit: Submit | None = session.get(Submit, issue.submit_id)
    if submit is None:
        raise HTTPException(status_code=404, detail="Submit not found")

    if not submit.published and not current_rater.admin and submit.created_by_id != current_rater.id:
        raise HTTPException(status_code=403, detail="Submit not available for rating")

    validate_rating_value(request.relevance_rating, "Relevance rating")
    validate_rating_value(request.quality_rating, "Quality rating")

    comment: str | None = request.comment.strip() if request.comment is not None else None
    if comment == "":
        comment = None

    rating: IssueRating = upsert_issue_rating(
        session,
        rater_id=current_rater.id,
        relevance_rating=request.relevance_rating,
        quality_rating=request.quality_rating,
        comment=comment,
        issue_id=issue_id,
    )

    return RatingResponse(
        id=rating.id,
        issue_id=rating.issue_id,
        rater_id=rating.rater_id,
        relevance_rating=rating.relevance_rating,
        quality_rating=rating.quality_rating,
        created_at=rating.created_at,
    )


@router.post("/submits/{submit_id}")
def rate_submit_summary(
        submit_id: int,
        request: SubmitRatingRequest,
        session: Session = Depends(get_database),
        current_rater: Rater = Depends(get_current_rater),
) -> RatingResponse:
    submit: Submit | None = session.get(Submit, submit_id)
    if submit is None:
        raise HTTPException(status_code=404, detail="Submit not found")

    if not submit.published and not current_rater.admin and submit.created_by_id != current_rater.id:
        raise HTTPException(status_code=403, detail="Submit not available for rating")

    validate_rating_value(request.relevance_rating, "Relevance rating")
    validate_rating_value(request.quality_rating, "Quality rating")

    comment: str | None = request.comment.strip() if request.comment is not None else None
    if comment == "":
        comment = None

    existing_rating: SubmitRating | None = (
        session.query(SubmitRating)
        .filter(
            SubmitRating.rater_id == current_rater.id,
            SubmitRating.submit_id == submit_id,
        )
        .one_or_none()
    )

    if existing_rating is None:
        summary_rating = SubmitRating(
            submit_id=submit_id,
            rater_id=current_rater.id,
            relevance_rating=request.relevance_rating,
            quality_rating=request.quality_rating,
            comment=comment,
        )
        session.add(summary_rating)
        session.commit()
        session.refresh(summary_rating)
    else:
        existing_rating.relevance_rating = request.relevance_rating
        existing_rating.quality_rating = request.quality_rating
        existing_rating.comment = comment
        session.commit()
        session.refresh(existing_rating)
        summary_rating = existing_rating

    return RatingResponse(
        id=summary_rating.id,
        issue_id=None,
        rater_id=summary_rating.rater_id,
        relevance_rating=summary_rating.relevance_rating,
        quality_rating=summary_rating.quality_rating,
        created_at=summary_rating.created_at,
    )
