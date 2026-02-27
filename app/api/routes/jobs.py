from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.analyzer.analyze_job import run_submit_analysis
from app.api.dto import AnalyzeSourceResponse, JobErrorLogRequest, JobErrorLogResponse, JobListResponse, JobResponse
from app.api.routes.auth import get_current_rater
from app.database.db import get_database
from app.database.models import AnalysisJob, Rater
from app.database.rq_queue import get_analysis_queue
from app.utils.files import load_job_error_log, save_job_error_log

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("")
def list_jobs(
        session: Session = Depends(get_database),
        current_rater: Rater = Depends(get_current_rater),
        status: Optional[str] = Query(None),
        page: int = Query(1, ge=1),
        page_size: int = Query(20, ge=1, le=100),
) -> JobListResponse:
    statement = select(AnalysisJob).order_by(AnalysisJob.updated_at.desc())
    if status:
        statement = statement.where(AnalysisJob.status == status)

    total_count = session.execute(
        select(func.count()).select_from(statement.order_by(None).subquery())
    ).scalar_one()
    offset = (page - 1) * page_size
    jobs = session.execute(statement.limit(page_size).offset(offset)).scalars().all()
    items = [
        JobResponse(
            id=job.id,
            job_id=job.job_id,
            status=job.status,
            job_type=job.job_type,
            source_path=job.source_path,
            prompt_path=job.prompt_path,
            model=job.model,
            submit_id=job.submit_id,
            error=job.error,
            error_log=None,
            created_at=job.created_at,
            updated_at=job.updated_at,
        )
        for job in jobs
    ]
    return JobListResponse(
        items=items,
        total=total_count,
        page=page,
        page_size=page_size,
    )


@router.get("/{job_id}")
def get_job(
        job_id: str,
        session: Session = Depends(get_database),
        current_rater: Rater = Depends(get_current_rater),
) -> JobResponse:
    job = session.execute(
        select(AnalysisJob).where(AnalysisJob.job_id == job_id)
    ).scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobResponse(
        id=job.id,
        job_id=job.job_id,
        status=job.status,
        job_type=job.job_type,
        source_path=job.source_path,
        prompt_path=job.prompt_path,
        model=job.model,
        submit_id=job.submit_id,
        error=job.error,
        error_log=load_job_error_log(job_id),
        created_at=job.created_at,
        updated_at=job.updated_at,
    )


@router.get("/{job_id}/error-log")
def get_job_error_log(
        job_id: str,
        session: Session = Depends(get_database),
        current_rater: Rater = Depends(get_current_rater),
) -> JobErrorLogResponse:
    del current_rater

    job = session.execute(
        select(AnalysisJob).where(AnalysisJob.job_id == job_id)
    ).scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    error_log = load_job_error_log(job_id)
    if error_log is None:
        raise HTTPException(status_code=404, detail="Job error log not found")

    return JobErrorLogResponse(job_id=job_id, error_log=error_log)


@router.post("/{job_id}/error-log")
def upload_job_error_log(
        job_id: str,
        request: JobErrorLogRequest,
        session: Session = Depends(get_database),
        current_rater: Rater = Depends(get_current_rater),
) -> JobErrorLogResponse:
    del current_rater

    job = session.execute(
        select(AnalysisJob).where(AnalysisJob.job_id == job_id)
    ).scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    try:
        save_job_error_log(job_id, request.error_log)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if job.status != "failed":
        job.status = "failed"
    if not job.error:
        first_line = request.error_log.splitlines()[0] if request.error_log.splitlines() else "Job failed"
        job.error = first_line.strip() or "Job failed"
    session.commit()

    return JobErrorLogResponse(job_id=job_id, error_log=request.error_log)


@router.post("/{job_id}/restart")
def restart_failed_job(
        job_id: str,
        session: Session = Depends(get_database),
        current_rater: Rater = Depends(get_current_rater),
) -> AnalyzeSourceResponse:
    job = session.execute(
        select(AnalysisJob).where(AnalysisJob.job_id == job_id)
    ).scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job.status != "failed":
        raise HTTPException(status_code=400, detail="Only failed jobs can be restarted")

    if not job.source_path or not job.prompt_path or not job.model:
        raise HTTPException(status_code=400, detail="Job is missing source, prompt, or model")

    analysis_queue = get_analysis_queue()
    new_job = analysis_queue.enqueue(
        run_submit_analysis,
        job.source_path,
        job.prompt_path,
        job.model,
        current_rater.id,
        False,
        job_timeout=1800,
    )

    session.add(AnalysisJob(
        job_id=new_job.id,
        status="running",
        job_type=job.job_type,
        source_path=job.source_path,
        prompt_path=job.prompt_path,
        model=job.model,
    ))
    session.commit()

    return AnalyzeSourceResponse(
        ok=True,
        job_id=new_job.id,
        source_path=job.source_path,
        prompt_path=job.prompt_path,
        model=job.model,
    )
