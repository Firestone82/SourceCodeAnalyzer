from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.dto import (
    BatchAnalyzeRequest,
    PromptUploadRequest,
    PromptUploadResponse,
    PromptAnalysisJob,
    PromptAnalysisResponse,
    PromptContentResponse,
    PromptNamesResponse,
)
from app.database.db import get_database
from app.database.models import AnalysisJob, Rater
from app.api.security import get_current_rater
from app.database.rq_queue import get_analysis_queue
from app.utils.files import PROMPTS_ROOT, find_prompt_file, safe_join

router = APIRouter(prefix="/prompts", tags=["prompts"])


@router.get("")
def list_prompt_paths() -> PromptNamesResponse:
    prompt_paths: List[str] = []

    for path in PROMPTS_ROOT.rglob("*.txt"):
        relative_path: Path = path.relative_to(PROMPTS_ROOT)
        prompt_paths.append(relative_path.as_posix())

    # Remove extensions
    prompt_paths = [name[:-4] for name in prompt_paths]

    return PromptNamesResponse(
        prompt_paths=sorted(prompt_paths)
    )


@router.get("/{prompt_path:path}")
def get_prompt_content(prompt_path: str) -> PromptContentResponse:
    content: str = find_prompt_file(prompt_path)

    return PromptContentResponse(
        prompt_path=prompt_path,
        content=content
    )


def normalize_prompt_path(prompt_path: str) -> str:
    candidate = prompt_path.strip()

    if not candidate:
        raise HTTPException(status_code=400, detail="Prompt path is required")

    candidate_path = Path(candidate)
    if candidate_path.is_absolute() or ".." in candidate_path.parts:
        raise HTTPException(status_code=400, detail="Invalid prompt path")

    return candidate_path.as_posix()


@router.post("/upload")
def upload_prompt(request: PromptUploadRequest) -> PromptUploadResponse:
    normalized_prompt_path = normalize_prompt_path(request.prompt_path)
    prompt_file_path = safe_join(PROMPTS_ROOT, f"{normalized_prompt_path}.txt")
    prompt_file_path.parent.mkdir(parents=True, exist_ok=True)
    prompt_file_path.write_text(request.content, encoding="utf-8")

    return PromptUploadResponse(prompt_path=normalized_prompt_path)


@router.post("/{prompt_path}")
def analyze_sources_with_prompt(
    prompt_path: str,
    request: BatchAnalyzeRequest,
    session: Session = Depends(get_database),
    current_rater: Rater = Depends(get_current_rater),
) -> PromptAnalysisResponse:
    analysis_queue = get_analysis_queue()

    jobs: list[PromptAnalysisJob] = []
    for source_path in request.sources:
        job = analysis_queue.enqueue(
            "app.analyzer.analyze_job.run_submit_analysis",
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
            job_type="prompt_review",
            source_path=source_path,
            prompt_path=prompt_path,
            model=request.model,
        ))

        jobs.append(PromptAnalysisJob(
            job_id=job.id,
            source_path=source_path)
        )

    session.commit()

    return PromptAnalysisResponse(
        ok=True,
        model=request.model,
        prompt_path=prompt_path,
        jobs=jobs,
    )
