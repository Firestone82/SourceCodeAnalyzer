import {SafeHtml} from '@angular/platform-browser';

export type IssueSeverity = 'low' | 'medium' | 'high';

export interface SubmitListItemDto {
  id: number;
  model: string;
  prompt_path: string;
  source_path: string;
  rated: boolean;
  created_at: string;
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
}

export interface SubmitDetailsDto {
  submit_id: number;
  rater_id: number;
  summary: {
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
  rating: number; // 0..10
}
