import logging
from datetime import datetime
from pathlib import Path
from typing import List, Dict

from sqlalchemy import delete, select, Sequence
from sqlalchemy.orm import Session
from rq import get_current_job

from app.analyzer.analyzer import Analyzer
from app.analyzer.dto import EmbeddedFile, ReviewResult
from app.database.db import SessionLocal
from app.database.models import Submit, Issue, AnalysisJob
from app.utils.files import find_prompt_file, find_source_files_or_extract

logger = logging.getLogger(__name__)


def detect_language(file_path: str) -> str:
    ext = Path(file_path).suffix.lower()
    mapping = {
        ".c": "c",
        ".cpp": "cpp",
        ".cc": "cpp",
        ".h": "c",
        ".hpp": "cpp",
        ".py": "python",
        ".java": "java",
        ".js": "javascript",
        ".ts": "typescript",
    }
    return mapping.get(ext, "text")


def embed_text_files(source_path: str) -> List[EmbeddedFile]:
    embedded: List[EmbeddedFile] = []
    total_chars: int = 0

    submit_files: Dict[str, str] = find_source_files_or_extract(source_path)

    for file_path, content in sorted(submit_files.items(), key=lambda item: item[0]):
        total_chars += len(content)
        total_lines = content.count("\n") + 1

        language: str = detect_language(file_path)
        if language == "text":
            logger.info(f"Skipping {file_path}: unsupported file type")
            continue

        embedded.append(EmbeddedFile(
            path=file_path,
            language=language,
            content=content,
            total_lines=total_lines,
        ))

    logger.info(
        f"Embedded {len(embedded)} files ({total_chars} total characters)"
    )
    return embedded


def delete_previous_submit(
    session: Session,
    source_path: str,
    prompt_path: str,
    rater_id: int | None = None,
) -> None:
    conditions = [
        Submit.source_path == source_path,
        Submit.prompt_path == prompt_path,
    ]
    if rater_id is not None:
        conditions.append(Submit.created_by_id == rater_id)

    submit_identifier_list: Sequence[int] = (
        session.execute(
            select(Submit.id).where(*conditions)
        )
        .scalars()
        .all()
    )

    if len(submit_identifier_list) == 0:
        return

    session.execute(delete(Issue).where(Issue.submit_id.in_(submit_identifier_list)))
    session.execute(delete(Submit).where(Submit.id.in_(submit_identifier_list)))


def run_submit_analysis(
    source_path: str,
    prompt_path: str,
    model: str,
    rater_id: int | None = None,
    published: bool = False,
) -> None:
    session: Session = SessionLocal()
    job = get_current_job()
    job_id = job.id if job else None

    def update_job_status(status: str, error: str | None = None, submit_id: int | None = None) -> None:
        if not job_id:
            return
        job_session: Session = SessionLocal()
        try:
            record = job_session.execute(
                select(AnalysisJob).where(AnalysisJob.job_id == job_id)
            ).scalar_one_or_none()
            if not record:
                return
            record.status = status
            record.error = error
            record.submit_id = submit_id
            record.updated_at = datetime.now()
            job_session.commit()
        finally:
            job_session.close()

    # Detele previous analysis results for the same source_path and prompt_path if any
    try:
        delete_previous_submit(session, source_path, prompt_path, rater_id)
    except Exception:
        logger.exception(
            "Failed to delete previous analysis results for source_path='%s' and prompt_path='%s'",
            source_path, prompt_path
        )
        session.rollback()
        update_job_status("failed", error="Failed to clean previous submit")
        session.close()
        raise

    try:
        system_prompt: str = find_prompt_file(prompt_path);
        files: List[EmbeddedFile] = embed_text_files(source_path)

        summarizer: Analyzer = Analyzer(model, files, system_prompt)
        review_result: ReviewResult = summarizer.summarize()

        submit: Submit = Submit(
            source_path=source_path,
            prompt_path=prompt_path,
            model=model,
            created_by_id=rater_id,
            published=published,
        )

        session.add(submit)
        session.flush()  # To get the submit.id

        session.add(Issue(
            submit_id=submit.id,
            file=None,
            line=None,
            severity="summary",
            explanation=review_result.summary,
        ))

        for issue in review_result.issues:
            session.add(Issue(
                submit_id=submit.id,
                file=issue.file,
                line=issue.line,
                severity=issue.severity.value,
                explanation=issue.explanation,
            ))

        session.commit()
        update_job_status("succeeded", submit_id=submit.id)
        logger.info(
            "Model '%s' analysis with prompt '%s' completed for files at '%s'. Issues found: %d",
            model, prompt_path, source_path, len(review_result.issues)
        )
    except Exception:
        logger.exception(
            "Model '%s' analysis with prompt '%s' failed for files at '%s'",
            model, prompt_path, source_path
        )
        session.rollback()
        update_job_status("failed", error="Analysis failed")
        raise
    finally:
        session.close()
