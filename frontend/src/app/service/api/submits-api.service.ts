import {Injectable} from '@angular/core';
import {map, Observable} from 'rxjs';
import {ApiClientService} from './api-client.service';
import {SubmitDetailsDto, SubmitDto, SubmitListResponseDto} from './submits-api.models';
import {SyntaxHighlighterService} from '../syntax-highlighting.service';
import {DomSanitizer} from '@angular/platform-browser';

@Injectable({providedIn: 'root'})
export class SubmitsApiService {
  public constructor(
    private readonly apiClientService: ApiClientService,
    private readonly syntaxHighlightService: SyntaxHighlighterService,
    private readonly domSanitizer: DomSanitizer
  ) {
  }

  public getSubmits(
    page: number,
    pageSize: number,
    onlyUnrated: boolean,
    model: string | null
  ): Observable<SubmitListResponseDto> {
    return this.apiClientService.get<SubmitListResponseDto>('/submits', {
      queryParams: {
        page,
        page_size: pageSize,
        only_unrated: onlyUnrated,
        model: model && model.trim() ? model.trim() : null
      }
    });
  }

  public getSubmit(submitId: number): Observable<SubmitDto> {
    return this.apiClientService.get<SubmitDto>(`/submits/${submitId}`);
  }

  public getSubmitDetails(submitId: number): Observable<SubmitDetailsDto> {
    return this.apiClientService
      .get<SubmitDetailsDto>(`/submits/${submitId}/details`)
      .pipe(
        map((submitDetails: SubmitDetailsDto) => {
          for (const issue of submitDetails.issues) {
            this.syntaxHighlightService
              .markdownToHtml(issue.explanation, 'github-light')
              .then((highlightedExplanation: string) => {
                issue.highlightedExplanation = this.domSanitizer.bypassSecurityTrustHtml(highlightedExplanation);
              });
          }

          this.syntaxHighlightService
              .markdownToHtml(submitDetails.summary.explanation, 'github-light')
              .then((highlightedExplanation: string) => {
                submitDetails.summary.highlightedExplanation = this.domSanitizer.bypassSecurityTrustHtml(highlightedExplanation);
              });

          return submitDetails;
        })
      );
  }

  public rateIssue(issueId: number, rating: number): Observable<void> {
    return this.apiClientService.post<void, { rating: number }>(
      `/ratings/issues/${issueId}`,
      {rating}
    );
  }
}
