from dataclasses import dataclass
from enum import Enum
from typing import List, Any, Literal

from serde import serde, field


@serde
@dataclass
class EmbeddedFile:
    path: str
    language: str
    content: str
    total_lines: int = 0


class Severity(Enum):
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


def deserialize_int(value: Any) -> int:
    if isinstance(value, int):
        return value

    if isinstance(value, str):
        stripped_value: str = value.strip()

        if stripped_value.isdigit() or (stripped_value.startswith("-") and stripped_value[1:].isdigit()):
            return int(stripped_value)

    raise ValueError(f"Invalid int value: {value!r}")


def deserialize_severity(value: Any) -> Severity:
    if isinstance(value, Severity):
        return value

    if isinstance(value, str):
        normalized_value: str = value.strip().lower()

        for severity in Severity:
            if normalized_value == severity.value or normalized_value == severity.name.lower():
                return severity

    raise ValueError(f"Invalid severity: {value!r}")


@serde
@dataclass
class ReviewIssue:
    file: str
    line: int = field(deserializer=deserialize_int)
    severity: Severity = field(deserializer=deserialize_severity)
    explanation: str = ""


@serde
@dataclass
class ReviewResult:
    summary: str
    issues: List[ReviewIssue]


@dataclass
class DraftStats:
    files: int
    total_lines: int
    candidate_issue_count: int


@dataclass
class DraftObservation:
    file: str
    note: str


@dataclass
class DraftEvidenceItem:
    line: int
    snippet: str


@dataclass
class DraftCandidateIssue:
    file: str
    category: str
    line: int
    title: str
    evidence: List[DraftEvidenceItem]
    why_it_matters: str
    suggested_fix: str
    confidence: Literal["low", "medium", "high"]


@dataclass
class DraftResult:
    stats: DraftStats
    observations: List[DraftObservation]
    candidate_issues: List[DraftCandidateIssue]
