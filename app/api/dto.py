from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    model: str = Field(min_length=1)
    prompt_name: str = Field(min_length=1)


class BatchAnalyzeRequest(BaseModel):
    model: str = Field(min_length=1)
    sources: list[str] = Field(default_factory=list)


class IssueRatingRequest(BaseModel):
    rating: int


class PromptNamesResponse(BaseModel):
    prompt_names: list[str]


class PromptContentResponse(BaseModel):
    prompt_name: str
    content: str


class PromptAnalysisJob(BaseModel):
    job_id: str
    source_path: str


class PromptAnalysisResponse(BaseModel):
    ok: bool
    model: str
    prompt_name: str
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
    prompt_name: str


class SubmitResponse(BaseModel):
    id: int
    model: str
    summary: str
    created_at: datetime


class SubmitDetailsIssue(BaseModel):
    id: int
    file: str
    severity: str
    line: int
    explanation: str


class SubmitDetailsResponse(BaseModel):
    files: dict[str, str]
    issues: list[SubmitDetailsIssue]


class SubmitSuggestionsSummary(BaseModel):
    explanation: str
    rating: Optional[int]
    rated_at: Optional[datetime]


class SubmitSuggestionsItem(BaseModel):
    id: int
    file: str
    severity: str
    line: int
    explanation: str
    rating: Optional[int]
    rated_at: Optional[datetime]


class SubmitSuggestionsResponse(BaseModel):
    submit_id: int
    rater_id: int
    summary: SubmitSuggestionsSummary
    suggestions: list[SubmitSuggestionsItem]


class RatingResponse(BaseModel):
    id: int
    rater_id: int
    rating: int
    created_at: datetime

class SubmitRatingResponse(RatingResponse):
    submit_id: int

class IssueRatingResponse(RatingResponse):
    issue_id: int