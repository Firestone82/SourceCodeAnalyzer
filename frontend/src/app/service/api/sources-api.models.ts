export interface SourcePathsResponseDto {
  source_paths: string[];
}

export interface SourceFilesResponseDto {
  source_path: string;
  files: Record<string, string>;
}
