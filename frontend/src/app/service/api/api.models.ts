import {SafeHtml} from '@angular/platform-browser';

export type IssueSeverity = 'low' | 'medium' | 'high';
export type SubmitRatingState = 'not_rated' | 'partially_rated' | 'rated';

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

export interface PromptUpdateRequestDto {
  content: string;
}

export interface PromptDeleteResponseDto {
  prompt_path: string;
  deleted: boolean;
}

export interface SourcePathsResponseDto {
  source_paths: string[];
  total?: number;
  next_offset?: number | null;
}

export interface SourceFolderEntryDto {
  path: string;
  has_source: boolean;
}

export interface SourceFoldersResponseDto {
  folders: SourceFolderEntryDto[];
}

export interface SourceFolderChildEntryDto {
  name: string;
  path: string;
  has_source: boolean;
  has_children: boolean;
  source_tag?: string | null;
}

export interface SourceFolderChildrenResponseDto {
  children: SourceFolderChildEntryDto[];
  total?: number;
  next_offset?: number | null;
}

export interface SourceCommentDto {
  text: string;
  source?: string | null;
  line?: number | null;
}

export interface SourceFilesResponseDto {
  source_path: string;
  source_tag?: string | null;
  files: Record<string, string>;
  comments?: SourceCommentDto[];
}

export interface SourceTagRequestDto {
  tag: string;
}

export interface SourceTagResponseDto {
  source_path: string;
  tag: string;
}

export interface SourceTagDeleteResponseDto {
  source_path: string;
  deleted: boolean;
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
  error_log?: string | null;
  created_at: string;
  updated_at: string;
}


export interface JobErrorLogRequestDto {
  error_log: string;
}

export interface JobErrorLogResponseDto {
  job_id: string;
  error_log: string;
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
  source_tag?: string | null;
  rating_state: SubmitRatingState;
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
  source_tag?: string | null;
  files: Record<string, string>;
  created_at: string;
  rating_state: SubmitRatingState;
  published: boolean;
}

export interface SubmitDetailsDto {
  submit_id: number;
  rater_id: number;
  summary: {
    id: number | null;
    explanation: string;
    highlightedExplanation?: SafeHtml;
    relevance_rating: number | null;
    quality_rating: number | null;
    comment: string | null;
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
  relevance_rating: number | null;
  quality_rating: number | null;
  rated_at: string | null;
}

export interface RateIssueRequestDto {
  relevance_rating?: number;
  quality_rating?: number;
}

export interface RateSubmitSummaryRequestDto {
  relevance_rating?: number;
  quality_rating?: number;
  comment?: string | null;
}

export interface SubmitRaterSuggestionRatingDto {
  issue_id: number;
  file: string;
  line: number;
  severity: IssueSeverity;
  explanation: string;
  relevance_rating: number | null;
  quality_rating: number | null;
  rated_at: string | null;
}

export interface SubmitRaterRatingDto {
  rater_id: number;
  rater_name: string;
  relevance_rating: number | null;
  quality_rating: number | null;
  comment: string | null;
  rated_at: string | null;
  suggestions: SubmitRaterSuggestionRatingDto[];
}

export interface SubmitRaterRatingsResponseDto {
  submit_id: number;
  raters: SubmitRaterRatingDto[];
}

export interface SubmitPublishRequestDto {
  published: boolean;
}

export interface SubmitPublishResponseDto {
  id: number;
  published: boolean;
}

export interface SubmitDeleteResponseDto {
  id: number;
  deleted: boolean;
}


export interface SourceTagsResponseDto {
  tags: string[];
}

export interface DashboardRaterStatDto {
  rater_id: number;
  rater_name: string;
  rated_submits: number;
  unrated_submits: number;
  rated_percent: number;
}

export interface DashboardRatingEventDto {
  submit_id: number;
  rater_id: number;
  rater_name: string;
  source_path: string;
  prompt_path: string;
  model: string;
  relevance_rating: number | null;
  quality_rating: number | null;
  rated_at: string;
}

export interface DashboardPromptModelStatDto {
  prompt_path: string;
  model: string;
  avg_relevance_rating: number | null;
  avg_quality_rating: number | null;
  complex_rating: number | null;
  ratings_count: number;
}

export interface DashboardSourceRatingTrendDto {
  source_path: string;
  prompt_path: string;
  model: string;
  avg_relevance_rating: number | null;
  avg_quality_rating: number | null;
  complex_rating: number | null;
  ratings_count: number;
}

export interface DashboardPromptPerformanceDto {
  prompt_path: string;
  complex_rating: number | null;
  ratings_count: number;
}

export interface DashboardStatsResponseDto {
  raters: DashboardRaterStatDto[];
  rating_events: DashboardRatingEventDto[];
  prompt_model_stats: DashboardPromptModelStatDto[];
  source_rating_trends: DashboardSourceRatingTrendDto[];
  prompt_performance: DashboardPromptPerformanceDto[];
}
