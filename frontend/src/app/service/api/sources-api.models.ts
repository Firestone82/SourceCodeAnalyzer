export interface SourcePathsResponseDto {
  source_paths: string[];
}

export interface SourceFilesResponseDto {
  source_path: string;
  files: Record<string, string>;
}

export interface AnalyzeSourceRequestDto {
  model: string;
  prompt_path: string;
}

export interface AnalyzeSourceResponseDto {
  ok: boolean;
  job_id: string;
  source_path: string;
  model: string;
  prompt_path: string;
}
