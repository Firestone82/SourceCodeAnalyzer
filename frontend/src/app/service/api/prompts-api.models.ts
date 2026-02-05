export interface PromptNamesResponseDto {
  prompt_paths: string[];
}

export interface PromptContentResponseDto {
  prompt_path: string;
  content: string;
}

export interface PromptUploadRequestDto {
  prompt_path: string;
  content: string;
}

export interface PromptUploadResponseDto {
  prompt_path: string;
}
