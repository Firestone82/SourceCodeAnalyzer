import {Component, EventEmitter, Input, OnChanges, Output, SimpleChanges} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {NzAutocompleteModule} from 'ng-zorro-antd/auto-complete';
import {NzInputModule} from 'ng-zorro-antd/input';
import {NzModalModule} from 'ng-zorro-antd/modal';
import {NzSelectModule} from 'ng-zorro-antd/select';
import {NzTypographyModule} from 'ng-zorro-antd/typography';
import {catchError, finalize, of} from 'rxjs';
import {PromptsApiService} from '../../service/api/types/prompts-api.service';
import {SourcesApiService} from '../../service/api/types/sources-api.service';
import {
  AnalyzeSourceResponseDto,
  PromptContentResponseDto,
  PromptNamesResponseDto
} from '../../service/api/api.models';
import {SubmitFooterComponent} from '../submit-footer/submit-footer.component';
import {environment} from '../../../environments/environment';

@Component({
  selector: 'app-source-review-modal',
  standalone: true,
  imports: [
    FormsModule,
    NzAutocompleteModule,
    NzInputModule,
    NzModalModule,
    NzSelectModule,
    NzTypographyModule,
    SubmitFooterComponent
  ],
  templateUrl: './source-review-modal.component.html'
})
export class SourceReviewModalComponent implements OnChanges {
  @Input() public isVisible: boolean = false;
  @Output() public readonly isVisibleChange = new EventEmitter<boolean>();
  @Input() public selectedSourcePath: string | null = null;
  @Input() public defaultPromptPath: string | null = null;
  @Input() public defaultModel: string = '';
  @Output() public readonly reviewQueued = new EventEmitter<AnalyzeSourceResponseDto>();

  public reviewModel: string = '';
  public promptPaths: string[] = [];
  public selectedPromptPath: string | null = null;
  public promptDraft: string = '';
  public promptErrorMessage: string | null = null;
  public reviewSubmitError: string | null = null;
  public isPromptOptionsLoading: boolean = false;
  public isSubmittingReview: boolean = false;
  private promptContent: string = '';

  public constructor(
    private readonly promptsApiService: PromptsApiService,
    private readonly sourcesApiService: SourcesApiService
  ) {
  }

  public get filteredModelOptions(): string[] {
    const query = this.reviewModel.trim().toLowerCase();
    if (!query) {
      return environment.models ?? [];
    }

    return (environment.models ?? []).filter((model) => model.toLowerCase().includes(query));
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

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible']?.currentValue) {
      this.initializeModal();
    }
  }

  public closeModal(): void {
    this.resetForm();
    this.isVisibleChange.emit(false);
  }

  public handleModelChange(model: string): void {
    this.reviewModel = model;
  }

  public handlePromptSelection(promptPath: string): void {
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

  public handleSubmit(): void {
    if (!this.canSubmitReview || !this.selectedSourcePath || !this.selectedPromptPath) {
      return;
    }

    this.isSubmittingReview = true;
    this.reviewSubmitError = null;

    const trimmedPromptDraft = this.promptDraft.trim();
    const trimmedPromptContent = this.promptContent.trim();
    const hasPromptChanged = trimmedPromptDraft !== trimmedPromptContent;

    const finalizeSubmission = (promptPath: string, promptContent?: string): void => {
      const requestPayload = promptContent
        ? {model: this.reviewModel.trim(), prompt_path: promptPath, prompt_content: promptContent}
        : {model: this.reviewModel.trim(), prompt_path: promptPath};

      this.sourcesApiService
        .analyzeSource(this.selectedSourcePath!, requestPayload)
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
          this.reviewQueued.emit(response);
          this.closeModal();
        });
    };

    if (hasPromptChanged) {
      const uploadName = this.buildPromptUploadName(this.selectedPromptPath);
      finalizeSubmission(uploadName, trimmedPromptDraft);
    } else {
      finalizeSubmission(this.selectedPromptPath);
    }
  }

  private initializeModal(): void {
    this.reviewSubmitError = null;
    this.promptErrorMessage = null;
    this.reviewModel = this.defaultModel ?? '';
    if (this.defaultPromptPath) {
      this.promptPaths = [this.defaultPromptPath];
      this.selectedPromptPath = this.defaultPromptPath;
      this.loadPromptContent(this.defaultPromptPath);
      return;
    }
    this.loadPromptOptions();
  }

  private resetForm(): void {
    this.reviewModel = '';
    this.promptPaths = [];
    this.selectedPromptPath = null;
    this.promptDraft = '';
    this.promptContent = '';
    this.promptErrorMessage = null;
    this.reviewSubmitError = null;
    this.isPromptOptionsLoading = false;
    this.isSubmittingReview = false;
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
          this.handlePromptSelection(this.promptPaths[0]);
        }
      });
  }

  private loadPromptContent(promptPath: string): void {
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

  private buildPromptUploadName(promptPath: string): string {
    const baseName = promptPath.split('/').filter(Boolean).pop() ?? 'prompt';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `custom/${baseName}-${timestamp}`;
  }
}
