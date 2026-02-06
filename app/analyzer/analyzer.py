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

    def summarize(self) -> ReviewResult:
        client = OpenAI(
            api_key=settings.analyzer_api_key,
            base_url=settings.analyzer_base_url,
        )

        messages = [
            ChatCompletionSystemMessageParam(content=self.system_prompt, role="system"),
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
