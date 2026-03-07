import logging
from datetime import datetime
from io import StringIO
from typing import Dict, Literal

from rq import get_current_job
from sqlalchemy import delete, select, Sequence
from sqlalchemy.orm import Session

from app.analyzer.analyzer import Analyzer
from app.analyzer.critiquer import Critiquer
from app.analyzer.dto import ReviewResult
from app.analyzer.servers import get_default_openai_server_id
from app.database.db import SessionLocal
from app.database.models import Submit, Issue, IssueRating, SubmitRating, AnalysisJob, AIIssueRating, AISubmitRating
from app.settings import settings
from app.utils.files import find_prompt_file, save_job_error_log, find_source_files_or_extract

logger = logging.getLogger(__name__)


class InMemoryLogHandler(logging.StreamHandler):
    def __init__(self) -> None:
        self.stream = StringIO()
        super().__init__(self.stream)

    def get_value(self) -> str:
        return self.stream.getvalue()


def configure_job_log_capture(job_id: str | None) -> InMemoryLogHandler | None:
    if not job_id:
        return None

    handler = InMemoryLogHandler()
    handler.setLevel(logging.INFO)
    handler.setFormatter(logging.Formatter('%(asctime)s [%(levelname)s] %(name)s - %(message)s'))

    root_logger = logging.getLogger()
    root_logger.addHandler(handler)
    return handler


def store_job_log(job_id: str | None, log_handler: InMemoryLogHandler | None, stack_trace: str | None = None) -> None:
    if not job_id:
        return

    captured_log = log_handler.get_value() if log_handler else ''

    log_parts: list[str] = []
    if captured_log.strip():
        log_parts.append(captured_log.rstrip())

    persisted_log = '\n\n'.join(log_parts)
    if not persisted_log and stack_trace:
        persisted_log = stack_trace

    if not persisted_log:
        return

    try:
        save_job_error_log(job_id, persisted_log)
    except Exception:
        logger.exception("Failed to store job log for job '%s'", job_id)


def delete_previous_submit(
        session: Session,
        source_path: str,
        prompt_path: str,
        model: str,
        rater_id: int | None = None,
) -> None:
    conditions = [
        Submit.source_path == source_path,
        Submit.prompt_path == prompt_path,
        Submit.model == model,
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

    issue_identifier_list: Sequence[int] = (
        session.execute(
            select(Issue.id).where(Issue.submit_id.in_(submit_identifier_list))
        )
        .scalars()
        .all()
    )

    session.query(AnalysisJob).filter(AnalysisJob.submit_id.in_(submit_identifier_list)).update(
        {AnalysisJob.submit_id: None},
        synchronize_session=False,
    )
    session.execute(delete(AISubmitRating).where(AISubmitRating.submit_id.in_(submit_identifier_list)))
    session.execute(delete(SubmitRating).where(SubmitRating.submit_id.in_(submit_identifier_list)))

    if len(issue_identifier_list) > 0:
        session.execute(delete(AIIssueRating).where(AIIssueRating.issue_id.in_(issue_identifier_list)))
        session.execute(delete(IssueRating).where(IssueRating.issue_id.in_(issue_identifier_list)))

    session.execute(delete(Issue).where(Issue.submit_id.in_(submit_identifier_list)))
    session.execute(delete(Submit).where(Submit.id.in_(submit_identifier_list)))


def run_submit_analysis(
        source_path: str,
        prompt_path: str,
        model: str,
        rater_id: int | None = None,
        published: bool = False,
        analysis_mode: Literal["chain_of_thought", "one_shot"] = "chain_of_thought",
        openai_server: str | None = None,
        run_critiquer: bool = True,
) -> None:
    session: Session = SessionLocal()

    job = get_current_job()
    job_id = job.id if job else None
    job_log_handler = configure_job_log_capture(job_id)

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
        delete_previous_submit(session, source_path, prompt_path, model, rater_id)
    except Exception as exc:
        logger.exception(
            "Failed to delete previous analysis results for source_path='%s', prompt_path='%s', and model='%s'",
            source_path, prompt_path, model
        )

        session.rollback()
        store_job_log(job_id, job_log_handler)

        update_job_status("failed", error=str(exc) or "Failed to clean previous submit")
        session.close()
        raise

    try:
        draft_prompt: str = find_prompt_file(prompt_path)
        submit_files: Dict[str, str] = find_source_files_or_extract(source_path)

        review_result: ReviewResult = Analyzer(
            model,
            submit_files,
            draft_prompt,
            language=None,
            analysis_mode=analysis_mode,
            openai_server_id=openai_server,
        ).summarize()

        critiquer_result = None
        if run_critiquer:
            critiquer_model = settings.critiquer_model or model
            critiquer_server = settings.critiquer_openai_server or openai_server
            critiquer_result = Critiquer(
                model=critiquer_model,
                files=submit_files,
                openai_server_id=critiquer_server,
            ).rate_review(review_result)

        submit: Submit = Submit(
            source_path=source_path,
            prompt_path=prompt_path,
            model=model,
            analysis_mode=analysis_mode,
            openai_server=(openai_server or get_default_openai_server_id()),
            created_by_id=rater_id,
            published=published,
        )

        session.add(submit)
        session.flush()  # To get the submit.id

        summary_issue = Issue(
            submit_id=submit.id,
            file=None,
            line=None,
            severity="summary",
            explanation=review_result.summary,
        )
        session.add(summary_issue)
        session.flush()

        issue_rating_map: dict[tuple[str, int], tuple[int, int, str]] = {}

        if critiquer_result is not None:
            session.add(AISubmitRating(
                submit_id=submit.id,
                relevance_rating=critiquer_result.summary_rating.relevance_rating,
                quality_rating=critiquer_result.summary_rating.quality_rating,
                comment=critiquer_result.summary_rating.comment,
            ))

            issue_rating_map = {
                (rating.file, rating.line): (
                    rating.relevance_rating,
                    rating.quality_rating,
                    rating.comment,
                )
                for rating in critiquer_result.issue_ratings
            }

        for issue in review_result.issues:
            created_issue = Issue(
                submit_id=submit.id,
                file=issue.file,
                line=issue.line,
                severity=issue.severity.value,
                explanation=issue.explanation,
            )
            session.add(created_issue)
            session.flush()

            rating_key = (issue.file, issue.line)
            if rating_key in issue_rating_map:
                relevance, quality, comment = issue_rating_map[rating_key]
                session.add(AIIssueRating(
                    issue_id=created_issue.id,
                    relevance_rating=relevance,
                    quality_rating=quality,
                    comment=comment,
                ))

        logger.info(
            "Model '%s' analysis with prompt '%s' completed for files at '%s'. Issues found: %d",
            model, prompt_path, source_path, len(review_result.issues)
        )
        session.commit()

        store_job_log(job_id, job_log_handler)
        update_job_status("succeeded", submit_id=submit.id)
    except Exception as exc:
        logger.exception(
            "Model '%s' analysis with prompt '%s' failed for files at '%s'",
            model, prompt_path, source_path
        )
        session.rollback()

        store_job_log(job_id, job_log_handler)
        update_job_status("failed", error=str(exc) or "Analysis failed")
        raise
    finally:
        if job_log_handler is not None:
            logging.getLogger().removeHandler(job_log_handler)
            job_log_handler.close()

        session.close()
