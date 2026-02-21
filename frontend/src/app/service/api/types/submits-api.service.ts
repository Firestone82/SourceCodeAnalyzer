import {Injectable} from '@angular/core';
import {map, Observable} from 'rxjs';
import {ApiClientService} from '../api-client.service';
import {
  AnalyzeSourceResponseDto,
  RateIssueRequestDto,
  SubmitDetailsDto,
  SubmitDto,
  SubmitListResponseDto,
  SubmitPublishRequestDto,
  SubmitPublishResponseDto,
  SubmitDeleteResponseDto
} from '../api.models';
import {SyntaxHighlighterService} from '../../syntax-highlighting.service';
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
    model: string | null,
    sourcePath: string | null = null,
    promptPath: string | null = null,
    sourceTag: string | null = null
  ): Observable<SubmitListResponseDto> {
    return this.apiClientService.get<SubmitListResponseDto>('/submits', {
      queryParams: {
        page,
        page_size: pageSize,
        only_unrated: onlyUnrated,
        model: model && model.trim() ? model.trim() : null,
        source_path: sourcePath && sourcePath.trim() ? sourcePath.trim() : null,
        prompt_path: promptPath && promptPath.trim() ? promptPath.trim() : null,
        source_tag: sourceTag && sourceTag.trim() ? sourceTag.trim() : null
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
              .markdownToHtml(issue.explanation)
              .then((highlightedExplanation: string) => {
                issue.highlightedExplanation = this.domSanitizer.bypassSecurityTrustHtml(highlightedExplanation);
              });
          }

          this.syntaxHighlightService
            .markdownToHtml(submitDetails.summary.explanation)
            .then((highlightedExplanation: string) => {
              submitDetails.summary.highlightedExplanation = this.domSanitizer.bypassSecurityTrustHtml(highlightedExplanation);
            });

          return submitDetails;
        })
      );
  }

  public rateIssue(issueId: number, payload: RateIssueRequestDto): Observable<void> {
    return this.apiClientService.post<void, RateIssueRequestDto>(`/ratings/issues/${issueId}`, payload);
  }

  public uploadSubmit(formData: FormData): Observable<AnalyzeSourceResponseDto> {
    return this.apiClientService.postFormData<AnalyzeSourceResponseDto>('/submits/upload', formData);
  }

  public setSubmitPublishState(submitId: number, published: boolean): Observable<SubmitPublishResponseDto> {
    const payload: SubmitPublishRequestDto = {published};
    return this.apiClientService.put<SubmitPublishResponseDto, SubmitPublishRequestDto>(
      `/submits/${submitId}/publish`,
      payload
    );
  }


  public deleteSubmit(submitId: number): Observable<SubmitDeleteResponseDto> {
    return this.apiClientService.delete<SubmitDeleteResponseDto>(`/submits/${submitId}`);
  }

}
