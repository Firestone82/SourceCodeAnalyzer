from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from app.api.routes import sources, submits, prompts, ratings, auth, jobs, dashboard, raters
from app.database.db import engine
from app.database.models import Base
from app.logging_config import configure_logging
from app.settings import settings

configure_logging()

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Code Analyzer Rating API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sources.router)
app.include_router(submits.router)
app.include_router(prompts.router)
app.include_router(ratings.router)
app.include_router(auth.router)
app.include_router(jobs.router)
app.include_router(dashboard.router)
app.include_router(raters.router)
