import json
import logging
from time import time
from typing import List, Any, Dict

from openai import OpenAI
from openai.types.chat import ChatCompletionSystemMessageParam, ChatCompletionUserMessageParam
from openai.types.shared_params import ResponseFormatJSONSchema
from serde import from_dict

from app.analyzer.dto import EmbeddedFile, ReviewResult
from app.settings import settings

logger = logging.getLogger(__name__)


def enumerate_file_lines(content: str) -> str:
    return "\n".join(f"{index + 1}: {line}" for index, line in enumerate(content.splitlines()))


class Analyzer:
    def __init__(self, model: str, files: List[EmbeddedFile], system_prompt: str):
        self.model = model
        self.files = files
        self.system_prompt = system_prompt

    def build_user_content(self) -> str:
        user_content_lines: List[str] = []

        for embedded_file in self.files:
            user_content_lines.append(f"\n### FILE: {embedded_file.path}")
            user_content_lines.append(f"```{embedded_file.language}")
            user_content_lines.append(enumerate_file_lines(embedded_file.content))
            user_content_lines.append("```")

        return "\n".join(user_content_lines)

    def summarize(self) -> ReviewResult:
        client = OpenAI(
            api_key=settings.analyzer_api_key,
            base_url=settings.analyzer_base_url,
        )

        json_scheme: ResponseFormatJSONSchema = {
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

        logger.info(f"Sending {len(self.files)} file(s) to model '{self.model}'...")
        start_time = time()

        response = client.chat.completions.create(
            model=self.model,
            messages=[
                ChatCompletionSystemMessageParam(content=self.system_prompt, role="system"),
                ChatCompletionUserMessageParam(content=self.build_user_content(), role="user"),
            ],
            temperature=0.2,
            response_format=json_scheme
        )

        elapsed = time() - start_time
        logger.info(f"Model responded in {elapsed:.2f} seconds")

        try:
            output_text = response.choices[0].message.content
            output_json = json.loads(output_text)

            result: ReviewResult = from_dict(ReviewResult, output_json)
            return result
        except Exception as e:
            logger.error(f"Failed to parse model response: {e}")
            logger.info(f"Raw response content: {response.choices[0].message.content}")
            raise
