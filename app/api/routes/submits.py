import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select, and_, func, case, Select
from sqlalchemy.orm import Session

from app.analyzer.analyze_job import run_submit_analysis
from app.api.dto import SubmitResponse, SubmitSummary, SubmitIssue, AnalyzeSourceResponse, SubmitIssuesResponse
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


def store_uploaded_prompt(prompt_file: UploadFile, prompt_path: str | None) -> str:
    filename = prompt_file.filename or ""
    fallback_name = Path(filename).stem
    normalized_name = normalize_upload_name(prompt_path, fallback_name, "prompt_path")

    upload_root = safe_join(PROMPTS_ROOT, "upload")
    upload_root.mkdir(parents=True, exist_ok=True)
    prompt_path = safe_join(upload_root, f"{normalized_name}.txt")

    with prompt_path.open("wb") as output_handle:
        shutil.copyfileobj(prompt_file.file, output_handle)

    return f"upload/{normalized_name}"


@router.post("/upload")
def upload_submit(
        model: str = Form(...),
        source_path: str | None = Form(None),
        source_file: UploadFile = File(...),
        prompt_path: str | None = Form(None),
        prompt_file: UploadFile | None = File(None),
) -> AnalyzeSourceResponse:
    if not model.strip():
        raise HTTPException(status_code=400, detail="Model is required")

    analysis_queue = get_analysis_queue()
    stored_source_path = store_uploaded_source(source_file, source_path)

    if prompt_file is not None:
        stored_prompt_path = store_uploaded_prompt(prompt_file, prompt_path)
    else:
        if prompt_path is None or not prompt_path.strip():
            raise HTTPException(status_code=400, detail="Prompt name is required")

        stored_prompt_path = prompt_path.strip()

    job = analysis_queue.enqueue(
        run_submit_analysis,
        stored_source_path,
        stored_prompt_path,
        model.strip(),
        job_timeout=1800,
    )

    return AnalyzeSourceResponse(
        ok=True,
        job_id=job.id,
        source_path=stored_source_path,
        prompt_path=stored_prompt_path,
        model=model.strip(),
    )


@router.get("")
def get_submits(
        session: Session = Depends(get_database),
        current_rater: Rater = Depends(get_current_rater),
) -> list[SubmitResponse]:
    # total issues per submit
    total_issues_subquery = (
        select(
            Issue.submit_id.label("submit_id"),
            func.count(Issue.id).label("total_issues"),
        )
        .group_by(Issue.submit_id)
        .subquery()
    )

    # issues rated by this rater per submit
    rated_issues_subquery = (
        select(
            Issue.submit_id.label("submit_id"),
            func.count(func.distinct(IssueRating.issue_id)).label("rated_issues"),
        )
        .join(Issue, Issue.id == IssueRating.issue_id)
        .where(IssueRating.rater_id == current_rater.id)
        .where(IssueRating.issue_id.is_not(None))
        .group_by(Issue.submit_id)
        .subquery()
    )

    total_issues_column = func.coalesce(total_issues_subquery.c.total_issues, 0)
    rated_issues_column = func.coalesce(rated_issues_subquery.c.rated_issues, 0)

    # if there are 0 issues, treat as fully rated (nothing to do)
    is_fully_rated_column = case(
        (total_issues_column == 0, True),
        (rated_issues_column >= total_issues_column, True),
        else_=False,
    ).label("is_fully_rated")

    statement: Select = (
        select(
            Submit,
            total_issues_column.label("total_issues"),
            rated_issues_column.label("rated_issues"),
            is_fully_rated_column,
        )
        .outerjoin(total_issues_subquery, total_issues_subquery.c.submit_id == Submit.id)
        .outerjoin(rated_issues_subquery, rated_issues_subquery.c.submit_id == Submit.id)
        .order_by(Submit.created_at.desc())
    )

    rows = session.execute(statement).all()

    submits: list[SubmitResponse] = []
    for submit, total_issues, rated_issues, is_fully_rated in rows:
        # WARNING: this can be expensive for lists (filesystem work per submit)
        files: dict = find_source_files_or_extract(submit.source_path)

        submits.append(
            SubmitResponse(
                id=submit.id,
                model=submit.model,
                source_path=submit.source_path,
                prompt_path=submit.prompt_path,
                files=files,
                created_at=submit.created_at,
                rated=is_fully_rated,
            )
        )

    return submits


@router.get("/{submit_id}")
def get_submit(
        submit_id: int,
        session: Session = Depends(get_database),
        current_rater: Rater = Depends(get_current_rater),
) -> SubmitResponse:
    total_issues_subquery = (
        select(func.count(Issue.id))
        .where(Issue.submit_id == submit_id)
        .scalar_subquery()
    )

    rated_issues_subquery = (
        select(func.count(func.distinct(IssueRating.issue_id)))
        .join(Issue, Issue.id == IssueRating.issue_id)
        .where(Issue.submit_id == submit_id)
        .where(IssueRating.rater_id == current_rater.id)
        .where(IssueRating.issue_id.is_not(None))
        .scalar_subquery()
    )

    total_issues_column = func.coalesce(total_issues_subquery, 0)
    rated_issues_column = func.coalesce(rated_issues_subquery, 0)

    is_fully_rated_column = case(
        (total_issues_column == 0, True),
        (rated_issues_column >= total_issues_column, True),
        else_=False,
    ).label("is_fully_rated")

    statement: Select = (
        select(Submit, is_fully_rated_column)
        .where(Submit.id == submit_id)
    )

    row = session.execute(statement).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Submit not found")

    submit: Submit = row[0]
    is_fully_rated: bool = row[1]

    files: dict = find_source_files_or_extract(submit.source_path)

    return SubmitResponse(
        id=submit.id,
        model=submit.model,
        source_path=submit.source_path,
        prompt_path=submit.prompt_path,
        files=files,
        created_at=submit.created_at,
        rated=is_fully_rated,
    )


@router.get("/{submit_id}/details")
def get_submit_details(
        submit_id: int,
        session: Session = Depends(get_database),
        current_rater: Rater = Depends(get_current_rater),
) -> SubmitIssuesResponse:
    submit: Submit | None = session.get(Submit, submit_id)

    if submit is None:
        raise HTTPException(status_code=404, detail="Submit not found")

    rater_issues = session.execute(
        select(Issue, IssueRating)
        .outerjoin(
            IssueRating,
            and_(IssueRating.issue_id == Issue.id, IssueRating.rater_id == current_rater.id),
        )
        .where(Issue.submit_id == submit_id)
    ).all()

    issues = []
    summary = SubmitSummary(
        explanation="Failed to load summary rating",
        rating=None,
        rated_at=None,
    )

    for issue, rating in rater_issues:
        rating = None if rating is None else rating.rating
        rated_at = None if rating is None else rating.created_at

        if issue.file is None and issue.line is None:
            summary = SubmitSummary(
                explanation=issue.explanation,
                rating=rating,
                rated_at=rated_at,
            )
        else:
            issues.append(SubmitIssue(
                id=issue.id,
                file=issue.file,
                severity=issue.severity,
                line=issue.line,
                explanation=issue.explanation,
                rating=None if rating is None else rating.rating,
                rated_at=None if rating is None else rating.created_at,
            ))

    return SubmitIssuesResponse(
        submit_id=submit_id,
        rater_id=current_rater.id,
        summary=summary,
        issues=issues,
    )
