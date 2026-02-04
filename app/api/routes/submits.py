import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select, and_
from sqlalchemy.orm import Session

from app.analyzer.analyze_job import run_submit_analysis
from app.api.dto import SubmitResponse, SubmitDetailsResponse, SubmitDetailsIssue, SubmitSuggestionsResponse, \
    SubmitSuggestionsSummary, SubmitSuggestionsItem, AnalyzeSourceResponse
from app.api.security import get_current_rater
from app.database.db import get_database
from app.database.models import Issue, Submit, Rater, IssueRating
from app.database.rq_queue import get_analysis_queue
from app.utils.files import (
    PROMPTS_ROOT,
    SOURCES_ROOT,
    find_source_files_or_extract,
    safe_join,
)

router = APIRouter(prefix="/submits", tags=["submits"])


def normalize_upload_name(name: str | None, fallback: str, label: str) -> str:
    candidate = (name or fallback).strip()

    if not candidate:
        raise HTTPException(status_code=400, detail=f"{label} is required")

    if Path(candidate).name != candidate or "/" in candidate or "\\" in candidate:
        raise HTTPException(status_code=400, detail=f"Invalid {label}")

    return candidate


def store_uploaded_source(source_file: UploadFile, source_name: str | None) -> str:
    filename = source_file.filename or ""

    if not filename.lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="Source upload must be a .zip file")

    fallback_name = Path(filename).stem
    normalized_name = normalize_upload_name(source_name, fallback_name, "source_name")

    upload_root = safe_join(SOURCES_ROOT, "upload")
    target_dir = safe_join(upload_root, normalized_name)
    target_dir.mkdir(parents=True, exist_ok=True)
    zip_path = target_dir / "src.zip"

    with zip_path.open("wb") as output_handle:
        shutil.copyfileobj(source_file.file, output_handle)

    return (Path("upload") / normalized_name).as_posix()


def store_uploaded_prompt(prompt_file: UploadFile, prompt_name: str | None) -> str:
    filename = prompt_file.filename or ""
    fallback_name = Path(filename).stem
    normalized_name = normalize_upload_name(prompt_name, fallback_name, "prompt_name")

    upload_root = safe_join(PROMPTS_ROOT, "upload")
    upload_root.mkdir(parents=True, exist_ok=True)
    prompt_path = safe_join(upload_root, f"{normalized_name}.txt")

    with prompt_path.open("wb") as output_handle:
        shutil.copyfileobj(prompt_file.file, output_handle)

    return f"upload/{normalized_name}"


@router.post("/upload")
def upload_submit(
        model: str = Form(...),
        source_name: str | None = Form(None),
        source_file: UploadFile = File(...),
        prompt_name: str | None = Form(None),
        prompt_file: UploadFile | None = File(None),
) -> AnalyzeSourceResponse:
    if not model.strip():
        raise HTTPException(status_code=400, detail="Model is required")

    analysis_queue = get_analysis_queue()
    stored_source_path = store_uploaded_source(source_file, source_name)

    if prompt_file is not None:
        stored_prompt_name = store_uploaded_prompt(prompt_file, prompt_name)
    else:
        if prompt_name is None or not prompt_name.strip():
            raise HTTPException(status_code=400, detail="Prompt name is required")

        stored_prompt_name = prompt_name.strip()

    job = analysis_queue.enqueue(
        run_submit_analysis,
        stored_source_path,
        stored_prompt_name,
        model.strip(),
        job_timeout=1800,
    )

    return AnalyzeSourceResponse(
        ok=True,
        job_id=job.id,
        source_path=stored_source_path,
        prompt_name=stored_prompt_name,
        model=model.strip(),
    )


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
