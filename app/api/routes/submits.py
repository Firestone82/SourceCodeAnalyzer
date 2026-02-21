import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import select, and_, func, case, Select, or_
from sqlalchemy.orm import Session

from app.analyzer.analyze_job import run_submit_analysis
from app.api.dto import (
    SubmitResponse,
    SubmitSummary,
    SubmitIssue,
    AnalyzeSourceResponse,
    SubmitIssuesResponse,
    SubmitListResponse,
    SubmitListItemResponse,
    SubmitPublishRequest,
    SubmitPublishResponse,
    SubmitDeleteResponse,
)
from app.api.security import get_current_rater, require_admin
from app.database.db import get_database
from app.database.models import Issue, Submit, Rater, IssueRating, AnalysisJob, SourceTag
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
        session: Session = Depends(get_database),
        current_rater: Rater = Depends(get_current_rater),
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
        current_rater.id,
        False,
        job_timeout=1800,
    )

    session.add(AnalysisJob(
        job_id=job.id,
        status="running",
        job_type="submit_upload",
        source_path=stored_source_path,
        prompt_path=stored_prompt_path,
        model=model.strip(),
    ))
    session.commit()

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
        page: int = Query(1, ge=1),
        page_size: int = Query(20, ge=1, le=100),
        only_unrated: bool = Query(False),
        model: str | None = Query(None),
        source_path: str | None = Query(None),
        prompt_path: str | None = Query(None),
        source_tag: str | None = Query(None),
) -> SubmitListResponse:
    total_issues_subquery = (
        select(
            Issue.submit_id.label("submit_id"),
            func.count(Issue.id).label("total_issues"),
        )
        .group_by(Issue.submit_id)
        .subquery()
    )

    started_issues_subquery = (
        select(
            Issue.submit_id.label("submit_id"),
            func.count(func.distinct(IssueRating.issue_id)).label("started_issues"),
        )
        .join(Issue, Issue.id == IssueRating.issue_id)
        .where(IssueRating.rater_id == current_rater.id)
        .where(IssueRating.issue_id.is_not(None))
        .where(or_(IssueRating.relevance_rating.is_not(None), IssueRating.quality_rating.is_not(None)))
        .group_by(Issue.submit_id)
        .subquery()
    )

    fully_rated_issues_subquery = (
        select(
            Issue.submit_id.label("submit_id"),
            func.count(func.distinct(IssueRating.issue_id)).label("fully_rated_issues"),
        )
        .join(Issue, Issue.id == IssueRating.issue_id)
        .where(IssueRating.rater_id == current_rater.id)
        .where(IssueRating.issue_id.is_not(None))
        .where(IssueRating.relevance_rating.is_not(None))
        .where(IssueRating.quality_rating.is_not(None))
        .group_by(Issue.submit_id)
        .subquery()
    )

    total_issues_column = func.coalesce(total_issues_subquery.c.total_issues, 0)
    started_issues_column = func.coalesce(started_issues_subquery.c.started_issues, 0)
    fully_rated_issues_column = func.coalesce(fully_rated_issues_subquery.c.fully_rated_issues, 0)

    rating_state_column = case(
        (total_issues_column == 0, "rated"),
        (fully_rated_issues_column >= total_issues_column, "rated"),
        (started_issues_column > 0, "partially_rated"),
        else_="not_rated",
    ).label("rating_state")

    statement: Select = (
        select(
            Submit,
            total_issues_column.label("total_issues"),
            rating_state_column,
            SourceTag.tag.label("source_tag"),
        )
        .outerjoin(total_issues_subquery, total_issues_subquery.c.submit_id == Submit.id)
        .outerjoin(started_issues_subquery, started_issues_subquery.c.submit_id == Submit.id)
        .outerjoin(fully_rated_issues_subquery, fully_rated_issues_subquery.c.submit_id == Submit.id)
        .outerjoin(SourceTag, SourceTag.source_path == Submit.source_path)
    )

    if not current_rater.admin:
        statement = statement.where(or_(Submit.published.is_(True), Submit.created_by_id == current_rater.id))

    if model is not None and model.strip():
        statement = statement.where(Submit.model.ilike(f"%{model.strip()}%"))

    if source_path is not None and source_path.strip():
        statement = statement.where(Submit.source_path.ilike(f"%{source_path.strip()}%"))

    if prompt_path is not None and prompt_path.strip():
        statement = statement.where(Submit.prompt_path.ilike(f"%{prompt_path.strip()}%"))

    if source_tag is not None and source_tag.strip():
        statement = statement.where(SourceTag.tag == source_tag.strip())

    if only_unrated:
        statement = statement.where(rating_state_column != "rated")

    total_count = session.execute(select(func.count()).select_from(statement.order_by(None).subquery())).scalar_one()

    offset = (page - 1) * page_size
    rows = session.execute(statement.order_by(Submit.created_at.desc()).limit(page_size).offset(offset)).all()

    submits: list[SubmitListItemResponse] = []
    for submit, total_issues, rating_state, source_tag in rows:
        submits.append(
            SubmitListItemResponse(
                id=submit.id,
                model=submit.model,
                source_path=submit.source_path,
                prompt_path=submit.prompt_path,
                source_tag=source_tag,
                created_at=submit.created_at,
                rating_state=rating_state,
                total_issues=total_issues,
                published=submit.published,
            )
        )

    return SubmitListResponse(items=submits, total=total_count, page=page, page_size=page_size)


@router.get("/{submit_id}")
def get_submit(
        submit_id: int,
        session: Session = Depends(get_database),
        current_rater: Rater = Depends(get_current_rater),
) -> SubmitResponse:
    total_issues_subquery = select(func.count(Issue.id)).where(Issue.submit_id == submit_id).scalar_subquery()

    started_issues_subquery = (
        select(func.count(func.distinct(IssueRating.issue_id)))
        .join(Issue, Issue.id == IssueRating.issue_id)
        .where(Issue.submit_id == submit_id)
        .where(IssueRating.rater_id == current_rater.id)
        .where(IssueRating.issue_id.is_not(None))
        .where(or_(IssueRating.relevance_rating.is_not(None), IssueRating.quality_rating.is_not(None)))
        .scalar_subquery()
    )

    fully_rated_issues_subquery = (
        select(func.count(func.distinct(IssueRating.issue_id)))
        .join(Issue, Issue.id == IssueRating.issue_id)
        .where(Issue.submit_id == submit_id)
        .where(IssueRating.rater_id == current_rater.id)
        .where(IssueRating.issue_id.is_not(None))
        .where(IssueRating.relevance_rating.is_not(None))
        .where(IssueRating.quality_rating.is_not(None))
        .scalar_subquery()
    )

    total_issues_column = func.coalesce(total_issues_subquery, 0)
    started_issues_column = func.coalesce(started_issues_subquery, 0)
    fully_rated_issues_column = func.coalesce(fully_rated_issues_subquery, 0)

    rating_state_column = case(
        (total_issues_column == 0, "rated"),
        (fully_rated_issues_column >= total_issues_column, "rated"),
        (started_issues_column > 0, "partially_rated"),
        else_="not_rated",
    ).label("rating_state")

    statement: Select = (
        select(Submit, rating_state_column, SourceTag.tag.label("source_tag"))
        .outerjoin(SourceTag, SourceTag.source_path == Submit.source_path)
        .where(Submit.id == submit_id)
    )

    row = session.execute(statement).one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Submit not found")

    submit: Submit = row[0]
    rating_state: str = row[1]
    source_tag: str | None = row[2]

    if not submit.published and not current_rater.admin and submit.created_by_id != current_rater.id:
        raise HTTPException(status_code=404, detail="Submit not found")

    files: dict = find_source_files_or_extract(submit.source_path)

    return SubmitResponse(
        id=submit.id,
        model=submit.model,
        source_path=submit.source_path,
        prompt_path=submit.prompt_path,
        source_tag=source_tag,
        files=files,
        created_at=submit.created_at,
        rating_state=rating_state,
        published=submit.published,
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

    if not submit.published and not current_rater.admin and submit.created_by_id != current_rater.id:
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
        id=None,
        explanation="Failed to load summary rating",
        relevance_rating=None,
        quality_rating=None,
        rated_at=None,
    )

    for issue, rating in rater_issues:
        relevance_rating = None if rating is None else rating.relevance_rating
        quality_rating = None if rating is None else rating.quality_rating
        rated_at = None if rating is None else rating.created_at

        if issue.file is None and issue.line is None:
            summary = SubmitSummary(
                id=issue.id,
                explanation=issue.explanation,
                relevance_rating=relevance_rating,
                quality_rating=quality_rating,
                rated_at=rated_at,
            )
        else:
            issues.append(SubmitIssue(
                id=issue.id,
                file=issue.file,
                severity=issue.severity,
                line=issue.line,
                explanation=issue.explanation,
                relevance_rating=relevance_rating,
                quality_rating=quality_rating,
                rated_at=rated_at,
            ))

    return SubmitIssuesResponse(
        submit_id=submit_id,
        rater_id=current_rater.id,
        summary=summary,
        issues=issues,
    )


@router.put("/{submit_id}/publish")
def set_submit_publish_state(
        submit_id: int,
        request: SubmitPublishRequest,
        session: Session = Depends(get_database),
        current_rater: Rater = Depends(require_admin),
) -> SubmitPublishResponse:
    submit: Submit | None = session.get(Submit, submit_id)
    if submit is None:
        raise HTTPException(status_code=404, detail="Submit not found")

    submit.published = request.published
    session.commit()

    return SubmitPublishResponse(
        id=submit.id,
        published=submit.published,
    )


@router.delete("/{submit_id}")
def delete_submit(
        submit_id: int,
        session: Session = Depends(get_database),
        current_rater: Rater = Depends(require_admin),
) -> SubmitDeleteResponse:
    del current_rater
    submit: Submit | None = session.get(Submit, submit_id)
    if submit is None:
        raise HTTPException(status_code=404, detail="Submit not found")

    session.query(AnalysisJob).filter(AnalysisJob.submit_id == submit_id).update({AnalysisJob.submit_id: None})
    session.delete(submit)
    session.commit()

    return SubmitDeleteResponse(id=submit_id, deleted=True)
