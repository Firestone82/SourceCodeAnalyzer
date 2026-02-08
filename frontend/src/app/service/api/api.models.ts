import {SafeHtml} from '@angular/platform-browser';

export type IssueSeverity = 'low' | 'medium' | 'high';

export interface LoginRequestDto {
  key: string;
}

export interface RaterDto {
  id: number;
  name: string;
  admin: boolean;
}

export interface PromptNamesResponseDto {
  prompt_paths: string[];
}

export interface PromptContentResponseDto {
  prompt_path: string;
  content: string;
}

export interface SourcePathsResponseDto {
  source_paths: string[];
  total?: number;
  next_offset?: number | null;
}

export interface SourceFilesResponseDto {
  source_path: string;
  files: Record<string, string>;
}

export interface AnalyzeSourceRequestDto {
  model: string;
  prompt_path: string;
  prompt_content?: string;
}

export interface AnalyzeSourceResponseDto {
  ok: boolean;
  job_id: string;
  source_path: string;
  model: string;
  prompt_path: string;
}

export interface JobDto {
  id: number;
  job_id: string;
  status: string;
  job_type: string;
  source_path: string | null;
  prompt_path: string | null;
  model: string | null;
  submit_id: number | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobListResponseDto {
  items: JobDto[];
  total: number;
  page: number;
  page_size: number;
}

export interface SubmitListItemDto {
  id: number;
  model: string;
  prompt_path: string;
  source_path: string;
  rated: boolean;
  total_issues: number;
  created_at: string;
  published: boolean;
}

export interface SubmitListResponseDto {
  items: SubmitListItemDto[];
  total: number;
  page: number;
  page_size: number;
}

export interface SubmitDto {
  id: number;
  model: string;
  prompt_path: string;
  source_path: string;
  files: Record<string, string>;
  created_at: string;
  published: boolean;
}

export interface SubmitDetailsDto {
  submit_id: number;
  rater_id: number;
  summary: {
    id: number | null;
    explanation: string;
    highlightedExplanation?: SafeHtml;
    rating: number | null;
    rated_at: string | null;
  };
  issues: IssueDto[];
}

export interface IssueDto {
  id: number;
  file: string;
  severity: IssueSeverity;
  line: number;
  explanation: string;
  highlightedExplanation?: SafeHtml;
  rating: number | null;
  rated_at: string | null;
}

export interface RateIssueRequestDto {
  rating: number;
}

export interface SubmitPublishRequestDto {
  published: boolean;
}

export interface SubmitPublishResponseDto {
  id: number;
  published: boolean;
}
