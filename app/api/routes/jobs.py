from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.dto import JobListResponse, JobResponse
from app.api.routes.auth import get_current_rater
from app.database.db import get_database
from app.database.models import AnalysisJob, Rater

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("")
def list_jobs(
        session: Session = Depends(get_database),
        current_rater: Rater = Depends(get_current_rater),
        status: Optional[str] = Query(None),
        page: int = Query(1, ge=1),
        page_size: int = Query(20, ge=1, le=100),
) -> JobListResponse:
    statement = select(AnalysisJob).order_by(AnalysisJob.created_at.desc())
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
        created_at=job.created_at,
        updated_at=job.updated_at,
    )
