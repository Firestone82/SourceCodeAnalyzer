import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {catchError, finalize, of} from 'rxjs';

import {FormsModule} from '@angular/forms';
import {NzButtonModule} from 'ng-zorro-antd/button';
import {NzCardComponent} from 'ng-zorro-antd/card';
import {NzLayoutModule} from 'ng-zorro-antd/layout';
import {NzMenuModule} from 'ng-zorro-antd/menu';
import {NzPaginationModule} from 'ng-zorro-antd/pagination';
import {NzSelectModule} from 'ng-zorro-antd/select';
import {NzSpinModule} from 'ng-zorro-antd/spin';
import {NzTypographyModule} from 'ng-zorro-antd/typography';
import {NzMessageService} from 'ng-zorro-antd/message';

import {SourcesApiService} from '../../service/api/types/sources-api.service';
import {SourceFilesResponseDto, SourcePathsResponseDto} from '../../service/api/api.models';
import {SourceCodeViewerComponent} from '../../components/source-code-viewer/source-code-viewer.component';
import {PromptsApiService} from '../../service/api/types/prompts-api.service';
import {SourceReviewModalComponent} from '../../components/source-review-modal/source-review-modal.component';
import {
  PromptContentResponseDto,
  PromptNamesResponseDto,
  PromptUploadResponseDto
} from '../../service/api/api.models';

@Component({
  selector: 'app-sources-list',
  standalone: true,
  imports: [
    FormsModule,
    NzButtonModule,
    NzCardComponent,
    NzLayoutModule,
    NzMenuModule,
    NzPaginationModule,
    NzSelectModule,
    NzSpinModule,
    NzTypographyModule,
    SourceCodeViewerComponent,
    SourceReviewModalComponent
  ],
  templateUrl: './sources-list.component.html',
})
export class SourcesListComponent implements OnInit {
  public sourcePaths: string[] = [];
  public isLoading: boolean = false;
  public isSourceLoading: boolean = false;
  public errorMessage: string | null = null;
  public sourceErrorMessage: string | null = null;
  public selectedSourcePath: string | null = null;
  public files: Record<string, string> = {};
  public fileNames: string[] = [];
  public selectedFileName: string | null = null;
  public pageIndex: number = 1;
  public pageSize: number = 12;

  public isReviewModalVisible: boolean = false;
  public promptPaths: string[] = [];
  public isPromptOptionsLoading: boolean = false;
  public selectedPromptPath: string | null = null;
  public promptContent: string = '';
  public promptDraft: string = '';
  public promptErrorMessage: string | null = null;
  public reviewModel: string = '';
  public reviewSubmitError: string | null = null;
  public isSubmittingReview: boolean = false;

  public constructor(
    private readonly sourcesApiService: SourcesApiService,
    private readonly promptsApiService: PromptsApiService,
    private readonly activatedRoute: ActivatedRoute,
    private readonly router: Router,
    private readonly nzMessageService: NzMessageService
  ) {
  }

  public ngOnInit(): void {
    this.loadSources();
  }

  public get selectedFileContent(): string {
    if (!this.selectedFileName) {
      return '';
    }
    return this.files[this.selectedFileName] ?? '';
  }

  public get pagedSourcePaths(): string[] {
    const startIndex = (this.pageIndex - 1) * this.pageSize;
    return this.sourcePaths.slice(startIndex, startIndex + this.pageSize);
  }

  public get canSubmitReview(): boolean {
    return Boolean(
      this.selectedSourcePath
      && this.selectedPromptPath
      && this.reviewModel.trim()
      && !this.isSubmittingReview
      && !this.isPromptOptionsLoading
    );
  }

  private loadSources(): void {
    this.isLoading = true;

    this.sourcesApiService
      .getSourcePaths()
      .pipe(
        catchError(() => {
          this.errorMessage = 'Failed to load sources.';
          return of<SourcePathsResponseDto>({source_paths: []});
        }),
        finalize(() => {
          this.isLoading = false;
        })
      )
      .subscribe((response: SourcePathsResponseDto) => {
        this.sourcePaths = response.source_paths;
        const requestedSource: string | null = this.activatedRoute.snapshot.queryParamMap.get('source');
        const shouldSelectSource: string | null =
          (requestedSource && this.sourcePaths.includes(requestedSource)) ? requestedSource : null;
        if (shouldSelectSource) {
          this.updatePageForSource(shouldSelectSource);
          this.selectSource(shouldSelectSource);
        } else if (this.sourcePaths.length > 0) {
          this.pageIndex = 1;
          this.selectSource(this.sourcePaths[0]);
        }
      });
  }

  public onSourcePageChange(pageIndex: number): void {
    this.pageIndex = pageIndex;
  }

  public openReviewModal(): void {
    this.isReviewModalVisible = true;
    this.reviewSubmitError = null;
    if (this.promptPaths.length === 0) {
      this.loadPromptOptions();
    } else if (!this.selectedPromptPath && this.promptPaths.length > 0) {
      this.selectPromptForReview(this.promptPaths[0]);
    }
  }

  public closeReviewModal(): void {
    this.isReviewModalVisible = false;
  }

  public selectPromptForReview(promptPath: string): void {
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

  public submitReview(): void {
    if (!this.canSubmitReview || !this.selectedSourcePath || !this.selectedPromptPath) {
      return;
    }

    this.isSubmittingReview = true;
    this.reviewSubmitError = null;

    const trimmedPromptDraft = this.promptDraft.trim();
    const trimmedPromptContent = this.promptContent.trim();
    const hasPromptChanged = trimmedPromptDraft !== trimmedPromptContent;

    const finalizeSubmission = (promptPath: string): void => {
      this.sourcesApiService
        .analyzeSource(this.selectedSourcePath!, {
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
          this.nzMessageService.success(`Review queued. Job ID: ${response.job_id}`);
          this.closeReviewModal();
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

  private loadPromptOptions(): void {
    this.isPromptOptionsLoading = true;

    this.promptsApiService
      .getPromptPaths()
      .pipe(
        catchError(() => {
          this.promptErrorMessage = 'Failed to load prompts.';
          return of<PromptNamesResponseDto>({prompt_paths: []});
        }),
        finalize(() => {
          this.isPromptOptionsLoading = false;
        })
      )
      .subscribe((response: PromptNamesResponseDto) => {
        this.promptPaths = response.prompt_paths;
        if (this.promptPaths.length > 0) {
          this.selectPromptForReview(this.promptPaths[0]);
        }
      });
  }

  private updatePageForSource(sourcePath: string): void {
    const index = this.sourcePaths.indexOf(sourcePath);
    if (index === -1) {
      return;
    }
    this.pageIndex = Math.floor(index / this.pageSize) + 1;
  }

  private buildPromptUploadName(promptPath: string): string {
    const baseName = promptPath.split('/').filter(Boolean).pop() ?? 'prompt';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `custom/${baseName}-${timestamp}`;
  }

  public selectSource(sourcePath: string): void {
    if (this.selectedSourcePath === sourcePath) {
      return;
    }

    this.selectedSourcePath = sourcePath;
    this.files = {};
    this.fileNames = [];
    this.selectedFileName = null;
    this.sourceErrorMessage = null;
    this.isSourceLoading = true;
    void this.router.navigate([], {
      queryParams: {source: sourcePath},
      queryParamsHandling: 'merge'
    });

    this.sourcesApiService
      .getSourceFiles(sourcePath)
      .pipe(
        catchError(() => {
          this.sourceErrorMessage = 'Failed to load source files.';
          return of<SourceFilesResponseDto>({source_path: sourcePath, files: {}});
        }),
        finalize(() => {
          this.isSourceLoading = false;
        })
      )
      .subscribe((response: SourceFilesResponseDto) => {
        this.files = response.files;
        this.fileNames = Object.keys(response.files).sort((left, right) => left.localeCompare(right));
        this.selectedFileName = this.fileNames.length > 0 ? this.fileNames[0] : null;
      });
  }
}
