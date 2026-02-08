import json
import logging
from time import time
from typing import List

from openai import OpenAI
from openai.types.chat import ChatCompletionUserMessageParam, ChatCompletionSystemMessageParam
from openai.types.shared_params import ResponseFormatJSONObject
from serde import from_dict

from app.analyzer.dto import EmbeddedFile, ReviewResult
from app.settings import settings

logger = logging.getLogger(__name__)

DEFAULT_PROMPT_SUFFIX = """
    Return a **single JSON object** with this structure:
    
    ```json
    {
        "summary": "A concise overview (3–5 sentences) describing overall correctness, key positives, and notable negatives.",
        "issues": [
            {
                "file": "name of the file where issue is found",
                "severity": "critical | high | medium | low",
                "line": "line number where issue occurs",
                "explanation": "Clear, factual description of what is wrong and why it matters (in 1–3 sentences)."
            }
        ]
    }
    ```
    Use severity to indicate impact:
    - **critical** — Causes undefined behavior or data corruption.
    - **high** — Causes program to produce incorrect results or crash.
    - **medium** — Causes significant but not catastrophic performance or logical issues.
    - **low** — Minor inefficiencies or edge-case correctness problems.
"""


def enumerate_file_lines(content: str) -> str:
    return "\n".join(f"{i + 1}: {line}" for i, line in enumerate(content.splitlines()))


class Analyzer:
    def __init__(self, model: str, files: List[EmbeddedFile], system_prompt: str):
        self.model = model
        self.files = files
        self.system_prompt = system_prompt

    def build_user_content(self) -> str:
        lines: List[str] = []

        for file in self.files:
            lines.append(f"\n### FILE: {file.path}")
            lines.append(f"```{file.language}")
            lines.append(enumerate_file_lines(file.content))
            lines.append("```")

        return "\n".join(lines)

    def build_system_content(self) -> str:
        return f"""
        {self.system_prompt}
        
        {DEFAULT_PROMPT_SUFFIX}
        """

    def summarize(self) -> ReviewResult:
        client = OpenAI(
            api_key=settings.analyzer_api_key,
            base_url=settings.analyzer_base_url,
        )

        messages = [
            ChatCompletionSystemMessageParam(content=self.build_system_content(), role="system"),
            ChatCompletionUserMessageParam(content=self.build_user_content(), role="user"),
        ]

        logger.info(f"Sending {len(self.files)} file(s) to model '{self.model}'...")
        start_time = time()

        response = client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=0.2,
            response_format=ResponseFormatJSONObject(type="json_object"),
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
