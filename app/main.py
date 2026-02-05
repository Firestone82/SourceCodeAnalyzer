from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from app.api.routes import sources, submits, prompts, ratings
from app.database.db import engine
from app.database.models import Base
from app.logging_config import configure_logging

configure_logging()

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Code Analyzer Rating API")

allowed_origins: list[str] = [
    "http://localhost:4200",
    "http://127.0.0.1:4200",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sources.router)
app.include_router(submits.router)
app.include_router(prompts.router)
app.include_router(ratings.router)
