from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.db import get_database
from app.database.models import Issue, Submit
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
