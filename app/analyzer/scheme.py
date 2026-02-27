from openai.types.shared_params import ResponseFormatJSONSchema

# Candidate issue schema shared between Draft and Critique passes
_CANDIDATE_ISSUE_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "required": [
        "file",
        "category",
        "severity",
        "line",
        "title",
        "reasoning",
        "evidence",
        "why_it_matters",
        "suggested_fix",
        "confidence",
        "false_positive_risk",
    ],
    "properties": {
        "file": {
            "type": "string",
            "description": "Name/path of the file where the issue was found.",
        },
        "category": {
            "type": "string",
            "description": "Normalized category for easier filtering in the verifier pass.",
        },
        "severity": {
            "type": "string",
            "enum": ["critical", "major", "minor", "informational"],
            "description": "Estimated impact if the issue is real.",
        },
        "line": {
            "type": "integer",
            "minimum": 1,
            "description": (
                "1-based line number of the FIRST token directly responsible for the defect. "
                "Must not be a closing brace, blank line, or comment. "
                "If multiple lines are involved, put the earliest causal line here "
                "and reference the others inside the explanation text."
            ),
        },
        "title": {"type": "string"},
        "reasoning": {
            "type": "string",
            "description": (
                "Step-by-step reasoning specific to THIS issue: "
                "why you believe it's a problem, what conditions trigger it, "
                "and what you're uncertain about. Written before the conclusion."
            ),
        },
        "evidence": {
            "type": "array",
            "description": "Concrete anchors: cite specific line numbers and snippets from the enumerated source.",
            "minItems": 1,
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["line", "snippet", "relevance"],
                "properties": {
                    "line": {
                        "type": "integer",
                        "minimum": 1,
                        "description": (
                            "1-based line number of the FIRST token directly responsible for the defect. "
                            "Must not be a closing brace, blank line, or comment. "
                            "If multiple lines are involved, put the earliest causal line here "
                            "and reference the others inside the explanation text."
                        ),
                    },
                    "snippet": {"type": "string"},
                    "relevance": {
                        "type": "string",
                        "description": "One sentence explaining why this snippet is evidence for the issue.",
                    },
                },
            },
        },
        "why_it_matters": {"type": "string"},
        "suggested_fix": {"type": "string"},
        "confidence": {
            "type": "string",
            "enum": ["low", "medium", "high"],
        },
        "false_positive_risk": {
            "type": "string",
            "description": (
                "Specific scenario in which this issue might NOT be real. "
                "Forces explicit doubt before the verifier pass."
            ),
        },
        "critique_note": {
            "type": "string",
            "description": (
                "Added by the critique pass: one sentence explaining any remaining doubt "
                "about this issue after peer review. Empty string if fully confirmed."
            ),
        },
    },
}

DRAFT_RESULT_SCHEME: ResponseFormatJSONSchema = {
    "type": "json_schema",
    "json_schema": {
        "name": "DraftResult",
        "description": (
            "Structured draft analysis: candidate issues (may include false positives) "
            "with concrete evidence so a second pass can verify and filter."
        ),
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "required": ["stats", "reasoning_trace", "observations", "candidate_issues"],
            "properties": {
                "stats": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["files", "total_lines", "candidate_issue_count"],
                    "properties": {
                        "files": {"type": "integer", "minimum": 0},
                        "total_lines": {"type": "integer", "minimum": 0},
                        "candidate_issue_count": {"type": "integer", "minimum": 0},
                    },
                },
                "reasoning_trace": {
                    "type": "string",
                    "description": (
                        "Free-form scratchpad written BEFORE populating candidate_issues. "
                        "Must follow the 7-step chain-of-thought defined in the system prompt."
                    ),
                },
                "observations": {
                    "type": "array",
                    "description": "Non-binding notes that might be useful to later passes.",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["file", "note"],
                        "properties": {
                            "file": {"type": "string"},
                            "note": {"type": "string"},
                        },
                    },
                },
                "candidate_issues": {
                    "type": "array",
                    "description": (
                        "Potential issues with concrete evidence. May include uncertain items "
                        "that must be filtered by the critique and verifier passes."
                    ),
                    "items": _CANDIDATE_ISSUE_SCHEMA,
                },
            },
        },
    },
}

# Critique pass reuses the DraftResult shape so the verifier receives a consistent format
CRITIQUE_RESULT_SCHEME: ResponseFormatJSONSchema = {
    "type": "json_schema",
    "json_schema": {
        "name": "CritiqueResult",
        "description": (
            "Peer-reviewed version of the draft: false positives removed, "
            "uncertain items annotated, missed issues added."
        ),
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "required": ["stats", "reasoning_trace", "observations", "candidate_issues"],
            "properties": {
                "stats": {
                    "type": "object",
                    "additionalProperties": False,
                    "required": ["files", "total_lines", "candidate_issue_count"],
                    "properties": {
                        "files": {"type": "integer", "minimum": 0},
                        "total_lines": {"type": "integer", "minimum": 0},
                        "candidate_issue_count": {"type": "integer", "minimum": 0},
                    },
                },
                "reasoning_trace": {
                    "type": "string",
                    "description": "Original trace plus critique verdicts appended.",
                },
                "observations": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["file", "note"],
                        "properties": {
                            "file": {
                                "type": "string",
                                "description": "Filename/path this observation pertains to.",
                            },
                            "note": {
                                "type": "string",
                            },
                        },
                    },
                },
                "candidate_issues": {
                    "type": "array",
                    "description": "Surviving issues after false positives are removed and new issues are added.",
                    "items": _CANDIDATE_ISSUE_SCHEMA,
                },
            },
        },
    },
}

REVIEW_RESULT_SCHEME: ResponseFormatJSONSchema = {
    "type": "json_schema",
    "json_schema": {
        "name": "ReviewResult",
        "description": "A concise review summary plus a list of verified issues found in the provided files.",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "required": ["summary", "issues"],
            "properties": {
                "summary": {
                    "type": "string",
                    "description": "3–5 sentences describing overall correctness, key positives, and notable negatives.",
                },
                "issues": {
                    "type": "array",
                    "description": "Final list of verified issues.",
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": ["file", "severity", "line", "explanation"],
                        "properties": {
                            "file": {
                                "type": "string",
                                "description": "Name/path of the file where the issue was found.",
                            },
                            "severity": {
                                "type": "string",
                                "enum": ["critical", "high", "medium", "low"],
                                "description": "Severity of the issue.",
                            },
                            "line": {
                                "type": "integer",
                                "minimum": 1,
                                "description": (
                                    "1-based line number of the FIRST token directly responsible for the defect. "
                                    "Must not be a closing brace, blank line, or comment. "
                                    "If multiple lines are involved, put the earliest causal line here "
                                    "and reference the others inside the explanation text."
                                ),
                            },
                            "explanation": {
                                "type": "string",
                                "description": "1–3 sentences explaining what is wrong, why it matters, and how to fix it.",
                            },
                        },
                    },
                },
            },
        },
    },
}