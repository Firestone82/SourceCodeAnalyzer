from openai.types.shared_params import ResponseFormatJSONSchema

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
            "required": ["stats", "observations", "candidate_issues"],
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
                "observations": {
                    "type": "array",
                    "description": "Non-binding notes that might be useful to the verifier pass.",
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
                        "that must be filtered by the verifier pass."
                    ),
                    "items": {
                        "type": "object",
                        "additionalProperties": False,
                        "required": [
                            "file",
                            "category",
                            "line",
                            "title",
                            "evidence",
                            "why_it_matters",
                            "suggested_fix",
                            "confidence",
                        ],
                        "properties": {
                            "file": {"type": "string"},
                            "category": {
                                "type": "string",
                                "description": "General category of the issue, e.g. 'undefined behavior', 'security vulnerability', 'performance problem', etc.",
                            },
                            "line": {
                                "type": "integer",
                                "minimum": 1
                            },
                            "title": {
                                "type": "string"
                            },
                            "evidence": {
                                "type": "array",
                                "description": (
                                    "Concrete anchors: cite specific line numbers and snippets "
                                    "from the enumerated source."
                                ),
                                "minItems": 1,
                                "items": {
                                    "type": "object",
                                    "additionalProperties": False,
                                    "required": ["line", "snippet"],
                                    "properties": {
                                        "line": {
                                            "type": "integer",
                                            "minimum": 1
                                        },
                                        "snippet": {
                                            "type": "string"
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
                        },
                    },
                },
            },
        },
    },
}

REVIEW_RESULT_SCHEME: ResponseFormatJSONSchema = {
    "type": "json_schema",
    "json_schema": {
        "name": "ReviewResult",
        "description": "A concise review summary plus a list of issues found in the provided files.",
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
                    "description": "List of detected issues.",
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
                                "description": "1-based line number where the issue occurs.",
                            },
                            "explanation": {
                                "type": "string",
                                "description": "1–3 sentences explaining what is wrong and why it matters.",
                            }
                        },
                    },
                },
            },
        },
    },
}
