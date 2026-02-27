from dataclasses import dataclass
from enum import Enum
from typing import Any
from typing import List

from serde import field, serde


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


# ---------------------------------------------------------------------------
# File embedding
# ---------------------------------------------------------------------------

@serde
@dataclass
class EmbeddedFile:
    path: str
    language: str
    content: str
    total_lines: int


# ---------------------------------------------------------------------------
# Draft pass (Step 1)
# ---------------------------------------------------------------------------

@serde
@dataclass
class EvidenceItem:
    line: int
    snippet: str
    relevance: str


@serde
@dataclass
class CandidateIssue:
    file: str
    category: str
    severity: str  # "critical" | "major" | "minor" | "informational"
    line: int
    title: str
    reasoning: str
    evidence: List[EvidenceItem]
    why_it_matters: str
    suggested_fix: str
    confidence: str  # "low" | "medium" | "high"
    false_positive_risk: str
    critique_note: str = field(default="")  # populated by the Critique pass


@serde
@dataclass
class DraftStats:
    files: int
    total_lines: int
    candidate_issue_count: int


@serde
@dataclass
class DraftObservation:
    file: str
    note: str


@serde
@dataclass
class DraftResult:
    stats: DraftStats
    reasoning_trace: str
    observations: List[DraftObservation]
    candidate_issues: List[CandidateIssue]


# ---------------------------------------------------------------------------
# Review pass (Step 3) — final output
# ---------------------------------------------------------------------------
@serde
@dataclass
class ReviewIssue:
    file: str
    severity: Severity = field(deserializer=deserialize_severity)
    line: int = field(deserializer=deserialize_int)
    explanation: str = ""


@serde
@dataclass
class ReviewResult:
    summary: str
    issues: List[ReviewIssue]
