import logging
from pathlib import Path
from typing import List

from sqlalchemy import delete, select, Sequence
from sqlalchemy.orm import Session

from app.analyzer.analyzer import Analyzer
from app.analyzer.dto import EmbeddedFile, ReviewResult
from app.database.db import SessionLocal
from app.database.models import Submit, Issue
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
    total_chars = 0

    submit_files = find_source_files_or_extract(source_path)
    for file_path, content in sorted(submit_files.items(), key=lambda x: x[0].as_posix()):
        total_lines = content.count("\n") + 1
        total_chars += len(content)

        lang = detect_language(file_path.as_posix())
        if lang == "text":
            logger.info(f"Skipping {file_path}: unsupported file type")
            continue

        embedded.append(
            EmbeddedFile(
                path=file_path.as_posix(),
                language=lang,
                content=content,
                total_lines=total_lines,
            )
        )

    logger.info(f"Embedded {len(embedded)} files ({total_chars} total characters)")
    return embedded


def delete_previous_submit(session: Session, source_path: str, prompt_name: str) -> None:
    submit_identifier_list: Sequence[int] = (
        session.execute(
            select(Submit.id).where(
                Submit.source_path == source_path,
                Submit.prompt_name == prompt_name,
            )
        )
        .scalars()
        .all()
    )

    if len(submit_identifier_list) == 0:
        return

    session.execute(delete(Issue).where(Issue.submit_id.in_(submit_identifier_list)))
    session.execute(delete(Submit).where(Submit.id.in_(submit_identifier_list)))


def run_submit_analysis(source_path: str, prompt_name: str, model: str) -> None:
    session: Session = SessionLocal()

    # Detele previous analysis results for the same source_path and prompt_name if any
    try:
        delete_previous_submit(session, source_path, prompt_name)
    except Exception:
        logger.exception(
            "Failed to delete previous analysis results for source_path='%s' and prompt_name='%s'",
            source_path, prompt_name
        )
        session.rollback()
        session.close()
        raise

    try:
        system_prompt: str = find_prompt_file(prompt_name);
        files: List[EmbeddedFile] = embed_text_files(source_path)

        summarizer: Analyzer = Analyzer(model, files, system_prompt)
        review_result: ReviewResult = summarizer.summarize()

        submit: Submit = Submit(
            source_path=source_path,
            prompt_name=prompt_name,
            model=model,
            summary=review_result.summary,
        )

        session.add(submit)
        session.flush()  # To get the submit.id

        for issue in review_result.issues:
            session.add(Issue(
                submit_id=submit.id,
                file=issue.file,
                line=issue.line,
                severity=issue.severity.value,
                explanation=issue.explanation,
            ))

        session.commit()
        logger.info(
            "Model '%s' analysis with prompt '%s' completed for files at '%s'. Issues found: %d",
            model, prompt_name, source_path, len(review_result.issues)
        )
    except Exception:
        logger.exception(
            "Model '%s' analysis with prompt '%s' failed for files at '%s'",
            model, prompt_name, source_path
        )
        session.rollback()
        raise
    finally:
        session.close()
