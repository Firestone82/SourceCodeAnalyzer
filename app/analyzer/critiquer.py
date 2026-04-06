import json
import logging
from typing import Dict, List

from openai import OpenAI
from openai.types.chat import ChatCompletionSystemMessageParam, ChatCompletionUserMessageParam
from serde import from_dict

from app.analyzer.dto import CritiquerResult, ReviewResult
from app.analyzer.analyzer import embed_text_files, enumerate_file_lines
from app.analyzer.prompt import CRITIQUER_RATING_PROMPT
from app.analyzer.scheme import CRITIQUER_RESULT_SCHEME
from app.analyzer.servers import get_openai_server

logger = logging.getLogger(__name__)


class Critiquer:
    def __init__(
        self,
        model: str,
        files: Dict[str, str],
        openai_server_id: str | None = None,
    ) -> None:
        self.model = model
        self.files = embed_text_files(files)
        openai_server = get_openai_server(openai_server_id)
        self.client = OpenAI(
            api_key=openai_server.api_key,
            base_url=openai_server.base_url,
        )

    def rate_review(self, review_result: ReviewResult) -> CritiquerResult:
        review_payload = {
            "summary": review_result.summary,
            "issues": [
                {
                    "file": issue.file,
                    "line": issue.line,
                    "severity": issue.severity.value,
                    "explanation": issue.explanation,
                }
                for issue in review_result.issues
            ],
        }

        source_lines: List[str] = []
        for embedded_file in self.files:
            source_lines.append(f"### FILE: {embedded_file.path}")
            source_lines.append(f"```{embedded_file.language}")
            source_lines.append(enumerate_file_lines(embedded_file.content))
            source_lines.append("```")

        user_content = (
            "Evaluate this analyzer output and rate its quality.\n\n"
            f"Analyzer output JSON:\n{json.dumps(review_payload, indent=2)}\n\n"
            "Source files:\n"
            + "\n".join(source_lines)
        )

        response = self.client.chat.completions.create(
            model=self.model,
            messages=[
                ChatCompletionSystemMessageParam(content=CRITIQUER_RATING_PROMPT, role="system"),
                ChatCompletionUserMessageParam(content=user_content, role="user"),
            ],
            response_format=CRITIQUER_RESULT_SCHEME,
            temperature=0.1,
            timeout=180,
        )

        content = response.choices[0].message.content
        if content is None:
            raise ValueError("Critiquer returned empty message content")

        logger.info(
            "Critiquer tokens — input: %d, output: %d",
            response.usage.prompt_tokens,
            response.usage.completion_tokens,
        )

        result_json = json.loads(content)
        critiquer_result: CritiquerResult = from_dict(CritiquerResult, result_json)
        logger.info("Critiquer produced %d issue ratings", len(critiquer_result.issue_ratings))
        return critiquer_result
