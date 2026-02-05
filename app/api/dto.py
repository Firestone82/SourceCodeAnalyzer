from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    model: str = Field(min_length=1)
    prompt_path: str = Field(min_length=1)


class BatchAnalyzeRequest(BaseModel):
    model: str = Field(min_length=1)
    sources: list[str] = Field(default_factory=list)


class IssueRatingRequest(BaseModel):
    rating: int


class PromptNamesResponse(BaseModel):
    prompt_paths: list[str]


class PromptContentResponse(BaseModel):
    prompt_path: str
    content: str


class PromptAnalysisJob(BaseModel):
    job_id: str
    source_path: str


class PromptAnalysisResponse(BaseModel):
    ok: bool
    model: str
    prompt_path: str
    jobs: list[PromptAnalysisJob]


class SourcePathsResponse(BaseModel):
    source_paths: list[str]


class SourceFilesResponse(BaseModel):
    source_path: str
    files: dict[str, str]


class AnalyzeSourceResponse(BaseModel):
    ok: bool
    job_id: str
    source_path: str
    model: str
    prompt_path: str


class SubmitResponse(BaseModel):
    id: int
    model: str
    source_path: str
    prompt_path: str
    files: dict[str, str]
    rated: bool
    created_at: datetime


class SubmitListItemResponse(BaseModel):
    id: int
    model: str
    source_path: str
    prompt_path: str
    rated: bool
    created_at: datetime


class SubmitListResponse(BaseModel):
    items: list[SubmitListItemResponse]
    total: int
    page: int
    page_size: int


class SubmitDetailsIssue(BaseModel):
    id: int
    file: str
    severity: str
    line: int
    explanation: str


class SubmitSummary(BaseModel):
    explanation: str
    rating: Optional[int]
    rated_at: Optional[datetime]


class SubmitIssue(BaseModel):
    id: int
    file: str
    severity: str
    line: int
    explanation: str
    rating: Optional[int]
    rated_at: Optional[datetime]


class SubmitIssuesResponse(BaseModel):
    submit_id: int
    rater_id: int
    summary: SubmitSummary
    issues: list[SubmitIssue]


class RatingResponse(BaseModel):
    id: int
    rater_id: int
    rating: int
    created_at: datetime
    issue_id: int
