from pathlib import Path
from typing import List

from fastapi import APIRouter

from app.api.dto import BatchAnalyzeRequest
from app.database.rq_queue import get_analysis_queue
from app.utils.files import PROMPTS_ROOT, find_prompt_file

router = APIRouter(prefix="/prompts", tags=["prompts"])


@router.get("")
def list_prompt_names() -> dict:
    prompt_names: List[str] = []

    for path in PROMPTS_ROOT.rglob("*.txt"):
        relative_path: Path = path.relative_to(PROMPTS_ROOT)
        prompt_names.append(relative_path.as_posix())

    # TODO: Return as data transfer object
    return {
        "prompt_names": sorted(prompt_names)
    }


@router.get("/{prompt_name}")
def get_prompt_content(prompt_name: str) -> dict:
    content: str = find_prompt_file(prompt_name)

    # TODO: Return as data transfer object
    return {
        "prompt_name": prompt_name,
        "content": content,
    }


@router.post("/{prompt_name}")
def analyze_sources_with_prompt(prompt_name: str, request: BatchAnalyzeRequest) -> dict:
    analysis_queue = get_analysis_queue()

    jobs = []
    for source_path in request.sources:
        job = analysis_queue.enqueue(
            "app.analyzer.analyze_job.run_submit_analysis",
            source_path,
            prompt_name,
            request.model,
            job_timeout=1800,
        )

        jobs.append({
            "job_id": job.id,
            "source_path": source_path,
        })

    # TODO: Return as data transfer object
    return {
        "ok": True,
        "model": request.model,
        "prompt_name": prompt_name,
        "jobs": jobs
    }
