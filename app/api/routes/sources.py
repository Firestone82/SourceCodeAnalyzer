import os
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.analyzer.analyze_job import run_submit_analysis
from app.api.dto import (
    AnalyzeRequest,
    SourcePathsResponse,
    AnalyzeSourceResponse,
    SourceFilesResponse,
    SourceFolderEntry,
    SourceFoldersResponse,
    SourceFolderChildEntry,
    SourceFolderChildrenResponse,
)
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


def normalize_folder_path(folder_path: str) -> str:
    candidate = folder_path.strip()

    if not candidate:
        return ""

    candidate_path = Path(candidate)
    if candidate_path.is_absolute() or ".." in candidate_path.parts:
        raise HTTPException(status_code=400, detail="Invalid folder path")

    return candidate_path.as_posix()


@router.get("")
def list_source_paths(
        offset: int = Query(0, ge=0),
        limit: int | None = Query(None, ge=1),
) -> SourcePathsResponse:
    file_paths: List[str] = []

    for directory_path, directory_names, file_names in os.walk(SOURCES_ROOT):
        for file_name in file_names:
            if file_name == "src.zip":
                full_path: Path = Path(directory_path).resolve()
                relative_path: Path = full_path.relative_to(SOURCES_ROOT)
                file_paths.append(relative_path.as_posix())

    sorted_paths = sorted(file_paths)
    total = len(sorted_paths)
    if limit is not None:
        paged_paths = sorted_paths[offset:offset + limit]
    else:
        paged_paths = sorted_paths[offset:]
    next_offset = None
    if limit is not None and offset + limit < total:
        next_offset = offset + limit

    return SourcePathsResponse(
        source_paths=paged_paths,
        total=total,
        next_offset=next_offset,
    )


@router.get("/folders")
def list_source_folders() -> SourceFoldersResponse:
    folders: dict[str, bool] = {}

    for directory_path, _, file_names in os.walk(SOURCES_ROOT):
        full_path: Path = Path(directory_path).resolve()
        relative_path: Path = full_path.relative_to(SOURCES_ROOT)
        folder_path = relative_path.as_posix()
        if folder_path == ".":
            continue

        if folder_path not in folders:
            folders[folder_path] = False

        if "src.zip" in file_names:
            folders[folder_path] = True

    folder_entries = [
        SourceFolderEntry(path=path, has_source=has_source)
        for path, has_source in sorted(folders.items())
    ]

    return SourceFoldersResponse(folders=folder_entries)


@router.get("/folders/children")
def list_source_folder_children(
        folder_path: str | None = Query(None),
        offset: int = Query(0, ge=0),
        limit: int | None = Query(None, ge=1),
) -> SourceFolderChildrenResponse:
    normalized_folder_path = normalize_folder_path(folder_path or "")
    base_path = SOURCES_ROOT if not normalized_folder_path else safe_join(SOURCES_ROOT, normalized_folder_path)

    if not base_path.exists() or not base_path.is_dir():
        raise HTTPException(status_code=404, detail="Folder not found")

    children: list[SourceFolderChildEntry] = []
    with os.scandir(base_path) as entries:
        for entry in entries:
            if not entry.is_dir():
                continue
            entry_path = Path(entry.path)
            relative_path = entry_path.relative_to(SOURCES_ROOT).as_posix()
            has_source = (entry_path / "src.zip").exists()
            with os.scandir(entry_path) as child_entries:
                has_children = any(child.is_dir() for child in child_entries)
            children.append(SourceFolderChildEntry(
                name=entry.name,
                path=relative_path,
                has_source=has_source,
                has_children=has_children,
            ))

    children.sort(key=lambda child: child.name)
    total = len(children)
    if limit is not None:
        paged_children = children[offset:offset + limit]
    else:
        paged_children = children[offset:]
    next_offset = None
    if limit is not None and offset + limit < total:
        next_offset = offset + limit

    return SourceFolderChildrenResponse(
        children=paged_children,
        total=total,
        next_offset=next_offset,
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
