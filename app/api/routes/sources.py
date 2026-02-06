import os
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.analyzer.analyze_job import run_submit_analysis
from app.api.dto import AnalyzeRequest, SourcePathsResponse, AnalyzeSourceResponse, SourceFilesResponse
from app.api.security import get_current_rater
from app.database.db import get_database
from app.database.models import AnalysisJob, Rater
from app.database.rq_queue import get_analysis_queue
from app.utils.files import find_source_files_or_extract, SOURCES_ROOT

router = APIRouter(prefix="/sources", tags=["sources"])


@router.get("")
def list_source_paths() -> SourcePathsResponse:
    file_paths: List[str] = []

    for directory_path, directory_names, file_names in os.walk(SOURCES_ROOT):
        for file_name in file_names:
            if file_name == "src.zip":
                full_path: Path = Path(directory_path).resolve()
                relative_path: Path = full_path.relative_to(SOURCES_ROOT)
                file_paths.append(relative_path.as_posix())

    return SourcePathsResponse(
        source_paths=sorted(file_paths)
    )


@router.get("/{source_path:path}")
def get_source_file(source_path: str) -> SourceFilesResponse:
    content: dict = find_source_files_or_extract(source_path)

    return SourceFilesResponse(
        source_path=source_path,
        files=content
    )


@router.post("/{source_path:path}")
def analyze_source_file(
        source_path: str,
        request: AnalyzeRequest,
        session: Session = Depends(get_database),
        current_rater: Rater = Depends(get_current_rater),
) -> AnalyzeSourceResponse:
    analysis_queue = get_analysis_queue()

    job = analysis_queue.enqueue(
        run_submit_analysis,
        source_path,
        request.prompt_path,
        request.model,
        current_rater.id,
        False,
        job_timeout=1800,
    )

    session.add(AnalysisJob(
        job_id=job.id,
        status="running",
        job_type="source_review",
        source_path=source_path,
        prompt_path=request.prompt_path,
        model=request.model,
    ))
    session.commit()

    return AnalyzeSourceResponse(
        ok=True,
        job_id=job.id,
        source_path=source_path,
        model=request.model,
        prompt_path=request.prompt_path,
    )
