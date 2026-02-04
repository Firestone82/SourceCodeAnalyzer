import os
from pathlib import Path
from typing import List

from fastapi import APIRouter

from app.analyzer.analyze_job import run_submit_analysis
from app.api.dto import AnalyzeRequest
from app.database.rq_queue import get_analysis_queue
from app.utils.files import find_source_files_or_extract, SOURCES_ROOT

router = APIRouter(prefix="/sources", tags=["sources"])


@router.get("")
def list_source_paths() -> dict:
    file_paths: List[str] = []

    for directory_path, directory_names, file_names in os.walk(SOURCES_ROOT):
        for file_name in file_names:
            if file_name == "src.zip":
                full_path: Path = Path(directory_path).resolve()
                relative_path: Path = full_path.relative_to(SOURCES_ROOT)
                file_paths.append(relative_path.as_posix())

    # TODO: Return as data transfer object
    return {
        "source_paths": sorted(file_paths)
    }


@router.get("/{source_path:path}")
def get_source_file(source_path: str) -> dict:
    content: dict = find_source_files_or_extract(source_path)

    # TODO: Return as data transfer object
    return {
        "source_path": source_path,
        "files": content,
    }


@router.post("/{source_path:path}")
def analyze_source_file(source_path: str, request: AnalyzeRequest) -> dict:
    analysis_queue = get_analysis_queue()

    job = analysis_queue.enqueue(
        run_submit_analysis,
        source_path,
        request.prompt_name,
        request.model,
        job_timeout=1800,
    )

    # TODO: Return as data transfer object
    return {
        "ok": True,
        "job_id": job.id,
        "source_path": source_path,
        "model": request.model,
        "prompt_name": request.prompt_name,
    }
