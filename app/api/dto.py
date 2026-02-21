from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    model: str = Field(min_length=1)
    prompt_path: str = Field(min_length=1)
    prompt_content: Optional[str] = None


class BatchAnalyzeRequest(BaseModel):
    model: str = Field(min_length=1)
    sources: list[str] = Field(default_factory=list)


class IssueRatingRequest(BaseModel):
    relevance_rating: Optional[int] = None
    quality_rating: Optional[int] = None


class LoginRequest(BaseModel):
    key: str = Field(min_length=1)


class RaterResponse(BaseModel):
    id: int
    name: str
    admin: bool


class PromptNamesResponse(BaseModel):
    prompt_paths: list[str]


class PromptContentResponse(BaseModel):
    prompt_path: str
    content: str


class PromptUpdateRequest(BaseModel):
    content: str


class PromptDeleteResponse(BaseModel):
    prompt_path: str
    deleted: bool


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
    total: Optional[int] = None
    next_offset: Optional[int] = None


class SourceFolderEntry(BaseModel):
    path: str
    has_source: bool


class SourceFoldersResponse(BaseModel):
    folders: list[SourceFolderEntry]


class SourceFolderChildEntry(BaseModel):
    name: str
    path: str
    has_source: bool
    has_children: bool
    source_tag: Optional[str] = None


class SourceFolderChildrenResponse(BaseModel):
    children: list[SourceFolderChildEntry]
    total: Optional[int] = None
    next_offset: Optional[int] = None


class SourceFilesResponse(BaseModel):
    source_path: str
    files: dict[str, str]


class SourceTagRequest(BaseModel):
    tag: str = Field(min_length=1)


class SourceTagResponse(BaseModel):
    source_path: str
    tag: str


class SourceTagDeleteResponse(BaseModel):
    source_path: str
    deleted: bool


class AnalyzeSourceResponse(BaseModel):
    ok: bool
    job_id: str
    source_path: str
    model: str
    prompt_path: str


class JobResponse(BaseModel):
    id: int
    job_id: str
    status: str
    job_type: str
    source_path: Optional[str]
    prompt_path: Optional[str]
    model: Optional[str]
    submit_id: Optional[int]
    error: Optional[str]
    created_at: datetime
    updated_at: datetime


class JobListResponse(BaseModel):
    items: list[JobResponse]
    total: int
    page: int
    page_size: int


class SubmitResponse(BaseModel):
    id: int
    model: str
    source_path: str
    prompt_path: str
    source_tag: Optional[str] = None
    files: dict[str, str]
    rating_state: Literal["not_rated", "partially_rated", "rated"]
    created_at: datetime
    published: bool


class SubmitListItemResponse(BaseModel):
    id: int
    model: str
    source_path: str
    prompt_path: str
    source_tag: Optional[str] = None
    rating_state: Literal["not_rated", "partially_rated", "rated"]
    total_issues: int
    created_at: datetime
    published: bool


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
    id: Optional[int]
    explanation: str
    relevance_rating: Optional[int]
    quality_rating: Optional[int]
    rated_at: Optional[datetime]


class SubmitIssue(BaseModel):
    id: int
    file: str
    severity: str
    line: int
    explanation: str
    relevance_rating: Optional[int]
    quality_rating: Optional[int]
    rated_at: Optional[datetime]


class SubmitIssuesResponse(BaseModel):
    submit_id: int
    rater_id: int
    summary: SubmitSummary
    issues: list[SubmitIssue]


class SubmitPublishRequest(BaseModel):
    published: bool


class SubmitPublishResponse(BaseModel):
    id: int
    published: bool


class SubmitDeleteResponse(BaseModel):
    id: int
    deleted: bool


class RatingResponse(BaseModel):
    id: int
    rater_id: int
    relevance_rating: Optional[int]
    quality_rating: Optional[int]
    created_at: datetime
    issue_id: Optional[int]
