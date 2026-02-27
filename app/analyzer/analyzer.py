import json
import logging
from pathlib import Path
from time import time
from typing import List, TypeVar, Any, Dict, Tuple

from openai import OpenAI
from openai.types.chat import (
    ChatCompletionAssistantMessageParam,
    ChatCompletionSystemMessageParam,
    ChatCompletionUserMessageParam,
)
from serde import from_dict, to_dict

from app.analyzer.dto import DraftResult, EmbeddedFile, ReviewResult
from app.analyzer.prompt import REVIEW_ANALYSIS_PROMPT
from app.analyzer.scheme import DRAFT_RESULT_SCHEME, REVIEW_RESULT_SCHEME
from app.settings import settings

logger = logging.getLogger(__name__)

ResultType = TypeVar("ResultType")


def detect_language(file_path: str) -> str:
    ext = Path(file_path).suffix.lower()
    mapping = {
        ".c": "c",
        ".cpp": "cpp",
        ".cc": "cpp",
        ".h": "c",
        ".hpp": "cpp",
        ".py": "python",
        ".java": "java",
        ".js": "javascript",
        ".ts": "typescript",
    }
    return mapping.get(ext, "text")


def enumerate_file_lines(content: str) -> str:
    return "\n".join(f"{index + 1}: {line}" for index, line in enumerate(content.splitlines()))


def embed_text_files(files: Dict[str, str]) -> List[EmbeddedFile]:
    embedded: List[EmbeddedFile] = []
    total_chars: int = 0

    logger.info(f"Embedding {len(files)} files")

    for file_path, content in sorted(files.items(), key=lambda item: item[0]):
        total_chars += len(content)
        total_lines = content.count("\n") + 1

        language: str = detect_language(file_path)
        if language == "text":
            logger.info(f"- Skipping {file_path}: unsupported file type")
            continue

        embedded.append(EmbeddedFile(
            path=file_path,
            language=language,
            content=content,
            total_lines=total_lines,
        ))

    return embedded


class Analyzer:
    def __init__(self, model: str, files: Dict[str, str], draft_prompt: str, language: str | None = None) -> None:
        self.model = model
        self.files = embed_text_files(files)
        self.draft_prompt = draft_prompt
        self.language = language
        self.client = OpenAI(
            api_key=settings.analyzer_api_key,
            base_url=settings.analyzer_base_url,
        )

    def summarize(self) -> ReviewResult:
        logger.info("Starting analysis on %d files...", len(self.files))
        analysis_start_time = time()

        user_content: str = "\n".join(
            line
            for embedded_file in self.files
            for line in (
                f"\n### FILE: {embedded_file.path}",
                f"```{embedded_file.language}",
                enumerate_file_lines(embedded_file.content),
                "```",
            )
        )

        draft_result: DraftResult = self.run_draft_analysis(user_content)
        review_result: ReviewResult = self.run_review_analysis(user_content, draft_result)

        if self.language:
            review_result = self.translate_review_result(review_result)

        total_elapsed_seconds: float = time() - analysis_start_time
        logger.info("Source code review completed. Total elapsed time: %.2f seconds. Issues found: %d",
                    total_elapsed_seconds, len(review_result.issues))
        return review_result

    # -------------------------
    # Pipeline steps
    # -------------------------

    def run_draft_analysis(self, user_content: str) -> DraftResult:
        elapsed, draft_text = self.timed_chat_completion(
            step_name="Draft analysis",
            messages=[
                ChatCompletionSystemMessageParam(content=self.draft_prompt, role="system"),
                ChatCompletionUserMessageParam(content=user_content, role="user"),
            ],
            response_format=DRAFT_RESULT_SCHEME,
            temperature=0.3,
        )

        draft_result: DraftResult = self.parse_typed_json(
            raw_text=draft_text,
            target_type=DraftResult,
            error_context="draft JSON",
        )

        logger.info("Draft analysis completed in %d seconds. Identified %d candidate issues.",
                    elapsed, len(draft_result.candidate_issues))
        logger.debug(json.dumps(to_dict(draft_result), indent=2))
        return draft_result

    def run_review_analysis(self, user_content: str, draft_result: DraftResult) -> ReviewResult:
        draft_json = json.dumps(to_dict(draft_result), indent=2)
        draft_content: str = f"""\n 
        Thought process and candidate issues identified by the model: {draft_json} 
        """

        elapsed, review_text = self.timed_chat_completion(
            step_name="Review analysis",
            messages=[
                ChatCompletionSystemMessageParam(content=REVIEW_ANALYSIS_PROMPT, role="system"),
                ChatCompletionUserMessageParam(content=user_content, role="user"),
                ChatCompletionAssistantMessageParam(content=draft_content, role="assistant"),
                ChatCompletionUserMessageParam(
                    content="""
                        Verify the draft issues against the code. Keep only deterministic valid issues and output final JSON.
                        The `summary` must evaluate the whole codebase quality and must not be a list/recap of issues.
                    """,
                    role="user",
                ),
            ],
            response_format=REVIEW_RESULT_SCHEME,
            temperature=0.1,
        )

        review_result: ReviewResult = self.parse_typed_json(
            raw_text=review_text,
            target_type=ReviewResult,
            error_context="review JSON",
        )

        logger.info("Review analysis completed in %d seconds. Final issues count: %d",
                    elapsed, len(review_result.issues))
        logger.debug(json.dumps(to_dict(review_result), indent=2))
        return review_result

    def translate_review_result(self, review_result: ReviewResult) -> ReviewResult:
        review_json = json.dumps(to_dict(review_result), indent=2)
        review_content = f"""\n 
        Final verified issues after reviewing the draft: {review_json} 
        """

        elapsed, translated_text = self.timed_chat_completion(
            step_name="Translation",
            messages=[
                ChatCompletionSystemMessageParam(
                    content="Translate review response into Czech language. You *must* preserve technical details and formatting",
                    role="system",
                ),
                ChatCompletionUserMessageParam(content=review_content, role="user"),
            ],
            response_format=REVIEW_RESULT_SCHEME,
            temperature=0.1,
        )

        translated_result: ReviewResult = self.parse_typed_json(
            raw_text=translated_text,
            target_type=ReviewResult,
            error_context="translated JSON",
        )

        logger.info("Translation completed in %d seconds.", elapsed)
        return translated_result

    # -------------------------
    # Shared helpers
    # -------------------------

    def timed_chat_completion(
            self,
            step_name: str,
            messages: List[
                ChatCompletionSystemMessageParam
                | ChatCompletionUserMessageParam
                | ChatCompletionAssistantMessageParam
                ],
            response_format,
            temperature: float,
    ) -> Tuple[float, str]:
        step_start_time: float = time()

        response = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            response_format=response_format,
            temperature=temperature,
        )

        elapsed_seconds: float = time() - step_start_time
        message_content: str | None = response.choices[0].message.content

        if message_content is None:
            raise ValueError(f"{step_name} returned empty message content.")

        return elapsed_seconds, message_content

    def parse_typed_json(self, raw_text: str, target_type: type[ResultType], error_context: str) -> ResultType:
        try:
            parsed_json: Dict[str, Any] = json.loads(raw_text)
        except Exception as exception:
            logger.error("Failed to parse %s: %s", error_context, exception)
            logger.info("Raw model response content: %s", raw_text)
            raise

        try:
            typed_result: ResultType = from_dict(target_type, parsed_json)
            return typed_result
        except Exception as exception:
            logger.error("Failed to convert %s into %s: %s", error_context, target_type.__name__, exception)
            logger.info("Parsed JSON payload: %s", json.dumps(parsed_json, indent=2))
            raise
