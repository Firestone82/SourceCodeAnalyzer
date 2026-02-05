from pathlib import Path
from typing import List

from fastapi import APIRouter

from app.api.dto import (
    BatchAnalyzeRequest,
    PromptAnalysisJob,
    PromptAnalysisResponse,
    PromptContentResponse,
    PromptNamesResponse,
)
from app.database.rq_queue import get_analysis_queue
from app.utils.files import PROMPTS_ROOT, find_prompt_file

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


@router.post("/{prompt_path}")
def analyze_sources_with_prompt(prompt_path: str, request: BatchAnalyzeRequest) -> PromptAnalysisResponse:
    analysis_queue = get_analysis_queue()

    jobs: list[PromptAnalysisJob] = []
    for source_path in request.sources:
        job = analysis_queue.enqueue(
            "app.analyzer.analyze_job.run_submit_analysis",
            source_path,
            prompt_path,
            request.model,
            job_timeout=1800,
        )

        jobs.append(PromptAnalysisJob(
            job_id=job.id,
            source_path=source_path)
        )

    return PromptAnalysisResponse(
        ok=True,
        model=request.model,
        prompt_path=prompt_path,
        jobs=jobs,
    )
