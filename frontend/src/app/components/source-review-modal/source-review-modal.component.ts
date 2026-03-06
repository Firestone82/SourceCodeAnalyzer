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
  AnalysisMode,
  OpenAIServerDto,
  OpenAIServerListResponseDto,
  PromptContentResponseDto,
  PromptNamesResponseDto
} from '../../service/api/api.models';
import {SubmitFooterComponent} from '../submit-footer/submit-footer.component';
import {ConfigApiService} from '../../service/api/types/config-api.service';
import {NzRadioComponent, NzRadioGroupComponent} from 'ng-zorro-antd/radio';

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
    SubmitFooterComponent,
    NzRadioComponent,
    NzRadioGroupComponent
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
  public analysisMode: AnalysisMode = 'chain_of_thought';
  public readonly analysisModeOptions: Array<{label: string; value: AnalysisMode}> = [
    {label: 'Chain of thought', value: 'chain_of_thought'},
    {label: 'One-shot', value: 'one_shot'}
  ];
  public promptPaths: string[] = [];
  public selectedPromptPath: string | null = null;
  public promptName: string = '';
  public promptDraft: string = '';
  public promptErrorMessage: string | null = null;
  public reviewSubmitError: string | null = null;
  public openaiServerOptions: OpenAIServerDto[] = [];
  public selectedOpenaiServer: string | null = null;
  public isPromptOptionsLoading: boolean = false;
  public isSubmittingReview: boolean = false;
  private promptContent: string = '';

  public constructor(
    private readonly promptsApiService: PromptsApiService,
    private readonly sourcesApiService: SourcesApiService,
    private readonly configApiService: ConfigApiService
  ) {
  }

  public get filteredModelOptions(): string[] {
    const availableModels = this.selectedServerModels;
    const query = this.reviewModel.trim().toLowerCase();
    if (!query) {
      return availableModels;
    }

    return availableModels.filter((model: string) => model.toLowerCase().includes(query));
  }

  public get selectedServerModels(): string[] {
    if (!this.selectedOpenaiServer) {
      return [];
    }

    const selectedServer = this.openaiServerOptions.find((server) => server.id === this.selectedOpenaiServer);
    return selectedServer?.models ?? [];
  }

  public get canSubmitReview(): boolean {
    return Boolean(
      this.selectedSourcePath
      && this.selectedPromptPath
      && this.reviewModel.trim()
      && this.selectedOpenaiServer
      && !this.isSubmittingReview
      && !this.isPromptOptionsLoading
    );
  }

  public get hasPromptChanged(): boolean {
    return this.promptDraft.trim() !== this.promptContent.trim();
  }

  public get isPromptNameEditable(): boolean {
    return this.hasPromptChanged;
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
    this.promptName = promptPath;
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

    if (!this.hasPromptChanged && this.selectedPromptPath) {
      this.promptName = this.selectedPromptPath;
    }
  }

  public handlePromptNameChange(name: string): void {
    this.promptName = name;
  }

  public handleAnalysisModeChange(mode: AnalysisMode): void {
    this.analysisMode = mode;
  }

  public handleOpenaiServerChange(serverId: string | null): void {
    this.selectedOpenaiServer = serverId;
    const serverModels = this.selectedServerModels;

    if (serverModels.length > 0 && !serverModels.includes(this.reviewModel.trim())) {
      this.reviewModel = '';
    }
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
        ? {model: this.reviewModel.trim(), prompt_path: promptPath, prompt_content: promptContent, analysis_mode: this.analysisMode, openai_server: this.selectedOpenaiServer!}
        : {model: this.reviewModel.trim(), prompt_path: promptPath, analysis_mode: this.analysisMode, openai_server: this.selectedOpenaiServer!};

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
      const normalizedPromptName = this.normalizeUploadName(this.promptName.trim());
      const uploadName = normalizedPromptName || this.buildPromptUploadName();
      finalizeSubmission(uploadName, trimmedPromptDraft);
    } else {
      finalizeSubmission(this.selectedPromptPath);
    }
  }

  private initializeModal(): void {
    this.reviewSubmitError = null;
    this.promptErrorMessage = null;
    this.reviewModel = this.defaultModel ?? '';
    this.analysisMode = 'chain_of_thought';
    this.loadOpenaiServers();
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
    this.analysisMode = 'chain_of_thought';
    this.promptPaths = [];
    this.selectedPromptPath = null;
    this.promptName = '';
    this.promptDraft = '';
    this.promptContent = '';
    this.promptErrorMessage = null;
    this.reviewSubmitError = null;
    this.openaiServerOptions = [];
    this.selectedOpenaiServer = null;
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
        this.promptName = promptPath;
      });
  }

  private buildPromptUploadName(): string {
    return `upload/prompt-${this.buildUploadTimestamp()}`;
  }

  private normalizeUploadName(name: string): string {
    if (!name) {
      return '';
    }

    if (name.startsWith('upload/')) {
      return name.slice('upload/'.length);
    }

    return name;
  }

  private buildUploadTimestamp(): string {
    const iso = new Date().toISOString();
    const date = iso.slice(0, 10);
    const time = iso.slice(11, 16).replace(':', '-');
    return `${date}-${time}`;
  }

  private loadOpenaiServers(): void {
    this.configApiService
      .getOpenAIServers()
      .pipe(
        catchError(() => of<OpenAIServerListResponseDto>({servers: []}))
      )
      .subscribe((response) => {
        this.openaiServerOptions = response.servers;
        this.selectedOpenaiServer = null;
      });
  }
}
