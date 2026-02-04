from fastapi import FastAPI

from app.api.routes import sources, submits, prompts, ratings
from app.database.db import engine
from app.database.models import Base
from app.logging_config import configure_logging

configure_logging()

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Code Analyzer Rating API")

app.include_router(sources.router)
app.include_router(submits.router)
app.include_router(prompts.router)
app.include_router(ratings.router)
