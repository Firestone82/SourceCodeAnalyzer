from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database.db import get_database
from app.utils.files import extract_zip_safely
from app.database.models import Issue, Submit

router = APIRouter(prefix="/submits", tags=["submits"])


@router.get("/{submit_id}")
def get_submit(submit_id: int, session: Session = Depends(get_database)) -> dict:
    submit: Submit | None = session.get(Submit, submit_id)

    if submit is None:
        raise HTTPException(status_code=404, detail="Submit not found")

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

    root_path: Path = Path("data/sources").resolve()
    submit_source_root: Path = (root_path / submit.source_path).resolve()
    extracted_source_root: Path = submit_source_root / "extracted"

    if not extracted_source_root.exists():
        zip_path: Path = submit_source_root / "src.zip"

        if not zip_path.exists():
            raise HTTPException(status_code=500, detail="Submit source zip not found")

        extract_zip_safely(zip_path, extracted_source_root)

    files: dict[Path, str] = {}
    for path in extracted_source_root.rglob("*"):
        if path.is_file():
            relative_path: Path = path.relative_to(extracted_source_root)
            files[relative_path] = path.read_text(encoding="utf-8", errors="replace")

    issues = [
        {
            "id": issue.id,
            "file": issue.file,
            "severity": issue.severity,
            "line": issue.line,
            "explanation": issue.explanation,
        }
        for issue in session.execute(select(Issue).where(Issue.submit_id == submit_id)).scalars().all()
    ]

    return {
        "files": files,
        "issues": issues,
    }