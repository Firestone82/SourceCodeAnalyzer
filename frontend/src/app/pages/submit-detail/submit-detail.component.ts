import {Component, OnDestroy, OnInit} from '@angular/core';
import {ActivatedRoute, RouterLink} from '@angular/router';
import {forkJoin, of, Subject} from 'rxjs';
import {DatePipe} from '@angular/common';
import {catchError, finalize, takeUntil} from 'rxjs/operators';

import {NzLayoutModule} from 'ng-zorro-antd/layout';
import {NzMenuModule} from 'ng-zorro-antd/menu';
import {NzBadgeModule} from 'ng-zorro-antd/badge';
import {NzTypographyModule} from 'ng-zorro-antd/typography';
import {NzSpinModule} from 'ng-zorro-antd/spin';
import {NzMessageService} from 'ng-zorro-antd/message';
import {SubmitsApiService} from '../../service/api/types/submits-api.service';
import {
  IssueDto,
  PromptContentResponseDto,
  PromptUploadResponseDto,
  SubmitDetailsDto,
  SubmitDto
} from '../../service/api/api.models';
import {SourceCodeViewerComponent} from '../../components/source-code-viewer/source-code-viewer.component';
import {NzCardComponent} from 'ng-zorro-antd/card';
import {NzButtonComponent} from 'ng-zorro-antd/button';
import {SourceReviewModalComponent} from '../../components/source-review-modal/source-review-modal.component';
import {PromptsApiService} from '../../service/api/types/prompts-api.service';
import {SourcesApiService} from '../../service/api/types/sources-api.service';
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
    SourceCodeViewerComponent,
    NzCardComponent,
    DatePipe,
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
  public selectedPromptPath: string | null = null;
  public reviewModel: string = '';
  public promptContent: string = '';
  public promptDraft: string = '';
  public promptErrorMessage: string | null = null;
  public reviewSubmitError: string | null = null;
  public isPromptOptionsLoading: boolean = false;
  public isSubmittingReview: boolean = false;
  public isJobModalVisible: boolean = false;
  public jobModalIds: string[] = [];
  public promptPaths: string[] = [];
  private readonly destroy$ = new Subject<void>();

  public constructor(
    private readonly activatedRoute: ActivatedRoute,
    private readonly submitsApiService: SubmitsApiService,
    private readonly nzMessageService: NzMessageService,
    private readonly promptsApiService: PromptsApiService,
    private readonly sourcesApiService: SourcesApiService
  ) {
  }

  public get issuesBySelectedFile(): IssueDto[] {
    if (!this.submitDetails || !this.selectedFileName) {
      return [];
    }
    return this.submitDetails.issues.filter((issue: IssueDto) => issue.file === this.selectedFileName);
  }

  public get canSubmitReview(): boolean {
    return Boolean(this.submit && this.selectedPromptPath && this.reviewModel.trim());
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

  public handleRate(issue: IssueDto, rating: number): void {
    const previousRating: number | null = issue.rating;

    issue.rating = rating;

    this.submitsApiService.rateIssue(issue.id, rating).subscribe({
      next: () => {
        if (previousRating === null) {
          this.recalculateRemainingIssues();
        }
      },
      error: () => {
        issue.rating = previousRating;
        this.nzMessageService.error('Failed to save rating.');
      }
    });
  }

  public openReviewModal(): void {
    if (!this.submit) {
      return;
    }

    this.isReviewModalVisible = true;
    this.reviewSubmitError = null;
    this.promptErrorMessage = null;
    this.selectedPromptPath = this.submit.prompt_path;
    this.reviewModel = this.submit.model;
    this.promptPaths = [this.submit.prompt_path];
    this.promptContent = '';
    this.promptDraft = '';
    this.isPromptOptionsLoading = true;

    this.promptsApiService
      .getPromptContent(this.submit.prompt_path)
      .pipe(
        catchError(() => {
          this.promptErrorMessage = 'Failed to load prompt content.';
          return of<PromptContentResponseDto>({
            prompt_path: this.submit!.prompt_path,
            content: ''
          });
        }),
        finalize(() => {
          this.isPromptOptionsLoading = false;
        })
      )
      .subscribe((response: PromptContentResponseDto) => {
        this.promptContent = response.content;
        this.promptDraft = response.content;
      });
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
        .pipe(
          catchError(() => of({items: [], total: 0, page, page_size: pageSize}))
        )
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

  public handlePromptSelection(promptPath: string): void {
    if (!this.submit || this.selectedPromptPath === promptPath) {
      return;
    }

    this.selectedPromptPath = promptPath;
    this.promptContent = '';
    this.promptDraft = '';
    this.promptErrorMessage = null;
    this.isPromptOptionsLoading = true;

    this.promptsApiService
      .getPromptContent(promptPath)
      .pipe(
        catchError(() => {
          this.promptErrorMessage = 'Failed to load prompt content.';
          return of<PromptContentResponseDto>({prompt_path: promptPath, content: ''});
        }),
        finalize(() => {
          this.isPromptOptionsLoading = false;
        })
      )
      .subscribe((response: PromptContentResponseDto) => {
        this.promptContent = response.content;
        this.promptDraft = response.content;
      });
  }

  public handlePromptDraftChange(draft: string): void {
    this.promptDraft = draft;
  }

  public handleReviewModelChange(model: string): void {
    this.reviewModel = model;
  }

  public submitReview(): void {
    if (!this.submit || !this.selectedPromptPath || !this.canSubmitReview) {
      return;
    }

    this.reviewSubmitError = null;
    this.isSubmittingReview = true;

    const trimmedPromptDraft = this.promptDraft.trim();
    const trimmedPromptContent = this.promptContent.trim();
    const hasPromptChanged = trimmedPromptDraft !== trimmedPromptContent;

    const finalizeSubmission = (promptPath: string): void => {
      this.sourcesApiService
        .analyzeSource(this.submit!.source_path, {
          model: this.reviewModel.trim(),
          prompt_path: promptPath
        })
        .pipe(
          catchError(() => {
            this.reviewSubmitError = 'Failed to submit review.';
            return of(null);
          }),
          finalize(() => {
            this.isSubmittingReview = false;
          })
        )
        .subscribe((response) => {
          if (!response) {
            return;
          }
          this.jobModalIds = [response.job_id];
          this.isJobModalVisible = true;
          this.isReviewModalVisible = false;
        });
    };

    if (hasPromptChanged) {
      const uploadName = this.buildPromptUploadName(this.selectedPromptPath);
      this.promptsApiService
        .uploadPrompt({
          prompt_path: uploadName,
          content: trimmedPromptDraft
        })
        .pipe(
          catchError(() => {
            this.reviewSubmitError = 'Failed to upload updated prompt.';
            return of<PromptUploadResponseDto | null>(null);
          })
        )
        .subscribe((response) => {
          if (!response) {
            this.isSubmittingReview = false;
            return;
          }
          finalizeSubmission(response.prompt_path);
        });
    } else {
      finalizeSubmission(this.selectedPromptPath);
    }
  }

  private buildPromptUploadName(promptPath: string): string {
    const baseName = promptPath.split('/').filter(Boolean).pop() ?? 'prompt';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `custom/${baseName}-${timestamp}`;
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
      if (issue.rating === null) {
        remaining[issue.file] += 1;
      }
    }

    this.remainingIssuesByFile = remaining;
  }
}
