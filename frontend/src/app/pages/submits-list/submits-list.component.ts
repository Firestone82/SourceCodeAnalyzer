import {Component, OnDestroy, OnInit} from '@angular/core';
import {Router, RouterLink} from '@angular/router';
import {DatePipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {NzTableModule} from 'ng-zorro-antd/table';
import {NzButtonModule} from 'ng-zorro-antd/button';
import {NzTagModule} from 'ng-zorro-antd/tag';
import {NzInputModule} from 'ng-zorro-antd/input';
import {NzCheckboxModule} from 'ng-zorro-antd/checkbox';
import {SubmitsApiService} from '../../service/api/types/submits-api.service';
import {SubmitListItemDto, SubmitListResponseDto} from '../../service/api/api.models';
import {catchError, finalize, interval, merge, of, Subject, switchMap, takeUntil, startWith} from 'rxjs';
import {NzCardComponent} from 'ng-zorro-antd/card';
import {SubmitUploadModalComponent} from '../../components/submit-upload-modal/submit-upload-modal.component';
import {JobCreatedModalComponent} from '../../components/job-created-modal/job-created-modal.component';
import {JobsApiService} from '../../service/api/types/jobs-api.service';
import {PromptsApiService} from '../../service/api/types/prompts-api.service';
import {NzTypographyModule} from 'ng-zorro-antd/typography';
import {PromptContentResponseDto, PromptNamesResponseDto, PromptUploadResponseDto} from '../../service/api/api.models';

@Component({
  selector: 'app-submits-list',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    NzTableModule,
    NzButtonModule,
    NzTagModule,
    NzInputModule,
    NzCheckboxModule,
    NzCardComponent,
    NzTypographyModule,
    SubmitUploadModalComponent,
    JobCreatedModalComponent
  ],
  templateUrl: './submits-list.component.html',
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

  isUploadModalVisible: boolean = false;
  uploadModel: string = '';
  sourceName: string = '';
  promptName: string = '';
  promptPaths: string[] = [];
  selectedPromptPath: string | null = null;
  promptContent: string = '';
  promptDraft: string = '';
  promptErrorMessage: string | null = null;
  sourceFile: File | null = null;
  isPromptOptionsLoading: boolean = false;
  isSubmittingUpload: boolean = false;
  uploadErrorMessage: string | null = null;
  pendingUpload: { jobId: string; sourcePath: string; promptPath: string; model: string } | null = null;
  isJobModalVisible: boolean = false;
  jobModalIds: string[] = [];
  private readonly destroy$ = new Subject<void>();
  private readonly uploadPollingStop$ = new Subject<void>();

  public constructor(
    private readonly submitsApiService: SubmitsApiService,
    private readonly promptsApiService: PromptsApiService,
    private readonly jobsApiService: JobsApiService,
    private readonly router: Router
  ) {
  }

  public ngOnInit(): void {
    this.loadSubmits();
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

  public openUploadModal(): void {
    this.isUploadModalVisible = true;
    this.uploadErrorMessage = null;
    this.promptErrorMessage = null;
    this.loadPromptPaths();
  }

  public handleSourceFileSelected(file: File | null): void {
    this.sourceFile = file;
  }

  public handlePromptSelection(promptPath: string | null): void {
    if (!promptPath) {
      this.selectedPromptPath = null;
      this.promptContent = '';
      return;
    }

    if (this.selectedPromptPath === promptPath) {
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

  public submitUpload(): void {
    if (!this.canSubmitUpload) {
      return;
    }

    this.uploadErrorMessage = null;
    this.isSubmittingUpload = true;

    const trimmedDraft = this.promptDraft.trim();
    const trimmedContent = this.promptContent.trim();
    const hasPromptChanged = !this.selectedPromptPath || trimmedDraft !== trimmedContent;

    const finalizeUpload = (promptPath: string): void => {
      const formData = new FormData();
      formData.append('model', this.uploadModel.trim());

      if (this.sourceName.trim()) {
        formData.append('source_path', this.sourceName.trim());
      }

      if (this.sourceFile) {
        formData.append('source_file', this.sourceFile);
      }

      formData.append('prompt_path', promptPath);

      this.submitsApiService
        .uploadSubmit(formData)
        .pipe(
          catchError(() => {
            this.uploadErrorMessage = 'Failed to upload submit.';
            return of(null);
          }),
          finalize(() => {
            this.isSubmittingUpload = false;
          })
        )
        .subscribe((response) => {
          if (!response) {
            return;
          }
          this.isUploadModalVisible = false;
          this.pendingUpload = {
            jobId: response.job_id,
            sourcePath: response.source_path,
            promptPath: response.prompt_path,
            model: response.model
          };
          this.jobModalIds = [response.job_id];
          this.isJobModalVisible = true;
          this.startUploadPolling();
          this.resetUploadForm();
          this.loadSubmits();
        });
    };

    if (hasPromptChanged) {
      const uploadName = this.promptName.trim()
        ? this.promptName.trim()
        : this.buildPromptUploadName(this.selectedPromptPath);
      this.promptsApiService
        .uploadPrompt({
          prompt_path: uploadName,
          content: trimmedDraft
        })
        .pipe(
          catchError(() => {
            this.uploadErrorMessage = 'Failed to upload prompt.';
            return of<PromptUploadResponseDto | null>(null);
          })
        )
        .subscribe((response) => {
          if (!response) {
            this.isSubmittingUpload = false;
            return;
          }
          finalizeUpload(response.prompt_path);
        });
    } else if (this.selectedPromptPath) {
      finalizeUpload(this.selectedPromptPath);
    }
  }

  public get canSubmitUpload(): boolean {
    return Boolean(
      this.uploadModel.trim() &&
      this.sourceFile &&
      this.promptDraft.trim() &&
      !this.isPromptOptionsLoading &&
      !this.isSubmittingUpload
    );
  }

  private resetUploadForm(): void {
    this.uploadModel = '';
    this.sourceName = '';
    this.promptName = '';
    this.selectedPromptPath = null;
    this.promptContent = '';
    this.promptDraft = '';
    this.promptErrorMessage = null;
    this.sourceFile = null;
  }

  private loadPromptPaths(): void {
    this.isPromptOptionsLoading = true;
    this.promptsApiService
      .getPromptPaths()
      .pipe(
        catchError(() => {
          this.promptErrorMessage = 'Failed to load prompt options.';
          return of<PromptNamesResponseDto>({prompt_paths: []});
        }),
        finalize(() => {
          this.isPromptOptionsLoading = false;
        })
      )
      .subscribe((response) => {
        this.promptPaths = response.prompt_paths;
        if (!this.selectedPromptPath && this.promptPaths.length > 0) {
          this.handlePromptSelection(this.promptPaths[0]);
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

  private buildPromptUploadName(promptPath: string | null): string {
    const baseName = promptPath?.split('/').filter(Boolean).pop() ?? 'prompt';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `custom/${baseName}-${timestamp}`;
  }

  private loadSubmits(): void {
    this.isLoading = true;

    this.submitsApiService
      .getSubmits(
        this.pageIndex,
        this.pageSize,
        this.onlyUnrated,
        this.modelFilter,
        this.sourceFilter,
        this.promptFilter
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
}
