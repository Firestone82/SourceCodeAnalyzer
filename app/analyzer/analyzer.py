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
from app.analyzer.prompt import CRITIQUE_PROMPT, REVIEW_ANALYSIS_PROMPT
from app.analyzer.scheme import DRAFT_RESULT_SCHEME, CRITIQUE_RESULT_SCHEME, REVIEW_RESULT_SCHEME
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

        user_content: str = self.build_user_content()
        logger.warning(f"User content: {user_content}")

        # Step 1 — Draft: broad sweep with chain-of-thought scratchpad
        draft_result: DraftResult = self.run_draft_analysis(user_content)

        # Step 2 — Critique: peer-review the draft, remove false positives
        critique_result: DraftResult = self.run_critique_analysis(user_content, draft_result)

        # Step 3 — Review: produce final authoritative output from surviving issues
        review_result: ReviewResult = self.run_review_analysis(user_content, critique_result)

        if self.language:
            review_result = self.translate_review_result(review_result)

        # Step 4 — Post-process: normalize filenames to match known paths exactly
        review_result = self.normalize_issue_filenames(review_result)

        total_elapsed_seconds: float = time() - analysis_start_time
        logger.info(
            "Source code review completed. Total elapsed time: %.2f seconds. Issues found: %d",
            total_elapsed_seconds,
            len(review_result.issues),
        )
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

        logger.info(
            "Draft analysis completed in %d seconds. Identified %d candidate issues.",
            elapsed,
            len(draft_result.candidate_issues),
        )
        logger.warning(json.dumps(to_dict(draft_result), indent=2))
        return draft_result

    def run_critique_analysis(self, user_content: str, draft_result: DraftResult) -> DraftResult:
        draft_json = json.dumps(to_dict(draft_result), indent=2)
        draft_content: str = f"Draft analysis to critique:\n{draft_json}"

        elapsed, critique_text = self.timed_chat_completion(
            step_name="Critique analysis",
            messages=[
                ChatCompletionSystemMessageParam(content=CRITIQUE_PROMPT, role="system"),
                # Source code so the model can re-read lines while challenging each issue
                ChatCompletionUserMessageParam(content=user_content, role="user"),
                ChatCompletionAssistantMessageParam(content=draft_content, role="assistant"),
                ChatCompletionUserMessageParam(
                    content=(
                        "Challenge every candidate issue. Remove false positives, annotate uncertain ones. "
                        "Output the updated DraftResult JSON."
                    ),
                    role="user",
                ),
            ],
            response_format=CRITIQUE_RESULT_SCHEME,
            temperature=0.2,
        )

        critique_result: DraftResult = self.parse_typed_json(
            raw_text=critique_text,
            target_type=DraftResult,
            error_context="critique JSON",
        )

        logger.info(
            "Critique completed in %d seconds. Surviving issues: %d (was %d after draft).",
            elapsed,
            len(critique_result.candidate_issues),
            len(draft_result.candidate_issues),
        )
        logger.warning(json.dumps(to_dict(critique_result), indent=2))
        return critique_result

    def run_review_analysis(self, user_content: str, critique_result: DraftResult) -> ReviewResult:
        critique_json = json.dumps(to_dict(critique_result), indent=2)
        critique_content: str = f"Peer-reviewed candidate issues:\n{critique_json}"

        elapsed, review_text = self.timed_chat_completion(
            step_name="Review analysis",
            messages=[
                ChatCompletionSystemMessageParam(content=REVIEW_ANALYSIS_PROMPT, role="system"),
                ChatCompletionUserMessageParam(content=user_content, role="user"),
                ChatCompletionAssistantMessageParam(content=critique_content, role="assistant"),
                ChatCompletionUserMessageParam(
                    content=(
                        "Verify the surviving issues against the code. "
                        "Keep only deterministic, real issues and output the final ReviewResult JSON. "
                        "The `summary` must evaluate the whole codebase quality — not a list of issues."
                    ),
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

        logger.info(
            "Review analysis completed in %d seconds. Final issues count: %d",
            elapsed,
            len(review_result.issues),
        )
        logger.warning(json.dumps(to_dict(review_result), indent=2))
        return review_result

    def translate_review_result(self, review_result: ReviewResult) -> ReviewResult:
        review_json = json.dumps(to_dict(review_result), indent=2)
        review_content = f"Final verified review to translate:\n{review_json}"

        elapsed, translated_text = self.timed_chat_completion(
            step_name="Translation",
            messages=[
                ChatCompletionSystemMessageParam(
                    content=(
                        f"Translate the review response into {self.language}. "
                        "You *must* preserve all technical terms, variable names, function names, "
                        "code snippets, and backtick formatting exactly as-is."
                    ),
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

    def normalize_issue_filenames(self, review_result: ReviewResult) -> ReviewResult:
        """Ensure every issue's file field exactly matches one of the embedded file paths.

        The LLM sometimes shortens, alters, or slightly misspells filenames.
        We match each returned name against the known paths using a simple
        longest-suffix strategy: pick the known path whose suffix best matches
        the returned value (case-insensitive). If no match is found and there
        is only a single embedded file, that file is used as an unambiguous
        fallback. Otherwise, the original value is kept and a warning is logged.

        THIS IS NIGHTMARE... BUT I SPENT WHOLE DAY TRY TO FIX THIS. STUPID LLMS
        """
        known_paths: List[str] = [f.path for f in self.files]

        def best_match(name: str) -> str:
            # Exact match first
            if name in known_paths:
                return name

            name_normalized = name.replace("\\", "/").lower()

            # Try suffix match: pick the known path that ends with the returned name
            candidates = [p for p in known_paths if p.replace("\\", "/").lower().endswith(name_normalized)]
            if len(candidates) == 1:
                return candidates[0]

            # Try prefix match (model may have stripped a leading directory)
            candidates = [p for p in known_paths if name_normalized.endswith(p.replace("\\", "/").lower())]
            if len(candidates) == 1:
                return candidates[0]

            # Fallback: match by basename only
            name_base = name_normalized.rsplit("/", 1)[-1]
            candidates = [p for p in known_paths if p.replace("\\", "/").lower().rsplit("/", 1)[-1] == name_base]
            if len(candidates) == 1:
                return candidates[0]

            # Fuzzy fallback: strip browser-added ` (N)` copy suffixes from known paths
            import re
            def strip_copy_suffix(path: str) -> str:
                base = path.replace("\\", "/").lower().rsplit("/", 1)[-1]
                return re.sub(r"\s*\(\d+\)(?=\.[^.]+$)", "", base)

            candidates = [p for p in known_paths if strip_copy_suffix(p) == name_base]
            if len(candidates) == 1:
                return candidates[0]

            # Last resort: if there is only one embedded file, it must be the one
            if len(known_paths) == 1:
                logger.info(
                    "Single-file submission — mapping unmatched filename %r to the only known path %r",
                    name, known_paths[0],
                )
                return known_paths[0]

            logger.warning("Could not normalize issue filename %r to any known path %s", name, known_paths)
            return name

        for issue in review_result.issues:
            original = issue.file
            issue.file = best_match(original)
            if issue.file != original:
                logger.info("Normalized issue filename %r → %r", original, issue.file)

        return review_result

    # -------------------------
    # Shared helpers
    # -------------------------

    def build_user_content(self) -> str:
        user_content_lines: List[str] = []

        for embedded_file in self.files:
            user_content_lines.append(f"\n### FILE: {embedded_file.path}")
            user_content_lines.append(f"```{embedded_file.language}")
            user_content_lines.append(enumerate_file_lines(embedded_file.content))
            user_content_lines.append("```")

        return "\n".join(user_content_lines)

    def timed_chat_completion(
            self,
            step_name: str,
            messages: List[
                ChatCompletionSystemMessageParam
                | ChatCompletionUserMessageParam
                | ChatCompletionAssistantMessageParam
                ],
            response_format,
            temperature: float
    ) -> Tuple[float, str]:
        step_start_time: float = time()

        response = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            response_format=response_format,
            temperature=temperature,
            timeout=180,
        )

        elapsed_seconds: float = time() - step_start_time
        message_content: str | None = response.choices[0].message.content
        logger.info("Step '%s' used %d completion tokens", step_name, response.usage.completion_tokens)

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
