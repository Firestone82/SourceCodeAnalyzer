from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, and_
from sqlalchemy.orm import Session

from app.api.security import get_current_rater
from app.database.db import get_database
from app.database.models import Issue, Submit, Rater, IssueRating
from app.utils.files import find_source_files_or_extract

router = APIRouter(prefix="/submits", tags=["submits"])


@router.get("/{submit_id}")
def get_submit(submit_id: int, session: Session = Depends(get_database)) -> dict:
    submit: Submit | None = session.get(Submit, submit_id)

    if submit is None:
        raise HTTPException(status_code=404, detail="Submit not found")

    # TODO: Return as data transfer object
    return {
        "id": submit.id,
        "model": submit.model,
        "summary": submit.summary,
        "created_at": submit.created_at,
    }


@router.get("/{submit_id}/details")
def list_files(submit_id: int, session: Session = Depends(get_database)) -> dict:
    submit: Submit | None = session.get(Submit, submit_id)

    if submit is None:
        raise HTTPException(status_code=404, detail="Submit not found")

    files: dict = find_source_files_or_extract(submit.source_path)
    issues = session.execute(select(Issue).where(Issue.submit_id == submit_id)).scalars().all()

    # TODO: Return as data transfer object
    return {
        "files": files,
        "issues": [
            {
                "id": issue.id,
                "file": issue.file,
                "severity": issue.severity,
                "line": issue.line,
                "explanation": issue.explanation,
            }
            for issue in issues
        ],
    }


@router.get("/{submit_id}/issues")
def list_suggestions(
        submit_id: int,
        session: Session = Depends(get_database),
        current_rater: Rater = Depends(get_current_rater),
) -> dict:
    submit: Submit | None = session.get(Submit, submit_id)

    if submit is None:
        raise HTTPException(status_code=404, detail="Submit not found")

    results = session.execute(
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
                IssueRating.rater_id == current_rater.id,
            )
        )
    ).scalar_one_or_none()

    suggestions = []
    for issue, rating in results:
        suggestions.append(
            {
                "id": issue.id,
                "file": issue.file,
                "severity": issue.severity,
                "line": issue.line,
                "explanation": issue.explanation,
                "rating": None if rating is None else rating.rating,
                "rated_at": None if rating is None else rating.created_at,
            }
        )

    # TODO: Return as data transfer object
    return {
        "submit_id": submit_id,
        "rater_id": current_rater.id,
        "summary": {
            "explanation": submit.summary,
            "rating": None if summary_rating is None else summary_rating.rating,
            "rated_at": None if summary_rating is None else summary_rating.created_at,
        },
        "suggestions": suggestions,
    }
