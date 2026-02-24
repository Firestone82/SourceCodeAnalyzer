from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.dto import (
    DashboardStatsResponse,
    DashboardRaterStat,
    DashboardRatingEvent,
    DashboardPromptModelStat,
    DashboardSourceRatingTrend,
    DashboardPromptPerformance,
)
from app.api.security import require_admin
from app.database.db import get_database
from app.database.models import Issue, IssueRating, Rater, Submit, SubmitRating

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/stats")
def get_dashboard_stats(
    session: Session = Depends(get_database),
    current_rater: Rater = Depends(require_admin),
    source_path: str | None = Query(None),
    prompt_path: str | None = Query(None),
    model: str | None = Query(None),
) -> DashboardStatsResponse:
    del current_rater

    summary_fully_rated_subquery = (
        session.query(
            SubmitRating.rater_id.label("rater_id"),
            func.count(SubmitRating.id).label("rated_submits"),
        )
        .join(Submit, Submit.id == SubmitRating.submit_id)
        .filter(Submit.published.is_(True))
        .filter(SubmitRating.relevance_rating.is_not(None), SubmitRating.quality_rating.is_not(None))
        .group_by(SubmitRating.rater_id)
        .subquery()
    )

    raters_rows = (
        session.query(
            Rater.id,
            Rater.name,
            func.coalesce(summary_fully_rated_subquery.c.rated_submits, 0).label("rated_submits"),
        )
        .outerjoin(summary_fully_rated_subquery, summary_fully_rated_subquery.c.rater_id == Rater.id)
        .order_by(Rater.name.asc())
        .all()
    )
    total_submits = session.query(func.count(Submit.id)).filter(Submit.published.is_(True)).scalar() or 0

    raters = [
        DashboardRaterStat(
            rater_id=rater_id,
            rater_name=rater_name,
            rated_submits=rated_submits,
            unrated_submits=max(total_submits - rated_submits, 0),
            rated_percent=0 if total_submits == 0 else round((rated_submits / total_submits) * 100, 2),
        )
        for rater_id, rater_name, rated_submits in raters_rows
    ]

    summary_rows = (
        session.query(
            SubmitRating.submit_id,
            SubmitRating.rater_id,
            SubmitRating.relevance_rating,
            SubmitRating.quality_rating,
            SubmitRating.created_at,
        )
        .all()
    )

    issue_rows = (
        session.query(
            Issue.submit_id,
            IssueRating.rater_id,
            IssueRating.relevance_rating,
            IssueRating.quality_rating,
            IssueRating.created_at,
        )
        .join(Issue, Issue.id == IssueRating.issue_id)
        .all()
    )

    rating_event_map: dict[tuple[int, int], dict] = {}

    for submit_id, rater_id, relevance_rating, quality_rating, rated_at in summary_rows:
        key = (submit_id, rater_id)
        event = rating_event_map.setdefault(
            key,
            {
                "submit_id": submit_id,
                "rater_id": rater_id,
                "rated_at": rated_at,
                "latest_relevance_rating": relevance_rating,
                "latest_quality_rating": quality_rating,
                "relevance_sum": 0.0,
                "relevance_count": 0,
                "quality_sum": 0.0,
                "quality_count": 0,
            },
        )

        if rated_at > event["rated_at"]:
            event["rated_at"] = rated_at
            event["latest_relevance_rating"] = relevance_rating
            event["latest_quality_rating"] = quality_rating

        if relevance_rating is not None:
            event["relevance_sum"] += float(relevance_rating)
            event["relevance_count"] += 1

        if quality_rating is not None:
            event["quality_sum"] += float(quality_rating)
            event["quality_count"] += 1

    for submit_id, rater_id, relevance_rating, quality_rating, rated_at in issue_rows:
        key = (submit_id, rater_id)
        event = rating_event_map.setdefault(
            key,
            {
                "submit_id": submit_id,
                "rater_id": rater_id,
                "rated_at": rated_at,
                "latest_relevance_rating": relevance_rating,
                "latest_quality_rating": quality_rating,
                "relevance_sum": 0.0,
                "relevance_count": 0,
                "quality_sum": 0.0,
                "quality_count": 0,
            },
        )

        if rated_at > event["rated_at"]:
            event["rated_at"] = rated_at
            event["latest_relevance_rating"] = relevance_rating
            event["latest_quality_rating"] = quality_rating

        if relevance_rating is not None:
            event["relevance_sum"] += float(relevance_rating)
            event["relevance_count"] += 1

        if quality_rating is not None:
            event["quality_sum"] += float(quality_rating)
            event["quality_count"] += 1

    if rating_event_map:
        submit_ids = {item["submit_id"] for item in rating_event_map.values()}
        rater_ids = {item["rater_id"] for item in rating_event_map.values()}

        submits = {
            submit.id: submit
            for submit in session.query(Submit).filter(Submit.id.in_(submit_ids)).all()
        }
        raters_map = {
            rater.id: rater
            for rater in session.query(Rater).filter(Rater.id.in_(rater_ids)).all()
        }
    else:
        submits = {}
        raters_map = {}

    rating_events = []
    for item in rating_event_map.values():
        submit = submits.get(item["submit_id"])
        rater = raters_map.get(item["rater_id"])
        if submit is None or rater is None:
            continue

        if source_path and source_path.strip() and submit.source_path != source_path.strip():
            continue
        if prompt_path and prompt_path.strip() and submit.prompt_path != prompt_path.strip():
            continue
        if model and model.strip() and submit.model != model.strip():
            continue

        avg_relevance = (
            None
            if item["relevance_count"] == 0
            else round(item["relevance_sum"] / item["relevance_count"], 2)
        )
        avg_quality = (
            None
            if item["quality_count"] == 0
            else round(item["quality_sum"] / item["quality_count"], 2)
        )

        rating_events.append(
            DashboardRatingEvent(
                submit_id=submit.id,
                rater_id=rater.id,
                rater_name=rater.name,
                source_path=submit.source_path,
                prompt_path=submit.prompt_path,
                model=submit.model,
                relevance_rating=item["latest_relevance_rating"],
                quality_rating=item["latest_quality_rating"],
                submit_avg_relevance_rating=avg_relevance,
                submit_avg_quality_rating=avg_quality,
                rated_at=item["rated_at"],
            )
        )

    rating_events.sort(key=lambda event: event.rated_at, reverse=True)
    rating_events = rating_events[:200]

    complex_rating_expr = (
        (func.avg(SubmitRating.relevance_rating) + func.avg(SubmitRating.quality_rating)) / 2
    )

    prompt_model_rows = (
        session.query(
            Submit.prompt_path,
            Submit.model,
            func.avg(SubmitRating.relevance_rating),
            func.avg(SubmitRating.quality_rating),
            complex_rating_expr,
            func.count(SubmitRating.id),
        )
        .join(SubmitRating, SubmitRating.submit_id == Submit.id)
        .group_by(Submit.prompt_path, Submit.model)
        .order_by(complex_rating_expr.desc().nullslast(), func.count(SubmitRating.id).desc())
        .all()
    )

    prompt_model_stats = [
        DashboardPromptModelStat(
            prompt_path=prompt,
            model=model_name,
            avg_relevance_rating=None if avg_rel is None else round(float(avg_rel), 2),
            avg_quality_rating=None if avg_qual is None else round(float(avg_qual), 2),
            complex_rating=None if complex_rating is None else round(float(complex_rating), 2),
            ratings_count=ratings_count,
        )
        for prompt, model_name, avg_rel, avg_qual, complex_rating, ratings_count in prompt_model_rows
    ]

    source_trend_query = (
        session.query(
            Submit.source_path,
            func.avg(SubmitRating.relevance_rating),
            func.avg(SubmitRating.quality_rating),
            complex_rating_expr,
            func.count(func.distinct(SubmitRating.rater_id)),
            func.max(SubmitRating.created_at),
        )
        .join(SubmitRating, SubmitRating.submit_id == Submit.id)
    )
    if source_path and source_path.strip():
        source_trend_query = source_trend_query.filter(Submit.source_path == source_path.strip())
    if prompt_path and prompt_path.strip():
        source_trend_query = source_trend_query.filter(Submit.prompt_path == prompt_path.strip())
    if model and model.strip():
        source_trend_query = source_trend_query.filter(Submit.model == model.strip())

    source_trend_rows = (
        source_trend_query
        .group_by(Submit.source_path)
        .order_by(complex_rating_expr.desc().nullslast(), func.count(func.distinct(SubmitRating.rater_id)).desc(), Submit.source_path.asc())
        .all()
    )

    source_rating_trends = [
        DashboardSourceRatingTrend(
            source_path=src,
            avg_relevance_rating=None if avg_rel is None else round(float(avg_rel), 2),
            avg_quality_rating=None if avg_qual is None else round(float(avg_qual), 2),
            avg_score=None if complex_rating is None else round(float(complex_rating), 2),
            ratings_count=ratings_count,
            last_rated_at=last_rated_at,
        )
        for src, avg_rel, avg_qual, complex_rating, ratings_count, last_rated_at in source_trend_rows
    ]

    prompt_performance_rows = (
        session.query(
            Submit.prompt_path,
            complex_rating_expr,
            func.count(SubmitRating.id),
        )
        .join(SubmitRating, SubmitRating.submit_id == Submit.id)
        .group_by(Submit.prompt_path)
        .order_by(complex_rating_expr.desc().nullslast())
        .all()
    )
    prompt_performance = [
        DashboardPromptPerformance(
            prompt_path=prompt,
            complex_rating=None if complex_rating is None else round(float(complex_rating), 2),
            ratings_count=ratings_count,
        )
        for prompt, complex_rating, ratings_count in prompt_performance_rows
    ]

    return DashboardStatsResponse(
        raters=raters,
        rating_events=rating_events,
        prompt_model_stats=prompt_model_stats,
        source_rating_trends=source_rating_trends,
        prompt_performance=prompt_performance,
    )
