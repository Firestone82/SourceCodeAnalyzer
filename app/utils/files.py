import zipfile
from pathlib import Path

PROMPTS_ROOT: Path = Path("data/prompts").resolve()
SOURCES_ROOT: Path = Path("data/sources").resolve()


def safe_join(root: Path, relative_path: str) -> Path:
    candidate: Path = (root / relative_path).resolve()

    if not str(candidate).startswith(str(root)):
        raise ValueError("Invalid path")

    return candidate


def extract_zip_safely(zip_path: Path, extracted_root: Path) -> None:
    extracted_root.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(zip_path, "r") as zip_file:
        for member in zip_file.infolist():
            target_path: Path = safe_join(extracted_root, member.filename)

            if member.is_dir():
                target_path.mkdir(parents=True, exist_ok=True)
                continue

            target_path.parent.mkdir(parents=True, exist_ok=True)
            with zip_file.open(member, "r") as source_stream:
                target_path.write_bytes(source_stream.read())


def find_source_files_or_extract(submit_source_path: str) -> dict[Path, str]:
    source_root: Path = safe_join(SOURCES_ROOT, submit_source_path)
    extracted_source_root: Path = source_root / "src"

    if not extracted_source_root.exists():
        zip_path: Path = source_root / "src.zip"

        if not zip_path.exists():
            raise FileNotFoundError(f"Source zip at '{zip_path}' not found")

        extract_zip_safely(zip_path, extracted_source_root)

    files: dict[Path, str] = {}
    for path in extracted_source_root.rglob("*"):
        if path.is_file():
            relative_path: Path = path.relative_to(extracted_source_root)
            files[relative_path] = path.read_text(encoding="utf-8", errors="replace")

    return files


def find_prompt_file(prompt_name: str) -> str:
    prompt_path: Path = safe_join(PROMPTS_ROOT, f"{prompt_name}.txt")

    if not prompt_path.exists() or not prompt_path.is_file():
        raise FileNotFoundError(f"Prompt file at '{prompt_path}' not found")

    return prompt_path.read_text(encoding="utf-8", errors="replace")
