import {Component, OnDestroy, OnInit} from '@angular/core';
import {ActivatedRoute, RouterLink} from '@angular/router';
import {combineLatest, forkJoin, of, Subject} from 'rxjs';
import {DatePipe} from '@angular/common';
import {catchError, takeUntil} from 'rxjs/operators';
import {FormsModule} from '@angular/forms';

import {NzLayoutModule} from 'ng-zorro-antd/layout';
import {NzMenuModule} from 'ng-zorro-antd/menu';
import {NzBadgeModule} from 'ng-zorro-antd/badge';
import {NzTypographyModule} from 'ng-zorro-antd/typography';
import {NzSpinModule} from 'ng-zorro-antd/spin';
import {NzMessageService} from 'ng-zorro-antd/message';
import {NzRateModule} from 'ng-zorro-antd/rate';
import {NzTagModule} from 'ng-zorro-antd/tag';
import {NzSelectModule} from 'ng-zorro-antd/select';
import {SubmitsApiService} from '../../service/api/types/submits-api.service';
import {
  AnalyzeSourceResponseDto,
  IssueDto,
  SubmitDetailsDto,
  SubmitDto,
  SubmitRaterRatingDto,
  SubmitRaterSuggestionRatingDto
} from '../../service/api/api.models';
import {SourceCodeViewerComponent} from '../../components/source-code-viewer/source-code-viewer.component';
import {NzCardComponent} from 'ng-zorro-antd/card';
import {NzButtonComponent} from 'ng-zorro-antd/button';
import {SourceReviewModalComponent} from '../../components/source-review-modal/source-review-modal.component';
import {JobCreatedModalComponent} from '../../components/job-created-modal/job-created-modal.component';
import {SubmitRaterRatingsModalComponent} from '../../components/submit-rater-ratings-modal/submit-rater-ratings-modal.component';
import {AuthService} from '../../service/auth/auth.service';

@Component({
  selector: 'app-submit-detail',
  standalone: true,
  imports: [
    NzLayoutModule,
    NzMenuModule,
    NzBadgeModule,
    NzTypographyModule,
    NzSpinModule,
    FormsModule,
    SourceCodeViewerComponent,
    NzCardComponent,
    DatePipe,
    NzRateModule,
    NzTagModule,
    NzButtonComponent,
    RouterLink,
    SourceReviewModalComponent,
    JobCreatedModalComponent,
    SubmitRaterRatingsModalComponent,
    NzSelectModule
  ],
  templateUrl: './submit-detail.component.html',
  styleUrl: './submit-detail.component.css'
})
export class SubmitDetailComponent implements OnInit, OnDestroy {
  public isLoading: boolean = false;
  public submit: SubmitDto | null = null;
  public submitDetails: SubmitDetailsDto | null = null;
  public fileNames: string[] = [];
  public selectedFileName: string | null = null;
  public remainingIssuesByFile: Record<string, number> = {};
  public nextUnratedSubmitId: number | null = null;
  public isReviewModalVisible: boolean = false;
  public isJobModalVisible: boolean = false;
  public jobModalIds: string[] = [];
  public summaryCommentInput: string = '';
  public isAdminRatingsModalVisible: boolean = false;
  public isAdminRatingsLoading: boolean = false;
  public submitRatingsByRater: SubmitRaterRatingDto[] = [];
  public selectedRaterId: number | null = null;
  private pendingSelectedRaterId: number | null = null;
  private displayedIssuesCacheKey: string = '';
  private displayedIssuesCache: IssueDto[] = [];
  public readonly viewerRebuild$ = new Subject<void>();
  private readonly destroy$ = new Subject<void>();

  public constructor(
    private readonly activatedRoute: ActivatedRoute,
    private readonly submitsApiService: SubmitsApiService,
    private readonly nzMessageService: NzMessageService,
    private readonly authService: AuthService
  ) {
  }

  public get issuesBySelectedFile(): IssueDto[] {
    if (!this.submitDetails || !this.selectedFileName) {
      return [];
    }
    return this.submitDetails.issues.filter((issue: IssueDto) => issue.file === this.selectedFileName);
  }

  public get displayedIssuesBySelectedFile(): IssueDto[] {
    const sourceIssues = this.issuesBySelectedFile;

    if (!this.isViewingSelectedRater) {
      return sourceIssues;
    }

    const selectedSuggestions = this.selectedRaterRating?.suggestions ?? [];
    const key = [
      this.selectedFileName ?? '',
      this.selectedRaterId ?? '',
      sourceIssues.map((issue) => issue.id).join(','),
      selectedSuggestions.map((suggestion) => `${suggestion.issue_id}:${suggestion.relevance_rating ?? ''}:${suggestion.quality_rating ?? ''}`).join('|')
    ].join('::');

    if (this.displayedIssuesCacheKey === key) {
      return this.displayedIssuesCache;
    }

    this.displayedIssuesCacheKey = key;
    this.displayedIssuesCache = sourceIssues.map((issue: IssueDto) => {
      const suggestion = this.getSelectedRaterSuggestion(issue.id);
      if (!suggestion) {
        return {
          ...issue,
          relevance_rating: null,
          quality_rating: null,
          comment: null
        };
      }

      return {
        ...issue,
        relevance_rating: suggestion.relevance_rating,
        quality_rating: suggestion.quality_rating,
        comment: suggestion.comment
      };
    });

    return this.displayedIssuesCache;
  }

  public get nextSubmitId(): number | null {
    return this.nextUnratedSubmitId;
  }

  public get isAdmin(): boolean {
    return Boolean(this.authService.currentRater?.admin);
  }

  public get isViewingSelectedRater(): boolean {
    return this.selectedRaterId !== null;
  }

  public get selectedRaterRating(): SubmitRaterRatingDto | null {
    if (this.selectedRaterId === null) {
      return null;
    }

    return this.submitRatingsByRater.find((rating: SubmitRaterRatingDto) => rating.rater_id === this.selectedRaterId) ?? null;
  }

  public get displayedSummaryRelevance(): number | null {
    if (this.isViewingSelectedRater) {
      return this.selectedRaterRating?.relevance_rating ?? null;
    }

    return this.submitDetails?.summary.relevance_rating ?? null;
  }

  public get displayedSummaryQuality(): number | null {
    if (this.isViewingSelectedRater) {
      return this.selectedRaterRating?.quality_rating ?? null;
    }

    return this.submitDetails?.summary.quality_rating ?? null;
  }

  public get displayedSummaryComment(): string | null {
    if (this.isViewingSelectedRater) {
      return this.selectedRaterRating?.comment ?? null;
    }

    return this.submitDetails?.summary.comment ?? null;
  }

  public ngOnInit(): void {
    combineLatest([this.activatedRoute.paramMap, this.activatedRoute.queryParamMap])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([params, queryParams]) => {
        const submitId: number = Number(params.get('submitId'));
        if (!Number.isFinite(submitId)) {
          return;
        }

        const selectedRaterParam: string | null = queryParams.get('raterId');
        const parsedRaterId: number = Number(selectedRaterParam);
        this.pendingSelectedRaterId = Number.isFinite(parsedRaterId) && parsedRaterId > 0 ? parsedRaterId : null;

        this.loadSubmit(submitId);
      });
  }

  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.viewerRebuild$.complete();
  }

  public selectFile(fileName: string): void {
    this.selectedFileName = fileName;
    this.displayedIssuesCacheKey = '';
  }

  public handleRate(issue: IssueDto, criterion: 'relevance' | 'quality', rating: number): void {
    if (this.isViewingSelectedRater) {
      return;
    }

    const previousRelevanceRating: number | null = issue.relevance_rating;
    const previousQualityRating: number | null = issue.quality_rating;

    if (criterion === 'relevance') {
      issue.relevance_rating = rating;
    } else {
      issue.quality_rating = rating;
    }

    this.submitsApiService.rateIssue(issue.id, {
      relevance_rating: issue.relevance_rating ?? undefined,
      quality_rating: issue.quality_rating ?? undefined,
      comment: issue.comment ?? null
    }).subscribe({
      next: () => {
        this.recalculateRemainingIssues();
        this.viewerRebuild$.next();
        this.nzMessageService.success('Rating submitted.');
      },
      error: () => {
        issue.relevance_rating = previousRelevanceRating;
        issue.quality_rating = previousQualityRating;
        this.nzMessageService.error('Failed to save rating.');
      }
    });
  }

  public handleSummaryRate(criterion: 'relevance' | 'quality', newValue: number): void {
    if (this.isViewingSelectedRater || !this.submitDetails?.summary.id) {
      return;
    }

    const normalized: number = this.normalizeStarRating(newValue);
    if (criterion === 'relevance') {
      this.submitDetails.summary.relevance_rating = normalized;
    } else {
      this.submitDetails.summary.quality_rating = normalized;
    }

    this.submitSummaryRating(false);
  }

  public submitSummaryRating(showSuccessMessage: boolean = true): void {
    if (this.isViewingSelectedRater || !this.submitDetails || !this.submit) {
      return;
    }

    const previousRelevanceRating: number | null = this.submitDetails.summary.relevance_rating;
    const previousQualityRating: number | null = this.submitDetails.summary.quality_rating;
    const previousComment: string | null = this.submitDetails.summary.comment;
    const trimmedComment: string = this.summaryCommentInput.trim();

    this.submitsApiService.rateSubmitSummary(this.submit.id, {
      relevance_rating: this.submitDetails.summary.relevance_rating ?? undefined,
      quality_rating: this.submitDetails.summary.quality_rating ?? undefined,
      comment: trimmedComment ? trimmedComment : null
    }).subscribe({
      next: () => {
        if (!this.submitDetails) {
          return;
        }
        this.submitDetails.summary.rated_at = new Date().toISOString();
        this.submitDetails.summary.comment = trimmedComment ? trimmedComment : null;
        if (showSuccessMessage) {
          this.nzMessageService.success('Summary rating submitted.');
        }
      },
      error: () => {
        if (this.submitDetails) {
          this.submitDetails.summary.relevance_rating = previousRelevanceRating;
          this.submitDetails.summary.quality_rating = previousQualityRating;
          this.submitDetails.summary.comment = previousComment;
        }
        this.nzMessageService.error('Failed to save summary rating.');
      }
    });
  }


  public saveIssueComment(issue: IssueDto, commentInput: string): void {
    if (this.isViewingSelectedRater) {
      return;
    }

    const previousComment: string | null = issue.comment;
    const trimmedComment: string = commentInput.trim();
    issue.comment = trimmedComment ? trimmedComment : null;

    this.submitsApiService.rateIssue(issue.id, {
      relevance_rating: issue.relevance_rating ?? undefined,
      quality_rating: issue.quality_rating ?? undefined,
      comment: issue.comment
    }).subscribe({
      next: () => {
        this.viewerRebuild$.next();
        this.nzMessageService.success('Issue comment saved.');
      },
      error: () => {
        issue.comment = previousComment;
        this.viewerRebuild$.next();
        this.nzMessageService.error('Failed to save issue comment.');
      }
    });
  }

  public onSelectedRaterChange(raterId: number | null): void {
    this.selectedRaterId = raterId;
    this.displayedIssuesCacheKey = '';
    this.viewerRebuild$.next();
  }

  public openAdminRatingsModal(): void {
    if (!this.submit) {
      return;
    }

    this.isAdminRatingsModalVisible = true;
    this.isAdminRatingsLoading = true;

    this.submitsApiService.getSubmitRatingsByRater(this.submit.id).subscribe({
      next: (response) => {
        this.submitRatingsByRater = response.raters;
        this.isAdminRatingsLoading = false;
      },
      error: () => {
        this.isAdminRatingsLoading = false;
        this.nzMessageService.error('Failed to load submit ratings by rater.');
      }
    });
  }

  public openReviewModal(): void {
    if (!this.submit) {
      return;
    }

    this.isReviewModalVisible = true;
  }

  public handleReviewQueued(response: AnalyzeSourceResponseDto): void {
    this.jobModalIds = [response.job_id];
    this.isJobModalVisible = true;
  }

  private loadSubmit(submitId: number): void {
    this.isLoading = true;
    this.nextUnratedSubmitId = null;
    this.submitRatingsByRater = [];
    this.selectedRaterId = null;
    this.displayedIssuesCacheKey = '';

    forkJoin({
      submit: this.submitsApiService.getSubmit(submitId),
      details: this.submitsApiService.getSubmitDetails(submitId)
    }).subscribe({
      next: ({submit, details}: { submit: SubmitDto; details: SubmitDetailsDto }) => {
        this.submit = submit;
        this.submitDetails = details;

        this.fileNames = Object.keys(submit.files || {}).sort((left: string, right: string) => left.localeCompare(right));
        this.selectedFileName = this.fileNames.length > 0 ? this.fileNames[0] : null;

        this.recalculateRemainingIssues();
        this.viewerRebuild$.next();
        this.summaryCommentInput = this.submitDetails.summary.comment ?? '';
        this.isLoading = false;
        this.loadNextUnratedSubmitId(submit.id);

        if (this.isAdmin) {
          this.loadSubmitRatingsByRater(submit.id);
        }
      },
      error: () => {
        this.isLoading = false;
      }
    });
  }

  private loadSubmitRatingsByRater(submitId: number): void {
    this.submitsApiService.getSubmitRatingsByRater(submitId).subscribe({
      next: (response) => {
        this.submitRatingsByRater = response.raters;

        if (this.pendingSelectedRaterId !== null) {
          const matchedRater = this.submitRatingsByRater.find((rating) => rating.rater_id === this.pendingSelectedRaterId);
          this.selectedRaterId = matchedRater ? matchedRater.rater_id : null;
          this.pendingSelectedRaterId = null;
          this.displayedIssuesCacheKey = '';
          this.viewerRebuild$.next();
        }
      },
      error: () => {
        this.nzMessageService.error('Failed to load submit ratings by rater.');
      }
    });
  }

  private getSelectedRaterSuggestion(issueId: number): SubmitRaterSuggestionRatingDto | null {
    return this.selectedRaterRating?.suggestions.find((suggestion) => suggestion.issue_id === issueId) ?? null;
  }

  private loadNextUnratedSubmitId(currentSubmitId: number): void {
    const pageSize = 50;

    const fetchPage = (page: number): void => {
      this.submitsApiService
        .getSubmits(page, pageSize, true, '')
        .pipe(catchError(() => of({items: [], total: 0, page, page_size: pageSize})))
        .subscribe((response) => {
          const index = response.items.findIndex((item) => item.id === currentSubmitId);

          if (index !== -1) {
            const nextItem = response.items[index + 1];
            this.nextUnratedSubmitId = nextItem ? nextItem.id : null;
            return;
          }

          const hasMore = page * pageSize < response.total;
          if (hasMore) {
            fetchPage(page + 1);
          }
        });
    };

    fetchPage(1);
  }

  private recalculateRemainingIssues(): void {
    const remaining: Record<string, number> = {};
    if (!this.submitDetails) {
      this.remainingIssuesByFile = remaining;
      return;
    }

    for (const issue of this.submitDetails.issues) {
      if (!remaining[issue.file]) {
        remaining[issue.file] = 0;
      }
      if (issue.relevance_rating === null || issue.quality_rating === null) {
        remaining[issue.file] += 1;
      }
    }

    this.remainingIssuesByFile = remaining;
  }

  private normalizeStarRating(newValue: number): number {
    return Math.max(1, Math.min(10, Math.round(Number(newValue) * 2)));
  }
}
