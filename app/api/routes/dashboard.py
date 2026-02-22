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
from app.database.models import Rater, Submit, SubmitRating

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
    total_submits = session.query(func.count(Submit.id)).scalar() or 0

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

    events_query = (
        session.query(SubmitRating, Submit, Rater)
        .join(Submit, Submit.id == SubmitRating.submit_id)
        .join(Rater, Rater.id == SubmitRating.rater_id)
    )
    if source_path and source_path.strip():
        events_query = events_query.filter(Submit.source_path == source_path.strip())
    if prompt_path and prompt_path.strip():
        events_query = events_query.filter(Submit.prompt_path == prompt_path.strip())
    if model and model.strip():
        events_query = events_query.filter(Submit.model == model.strip())

    events_rows = events_query.order_by(SubmitRating.created_at.desc()).limit(200).all()
    rating_events = [
        DashboardRatingEvent(
            submit_id=submit.id,
            rater_id=rater.id,
            rater_name=rater.name,
            source_path=submit.source_path,
            prompt_path=submit.prompt_path,
            model=submit.model,
            relevance_rating=submit_rating.relevance_rating,
            quality_rating=submit_rating.quality_rating,
            rated_at=submit_rating.created_at,
        )
        for submit_rating, submit, rater in events_rows
    ]

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
            Submit.prompt_path,
            Submit.model,
            func.avg(SubmitRating.relevance_rating),
            func.avg(SubmitRating.quality_rating),
            complex_rating_expr,
            func.count(SubmitRating.id),
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
        .group_by(Submit.source_path, Submit.prompt_path, Submit.model)
        .order_by(Submit.source_path.asc(), complex_rating_expr.desc().nullslast())
        .all()
    )

    source_rating_trends = [
        DashboardSourceRatingTrend(
            source_path=src,
            prompt_path=prompt,
            model=model_name,
            avg_relevance_rating=None if avg_rel is None else round(float(avg_rel), 2),
            avg_quality_rating=None if avg_qual is None else round(float(avg_qual), 2),
            complex_rating=None if complex_rating is None else round(float(complex_rating), 2),
            ratings_count=ratings_count,
        )
        for src, prompt, model_name, avg_rel, avg_qual, complex_rating, ratings_count in source_trend_rows
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
