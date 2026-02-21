import {Component, OnDestroy, OnInit} from '@angular/core';
import {Router, RouterLink} from '@angular/router';
import {FormsModule} from '@angular/forms';
import {NzTableModule} from 'ng-zorro-antd/table';
import {NzButtonModule} from 'ng-zorro-antd/button';
import {NzTagModule} from 'ng-zorro-antd/tag';
import {NzInputModule} from 'ng-zorro-antd/input';
import {NzCheckboxModule} from 'ng-zorro-antd/checkbox';
import {NzAutocompleteModule} from 'ng-zorro-antd/auto-complete';
import {SubmitsApiService} from '../../service/api/types/submits-api.service';
import {AnalyzeSourceResponseDto, SubmitListItemDto, SubmitListResponseDto, SubmitRatingState} from '../../service/api/api.models';
import {catchError, finalize, forkJoin, interval, merge, of, startWith, Subject, switchMap, takeUntil} from 'rxjs';
import {NzCardComponent} from 'ng-zorro-antd/card';
import {SubmitUploadModalComponent} from '../../components/submit-upload-modal/submit-upload-modal.component';
import {JobCreatedModalComponent} from '../../components/job-created-modal/job-created-modal.component';
import {JobsApiService} from '../../service/api/types/jobs-api.service';
import {NzTypographyModule} from 'ng-zorro-antd/typography';
import {AuthService} from '../../service/auth/auth.service';
import {NzMessageService} from 'ng-zorro-antd/message';
import {NzIconDirective} from 'ng-zorro-antd/icon';
import {PromptsApiService} from '../../service/api/types/prompts-api.service';
import {SourcesApiService} from '../../service/api/types/sources-api.service';

@Component({
  selector: 'app-submits-list',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    NzTableModule,
    NzButtonModule,
    NzTagModule,
    NzInputModule,
    NzCheckboxModule,
    NzAutocompleteModule,
    NzCardComponent,
    NzTypographyModule,
    SubmitUploadModalComponent,
    JobCreatedModalComponent,
    NzIconDirective
  ],
  templateUrl: './submits-list.component.html',
  styleUrl: './submits-list.component.css'
})
export class SubmitsListComponent implements OnInit, OnDestroy {
  submits: SubmitListItemDto[] = [];
  isLoading: boolean = false;
  errorMessage: string | null = null;

  // Table
  pageIndex: number = 1;
  pageSize: number = 20;
  totalSubmits: number = 0;
  onlyUnrated: boolean = true;
  modelFilter: string = '';
  promptFilter: string = '';
  sourceFilter: string = '';
  sourceTagFilter: string = '';

  isUploadModalVisible: boolean = false;
  pendingUpload: { jobId: string; sourcePath: string; promptPath: string; model: string } | null = null;
  isJobModalVisible: boolean = false;
  jobModalIds: string[] = [];
  isAdmin: boolean = false;
  publishingSubmitIds: Set<number> = new Set<number>();
  deletingSubmitIds: Set<number> = new Set<number>();
  selectedSubmitIds: Set<number> = new Set<number>();
  isMassPublishing: boolean = false;
  isMassDeleting: boolean = false;
  isMassReanalyzing: boolean = false;
  availablePromptPaths: string[] = [];
  massReanalyzePromptPath: string = '';
  private readonly destroy$ = new Subject<void>();
  private readonly uploadPollingStop$ = new Subject<void>();
  private readonly sourceTagColors: string[] = ['blue', 'green', 'red', 'orange', 'purple', 'cyan', 'magenta', 'lime'];

  public constructor(
    private readonly submitsApiService: SubmitsApiService,
    private readonly jobsApiService: JobsApiService,
    private readonly promptsApiService: PromptsApiService,
    private readonly sourcesApiService: SourcesApiService,
    private readonly router: Router,
    private readonly authService: AuthService,
    private readonly nzMessageService: NzMessageService
  ) {
  }

  public ngOnInit(): void {
    this.loadSubmits();
    this.loadPromptPaths();
    this.authService.rater$
      .pipe(takeUntil(this.destroy$))
      .subscribe((rater) => {
        this.isAdmin = Boolean(rater?.admin);
      });
  }

  public get selectedSubmitsCount(): number {
    return this.selectedSubmitIds.size;
  }

  public get isAllOnPageSelected(): boolean {
    return this.submits.length > 0 && this.submits.every((submit) => this.selectedSubmitIds.has(submit.id));
  }

  public get isPartiallySelectedOnPage(): boolean {
    if (this.submits.length === 0) {
      return false;
    }

    const selectedOnPage = this.submits.filter((submit) => this.selectedSubmitIds.has(submit.id)).length;
    return selectedOnPage > 0 && selectedOnPage < this.submits.length;
  }

  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.uploadPollingStop$.next();
    this.uploadPollingStop$.complete();
  }

  public applyFilters(): void {
    this.pageIndex = 1;
    this.loadSubmits();
  }

  public onPageIndexChange(pageIndex: number): void {
    this.pageIndex = pageIndex;
    this.loadSubmits();
  }

  public onPageSizeChange(pageSize: number): void {
    this.pageSize = pageSize;
    this.pageIndex = 1;
    this.loadSubmits();
  }

  public toggleSelectAllOnPage(checked: boolean): void {
    for (const submit of this.submits) {
      if (checked) {
        this.selectedSubmitIds.add(submit.id);
      } else {
        this.selectedSubmitIds.delete(submit.id);
      }
    }
  }

  public toggleSubmitSelection(submitId: number, checked: boolean): void {
    if (checked) {
      this.selectedSubmitIds.add(submitId);
      return;
    }
    this.selectedSubmitIds.delete(submitId);
  }

  public clearSelection(): void {
    this.selectedSubmitIds.clear();
  }



  public ratingStateLabel(state: SubmitRatingState): string {
    if (state === 'rated') {
      return 'Rated';
    }

    if (state === 'partially_rated') {
      return 'Partialy rated';
    }

    return 'Not rated';
  }

  public sourceTagColor(tag: string | null | undefined): string {
    if (!tag) {
      return 'default';
    }
    const hash = Array.from(tag).reduce((accumulator, character) => accumulator + character.charCodeAt(0), 0);
    return this.sourceTagColors[hash % this.sourceTagColors.length];
  }

  public ratingStateColor(state: SubmitRatingState): string {
    if (state === 'rated') {
      return 'green';
    }

    if (state === 'partially_rated') {
      return 'gold';
    }

    return 'red';
  }

  public openUploadModal(): void {
    if (!this.isAdmin) {
      this.nzMessageService.error('Only admins can upload submits.');
      return;
    }
    this.isUploadModalVisible = true;
  }

  public handleRateClick(event: Event, submit: SubmitListItemDto): void {
    if (!this.isAdmin && !submit.published) {
      event.preventDefault();
      event.stopPropagation();
      this.nzMessageService.error('Only admins can review unpublished submits.');
    }
  }

  public handleUploadCompleted(response: AnalyzeSourceResponseDto): void {
    this.pendingUpload = {
      jobId: response.job_id,
      sourcePath: response.source_path,
      promptPath: response.prompt_path,
      model: response.model
    };
    this.jobModalIds = [response.job_id];
    this.isJobModalVisible = true;
    this.startUploadPolling();
    this.loadSubmits();
  }

  public togglePublish(submit: SubmitListItemDto): void {
    if (!this.isAdmin || this.publishingSubmitIds.has(submit.id)) {
      return;
    }

    this.publishingSubmitIds.add(submit.id);
    this.submitsApiService
      .setSubmitPublishState(submit.id, !submit.published)
      .pipe(finalize(() => this.publishingSubmitIds.delete(submit.id)))
      .subscribe({
        next: (response) => {
          submit.published = response.published;
        },
        error: () => {
          this.errorMessage = 'Failed to update submit visibility.';
        }
      });
  }


  public deleteSubmit(submit: SubmitListItemDto): void {
    if (!this.isAdmin || this.deletingSubmitIds.has(submit.id)) {
      return;
    }

    this.deletingSubmitIds.add(submit.id);
    this.submitsApiService
      .deleteSubmit(submit.id)
      .pipe(finalize(() => this.deletingSubmitIds.delete(submit.id)))
      .subscribe({
        next: () => {
          this.nzMessageService.success('Submit deleted.');
          this.loadSubmits();
        },
        error: () => {
          this.errorMessage = 'Failed to delete submit.';
        }
      });
  }

  public massSetPublishState(published: boolean): void {
    if (!this.isAdmin || this.isMassPublishing || this.selectedSubmitIds.size === 0) {
      return;
    }

    this.isMassPublishing = true;
    const selectedSubmits = this.submits.filter((submit) => this.selectedSubmitIds.has(submit.id));
    const requests = selectedSubmits.map((submit) => this.submitsApiService
      .setSubmitPublishState(submit.id, published)
      .pipe(catchError(() => of(null))));

    forkJoin(requests)
      .pipe(finalize(() => {
        this.isMassPublishing = false;
      }))
      .subscribe((responses) => {
        const successCount = responses.filter(Boolean).length;
        if (successCount === 0) {
          this.nzMessageService.error(`Failed to ${published ? 'publish' : 'unpublish'} selected submits.`);
          return;
        }

        if (successCount < selectedSubmits.length) {
          this.nzMessageService.warning(`${published ? 'Published' : 'Unpublished'} ${successCount}/${selectedSubmits.length} submits.`);
        } else {
          this.nzMessageService.success(`${published ? 'Published' : 'Unpublished'} ${successCount} submits.`);
        }

        this.loadSubmits();
      });
  }

  public massDeleteSubmits(): void {
    if (!this.isAdmin || this.isMassDeleting || this.selectedSubmitIds.size === 0) {
      return;
    }

    this.isMassDeleting = true;
    const selectedSubmits = this.submits.filter((submit) => this.selectedSubmitIds.has(submit.id));
    const requests = selectedSubmits.map((submit) => this.submitsApiService
      .deleteSubmit(submit.id)
      .pipe(catchError(() => of(null))));

    forkJoin(requests)
      .pipe(finalize(() => {
        this.isMassDeleting = false;
      }))
      .subscribe((responses) => {
        const successCount = responses.filter(Boolean).length;
        if (successCount === 0) {
          this.nzMessageService.error('Failed to delete selected submits.');
          return;
        }

        if (successCount < selectedSubmits.length) {
          this.nzMessageService.warning(`Deleted ${successCount}/${selectedSubmits.length} submits.`);
        } else {
          this.nzMessageService.success(`Deleted ${successCount} submits.`);
        }

        this.clearSelection();
        this.loadSubmits();
      });
  }

  public massReanalyzeWithPrompt(): void {
    const promptPath = this.massReanalyzePromptPath.trim();
    if (!this.isAdmin || this.isMassReanalyzing || !promptPath || this.selectedSubmitIds.size === 0) {
      return;
    }

    this.isMassReanalyzing = true;
    const selectedSubmits = this.submits.filter((submit) => this.selectedSubmitIds.has(submit.id));
    const requests = selectedSubmits.map((submit) => this.sourcesApiService
      .analyzeSource(submit.source_path, {
        model: submit.model,
        prompt_path: promptPath
      })
      .pipe(catchError(() => of(null))));

    forkJoin(requests)
      .pipe(finalize(() => {
        this.isMassReanalyzing = false;
      }))
      .subscribe((responses) => {
        const successResponses = responses.filter(Boolean) as AnalyzeSourceResponseDto[];
        const successCount = successResponses.length;
        if (successCount === 0) {
          this.nzMessageService.error('Failed to queue reevaluation jobs.');
          return;
        }

        this.jobModalIds = successResponses.map((response) => response.job_id);
        this.isJobModalVisible = true;

        if (successCount < selectedSubmits.length) {
          this.nzMessageService.warning(`Queued ${successCount}/${selectedSubmits.length} reevaluation jobs.`);
        } else {
          this.nzMessageService.success(`Queued ${successCount} reevaluation jobs.`);
        }
      });
  }

  private startUploadPolling(): void {
    if (!this.pendingUpload) {
      return;
    }

    const pending = this.pendingUpload;
    this.uploadPollingStop$.next();
    interval(4000)
      .pipe(
        startWith(0),
        switchMap(() => this.jobsApiService.getJob(pending.jobId)),
        catchError(() => of(null)),
        takeUntil(merge(this.destroy$, this.uploadPollingStop$))
      )
      .subscribe((response) => {
        if (!response) {
          return;
        }
        if (response.status === 'failed') {
          this.pendingUpload = null;
          this.uploadPollingStop$.next();
          return;
        }
        if (response.status === 'succeeded' && response.submit_id) {
          this.pendingUpload = null;
          this.uploadPollingStop$.next();
          void this.router.navigate(['/submits', response.submit_id]);
        }
      });
  }

  private loadSubmits(): void {
    this.isLoading = true;
    this.errorMessage = null;

    this.submitsApiService
      .getSubmits(
        this.pageIndex,
        this.pageSize,
        this.onlyUnrated,
        this.modelFilter,
        this.sourceFilter,
        this.promptFilter,
        this.sourceTagFilter
      )
      .pipe(
        catchError(() => {
          this.errorMessage = 'Failed to load submits.';
          return of<SubmitListResponseDto>({
            items: [],
            total: 0,
            page: this.pageIndex,
            page_size: this.pageSize
          });
        }),
        finalize(() => {
          this.isLoading = false;
        })
      )
      .subscribe((response: SubmitListResponseDto) => {
        this.submits = response.items;
        this.totalSubmits = response.total;
      });
  }

  private loadPromptPaths(): void {
    this.promptsApiService.getPromptPaths().subscribe({
      next: (response) => {
        this.availablePromptPaths = response.prompt_paths ?? [];
      },
      error: () => {
        this.availablePromptPaths = [];
      }
    });
  }
}
