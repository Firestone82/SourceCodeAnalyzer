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
    SourceTagDeleteResponse,
    SourceTagRequest,
    SourceTagResponse,
    SourceFolderEntry,
    SourceFoldersResponse,
    SourceFolderChildEntry,
    SourceFolderChildrenResponse,
)
from app.api.security import get_current_rater, require_admin
from app.database.db import get_database
from app.database.models import AnalysisJob, Rater, SourceTag
from app.database.rq_queue import get_analysis_queue
from app.utils.files import PROMPTS_ROOT, find_source_comments, find_source_files_or_extract, SOURCES_ROOT, safe_join

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


def get_source_tag(session: Session, source_path: str) -> str | None:
    record = session.query(SourceTag).filter(SourceTag.source_path == source_path).one_or_none()
    if record is None:
        return None
    return record.tag




def source_name_sort_key(name: str) -> tuple[int, int | str]:
    stripped_name = name.strip()
    if stripped_name.isdigit():
        return 0, int(stripped_name)

    return 1, stripped_name.lower()

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
        tag: str | None = Query(None),
        session: Session = Depends(get_database),
) -> SourcePathsResponse:
    file_paths: List[str] = []

    for directory_path, _, file_names in os.walk(SOURCES_ROOT):
        for file_name in file_names:
            if file_name == "src.zip":
                full_path: Path = Path(directory_path).resolve()
                relative_path: Path = full_path.relative_to(SOURCES_ROOT)
                file_paths.append(relative_path.as_posix())

    if tag is not None and tag.strip():
        tag_value = tag.strip()
        tagged_paths = {record.source_path for record in session.query(SourceTag).filter(SourceTag.tag == tag_value).all()}
        file_paths = [path for path in file_paths if path in tagged_paths]

    sorted_paths = sorted(file_paths, key=lambda path: tuple(source_name_sort_key(part) for part in path.split("/")))
    total = len(sorted_paths)
    paged_paths = sorted_paths[offset:offset + limit] if limit is not None else sorted_paths[offset:]
    next_offset = offset + limit if limit is not None and offset + limit < total else None

    return SourcePathsResponse(source_paths=paged_paths, total=total, next_offset=next_offset)


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
        session: Session = Depends(get_database),
) -> SourceFolderChildrenResponse:
    normalized_folder_path = normalize_folder_path(folder_path or "")
    base_path = SOURCES_ROOT if not normalized_folder_path else safe_join(SOURCES_ROOT, normalized_folder_path)

    if not base_path.exists() or not base_path.is_dir():
        raise HTTPException(status_code=404, detail="Folder not found")

    child_directories: list[tuple[str, Path]] = []
    with os.scandir(base_path) as entries:
        for entry in entries:
            if entry.is_dir():
                child_directories.append((entry.name, Path(entry.path)))

    child_paths = [entry_path.relative_to(SOURCES_ROOT).as_posix() for _, entry_path in child_directories]
    source_tags: dict[str, str] = {
        tag.source_path: tag.tag
        for tag in session.query(SourceTag).filter(SourceTag.source_path.in_(child_paths)).all()
    } if child_paths else {}

    children: list[SourceFolderChildEntry] = []
    for entry_name, entry_path in child_directories:
        relative_path = entry_path.relative_to(SOURCES_ROOT).as_posix()
        has_source = (entry_path / "src.zip").exists()
        with os.scandir(entry_path) as child_entries:
            has_children = any(child.is_dir() for child in child_entries)
        children.append(SourceFolderChildEntry(
            name=entry_name,
            path=relative_path,
            has_source=has_source,
            has_children=has_children,
            source_tag=source_tags.get(relative_path),
        ))

    children.sort(key=lambda child: source_name_sort_key(child.name))
    total = len(children)
    paged_children = children[offset:offset + limit] if limit is not None else children[offset:]
    next_offset = offset + limit if limit is not None and offset + limit < total else None

    return SourceFolderChildrenResponse(children=paged_children, total=total, next_offset=next_offset)


@router.get("/tags/{source_path:path}")
def get_source_path_tag(
        source_path: str,
        session: Session = Depends(get_database),
) -> SourceTagResponse:
    tag = get_source_tag(session, source_path)
    return SourceTagResponse(source_path=source_path, tag=tag or "")


@router.put("/tags/{source_path:path}")
def set_source_path_tag(
        source_path: str,
        request: SourceTagRequest,
        session: Session = Depends(get_database),
        current_rater: Rater = Depends(require_admin),
) -> SourceTagResponse:
    del current_rater
    tag = request.tag.strip()
    if not tag:
        raise HTTPException(status_code=400, detail="Tag is required")

    record = session.query(SourceTag).filter(SourceTag.source_path == source_path).one_or_none()
    if record is None:
        record = SourceTag(source_path=source_path, tag=tag)
        session.add(record)
    else:
        record.tag = tag

    session.commit()
    return SourceTagResponse(source_path=source_path, tag=tag)


@router.delete("/tags/{source_path:path}")
def delete_source_path_tag(
        source_path: str,
        session: Session = Depends(get_database),
        current_rater: Rater = Depends(require_admin),
) -> SourceTagDeleteResponse:
    del current_rater
    record = session.query(SourceTag).filter(SourceTag.source_path == source_path).one_or_none()
    if record is not None:
        session.delete(record)
        session.commit()

    return SourceTagDeleteResponse(source_path=source_path, deleted=True)


@router.get("/{source_path:path}")
def get_source_file(source_path: str) -> SourceFilesResponse:
    content: dict = find_source_files_or_extract(source_path)
    comments = find_source_comments(source_path)
    return SourceFilesResponse(source_path=source_path, files=content, comments=comments)


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
