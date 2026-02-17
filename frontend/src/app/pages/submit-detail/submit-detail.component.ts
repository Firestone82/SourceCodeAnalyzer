import {Component, OnDestroy, OnInit} from '@angular/core';
import {ActivatedRoute, RouterLink} from '@angular/router';
import {forkJoin, of, Subject} from 'rxjs';
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
import {SubmitsApiService} from '../../service/api/types/submits-api.service';
import {AnalyzeSourceResponseDto, IssueDto, SubmitDetailsDto, SubmitDto} from '../../service/api/api.models';
import {SourceCodeViewerComponent} from '../../components/source-code-viewer/source-code-viewer.component';
import {NzCardComponent} from 'ng-zorro-antd/card';
import {NzButtonComponent} from 'ng-zorro-antd/button';
import {SourceReviewModalComponent} from '../../components/source-review-modal/source-review-modal.component';
import {JobCreatedModalComponent} from '../../components/job-created-modal/job-created-modal.component';

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
    NzButtonComponent,
    RouterLink,
    SourceReviewModalComponent,
    JobCreatedModalComponent
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
  private readonly destroy$ = new Subject<void>();

  public constructor(
    private readonly activatedRoute: ActivatedRoute,
    private readonly submitsApiService: SubmitsApiService,
    private readonly nzMessageService: NzMessageService
  ) {
  }

  public get issuesBySelectedFile(): IssueDto[] {
    if (!this.submitDetails || !this.selectedFileName) {
      return [];
    }
    return this.submitDetails.issues.filter((issue: IssueDto) => issue.file === this.selectedFileName);
  }

  public get nextSubmitId(): number | null {
    return this.nextUnratedSubmitId;
  }

  public ngOnInit(): void {
    this.activatedRoute.paramMap
      .pipe(takeUntil(this.destroy$))
      .subscribe((params) => {
        const submitId: number = Number(params.get('submitId'));
        if (!Number.isFinite(submitId)) {
          return;
        }
        this.loadSubmit(submitId);
      });
  }

  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  public selectFile(fileName: string): void {
    this.selectedFileName = fileName;
  }

  public handleRate(issue: IssueDto, criterion: 'relevance' | 'quality', rating: number): void {
    const previousRelevanceRating: number | null = issue.relevance_rating;
    const previousQualityRating: number | null = issue.quality_rating;

    if (criterion === 'relevance') {
      issue.relevance_rating = rating;
    } else {
      issue.quality_rating = rating;
    }

    this.submitsApiService.rateIssue(issue.id, {
      relevance_rating: issue.relevance_rating ?? undefined,
      quality_rating: issue.quality_rating ?? undefined
    }).subscribe({
      next: () => {
        this.recalculateRemainingIssues();
      },
      error: () => {
        issue.relevance_rating = previousRelevanceRating;
        issue.quality_rating = previousQualityRating;
        this.nzMessageService.error('Failed to save rating.');
      }
    });
  }

  public handleSummaryRate(criterion: 'relevance' | 'quality', newValue: number): void {
    if (!this.submitDetails?.summary.id) {
      return;
    }

    const previousRelevanceRating: number | null = this.submitDetails.summary.relevance_rating;
    const previousQualityRating: number | null = this.submitDetails.summary.quality_rating;
    const normalized: number = this.normalizeStarRating(newValue);

    if (criterion === 'relevance') {
      this.submitDetails.summary.relevance_rating = normalized;
    } else {
      this.submitDetails.summary.quality_rating = normalized;
    }

    this.submitsApiService.rateIssue(this.submitDetails.summary.id, {
      relevance_rating: this.submitDetails.summary.relevance_rating ?? undefined,
      quality_rating: this.submitDetails.summary.quality_rating ?? undefined
    }).subscribe({
      next: () => {
        if (!this.submitDetails?.summary) {
          return;
        }
        this.submitDetails.summary.rated_at = this.submitDetails.summary.rated_at ?? new Date().toISOString();
      },
      error: () => {
        if (this.submitDetails?.summary) {
          this.submitDetails.summary.relevance_rating = previousRelevanceRating;
          this.submitDetails.summary.quality_rating = previousQualityRating;
        }
        this.nzMessageService.error('Failed to save summary rating.');
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
        this.isLoading = false;
        this.loadNextUnratedSubmitId(submit.id);
      },
      error: () => {
        this.isLoading = false;
      }
    });
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
