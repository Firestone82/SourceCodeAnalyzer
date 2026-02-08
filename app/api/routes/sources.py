import os
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.analyzer.analyze_job import run_submit_analysis
from app.api.dto import AnalyzeRequest, SourcePathsResponse, AnalyzeSourceResponse, SourceFilesResponse
from app.api.security import get_current_rater
from app.database.db import get_database
from app.database.models import AnalysisJob, Rater
from app.database.rq_queue import get_analysis_queue
from app.utils.files import PROMPTS_ROOT, find_source_files_or_extract, SOURCES_ROOT, safe_join

router = APIRouter(prefix="/sources", tags=["sources"])


def normalize_prompt_path(prompt_path: str) -> str:
    candidate = prompt_path.strip()

    if not candidate:
        raise HTTPException(status_code=400, detail="Prompt path is required")

    candidate_path = Path(candidate)
    if candidate_path.is_absolute() or ".." in candidate_path.parts:
        raise HTTPException(status_code=400, detail="Invalid prompt path")

    return candidate_path.as_posix()


def store_prompt_content(prompt_path: str, content: str) -> str:
    normalized_prompt_path = normalize_prompt_path(prompt_path)
    prompt_file_path = safe_join(PROMPTS_ROOT, f"{normalized_prompt_path}.txt")
    prompt_file_path.parent.mkdir(parents=True, exist_ok=True)
    prompt_file_path.write_text(content, encoding="utf-8")
    return normalized_prompt_path


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
    prompt_path = request.prompt_path

    if request.prompt_content is not None:
        if not request.prompt_content.strip():
            raise HTTPException(status_code=400, detail="Prompt content is required")
        prompt_path = store_prompt_content(prompt_path, request.prompt_content)

    job = analysis_queue.enqueue(
        run_submit_analysis,
        source_path,
        prompt_path,
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
        prompt_path=prompt_path,
        model=request.model,
    ))
    session.commit()

    return AnalyzeSourceResponse(
        ok=True,
        job_id=job.id,
        source_path=source_path,
        model=request.model,
        prompt_path=prompt_path,
    )
