from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, and_
from sqlalchemy.orm import Session

from app.api.dto import (
    SubmitDetailsIssue,
    SubmitDetailsResponse,
    SubmitResponse,
    SubmitSuggestionsItem,
    SubmitSuggestionsResponse, SubmitSuggestionsSummary,
)
from app.api.security import get_current_rater
from app.database.db import get_database
from app.database.models import Issue, Submit, Rater, IssueRating
from app.utils.files import find_source_files_or_extract

router = APIRouter(prefix="/submits", tags=["submits"])


@router.get("/{submit_id}")
def get_submit(submit_id: int, session: Session = Depends(get_database)) -> SubmitResponse:
    submit: Submit | None = session.get(Submit, submit_id)

    if submit is None:
        raise HTTPException(status_code=404, detail="Submit not found")

    return SubmitResponse(
        id=submit.id,
        model=submit.model,
        summary=submit.summary,
        created_at=submit.created_at,
    )


@router.get("/{submit_id}/details")
def list_files(submit_id: int, session: Session = Depends(get_database)) -> SubmitDetailsResponse:
    submit: Submit | None = session.get(Submit, submit_id)

    if submit is None:
        raise HTTPException(status_code=404, detail="Submit not found")

    files: dict = find_source_files_or_extract(submit.source_path)
    issues = session.execute(select(Issue).where(Issue.submit_id == submit_id)).scalars().all()

    return SubmitDetailsResponse(
        files=files,
        issues=[
            SubmitDetailsIssue(
                id=issue.id,
                file=issue.file,
                severity=issue.severity,
                line=issue.line,
                explanation=issue.explanation,
            )
            for issue in issues
        ],
    )


@router.get("/{submit_id}/issues")
def list_suggestions(
        submit_id: int,
        session: Session = Depends(get_database),
        current_rater: Rater = Depends(get_current_rater),
) -> SubmitSuggestionsResponse:
    submit: Submit | None = session.get(Submit, submit_id)

    if submit is None:
        raise HTTPException(status_code=404, detail="Submit not found")

    issues_rating = session.execute(
        select(Issue, IssueRating)
        .outerjoin(
            IssueRating,
            and_(IssueRating.issue_id == Issue.id, IssueRating.rater_id == current_rater.id),
        )
        .where(Issue.submit_id == submit_id)
    ).all()

    summary_rating = session.execute(
        select(IssueRating)
        .where(
            and_(
                IssueRating.submit_id == submit_id,
                IssueRating.issue_id == None,
                IssueRating.rater_id == current_rater.id,
            )
        )
    ).scalar_one_or_none()

    suggestions = []
    for issue, rating in issues_rating:
        suggestions.append(SubmitSuggestionsItem(
            id=issue.id,
            file=issue.file,
            severity=issue.severity,
            line=issue.line,
            explanation=issue.explanation,
            rating=None if rating is None else rating.rating,
            rated_at=None if rating is None else rating.created_at,
        ))

    summary = SubmitSuggestionsSummary(
        explanation=submit.summary,
        rating=None if summary_rating is None else summary_rating.rating,
        rated_at=None if summary_rating is None else summary_rating.created_at,
    )

    return SubmitSuggestionsResponse(
        submit_id=submit_id,
        rater_id=current_rater.id,
        summary=summary,
        suggestions=suggestions,
    )
