import logging
import traceback
from datetime import datetime
from io import StringIO
from typing import Dict

from rq import get_current_job
from sqlalchemy import delete, select, Sequence
from sqlalchemy.orm import Session

from app.analyzer.analyzer import Analyzer
from app.analyzer.dto import ReviewResult
from app.database.db import SessionLocal
from app.database.models import Submit, Issue, AnalysisJob
from app.utils.files import find_prompt_file, save_job_error_log, find_source_files_or_extract

logger = logging.getLogger(__name__)


class _InMemoryLogHandler(logging.StreamHandler):
    def __init__(self) -> None:
        self.stream = StringIO()
        super().__init__(self.stream)

    def get_value(self) -> str:
        return self.stream.getvalue()


def _configure_job_log_capture(job_id: str | None) -> _InMemoryLogHandler | None:
    if not job_id:
        return None

    handler = _InMemoryLogHandler()
    handler.setLevel(logging.INFO)
    handler.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(name)s - %(message)s'))

    root_logger = logging.getLogger()
    root_logger.addHandler(handler)
    return handler


def _store_failed_job_log(job_id: str | None, log_handler: _InMemoryLogHandler | None, exc: Exception) -> None:
    if not job_id:
        return

    stack_trace = ''.join(traceback.format_exception(type(exc), exc, exc.__traceback__))
    captured_log = log_handler.get_value() if log_handler else ''

    log_parts: list[str] = []
    if captured_log.strip():
        log_parts.append(captured_log.rstrip())
    if stack_trace.strip():
        log_parts.append('--- Exception traceback ---\n' + stack_trace.rstrip())

    persisted_log = '\n\n'.join(log_parts) if log_parts else stack_trace
    try:
        save_job_error_log(job_id, persisted_log)
    except Exception:
        logger.exception("Failed to store error log for job '%s'", job_id)


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
    job_log_handler = _configure_job_log_capture(job_id)

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
    except Exception as exc:
        logger.exception(
            "Failed to delete previous analysis results for source_path='%s' and prompt_path='%s'",
            source_path, prompt_path
        )
        session.rollback()
        _store_failed_job_log(job_id, job_log_handler, exc)
        update_job_status("failed", error=str(exc) or "Failed to clean previous submit")
        session.close()
        raise

    try:
        draft_prompt: str = find_prompt_file(prompt_path)
        submit_files: Dict[str, str] = find_source_files_or_extract(source_path)

        summarizer: Analyzer = Analyzer(model, submit_files, draft_prompt, language="Czech")
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
    except Exception as exc:
        logger.exception(
            "Model '%s' analysis with prompt '%s' failed for files at '%s'",
            model, prompt_path, source_path
        )
        session.rollback()

        _store_failed_job_log(job_id, job_log_handler, exc)

        update_job_status("failed", error=str(exc) or "Analysis failed")
        raise
    finally:
        if job_log_handler is not None:
            logging.getLogger().removeHandler(job_log_handler)
            job_log_handler.close()
        session.close()
