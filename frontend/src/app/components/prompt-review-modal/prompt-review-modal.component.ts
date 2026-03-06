import {Component, EventEmitter, Input, OnChanges, Output, SimpleChanges} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {NzAutocompleteModule} from 'ng-zorro-antd/auto-complete';
import {NzInputModule} from 'ng-zorro-antd/input';
import {NzModalModule} from 'ng-zorro-antd/modal';
import {NzSelectModule} from 'ng-zorro-antd/select';
import {NzSpinModule} from 'ng-zorro-antd/spin';
import {NzTypographyModule} from 'ng-zorro-antd/typography';
import {NzMessageService} from 'ng-zorro-antd/message';
import {catchError, finalize, forkJoin, of} from 'rxjs';
import {SourcesApiService} from '../../service/api/types/sources-api.service';
import {
  AnalyzeSourceResponseDto,
  AnalysisMode,
  OpenAIServerDto,
  OpenAIServerListResponseDto
} from '../../service/api/api.models';
import {SubmitFooterComponent} from '../submit-footer/submit-footer.component';
import {SourceTreeSelectorComponent} from '../source-tree-selector/source-tree-selector.component';
import {ConfigApiService} from '../../service/api/types/config-api.service';
import {NzRadioComponent, NzRadioGroupComponent} from 'ng-zorro-antd/radio';

@Component({
  selector: 'app-prompt-review-modal',
  standalone: true,
  imports: [
    FormsModule,
    NzAutocompleteModule,
    NzInputModule,
    NzModalModule,
    NzSpinModule,
    NzTypographyModule,
    NzSelectModule,
    SubmitFooterComponent,
    SourceTreeSelectorComponent,
    NzRadioGroupComponent,
    NzRadioComponent
  ],
  templateUrl: './prompt-review-modal.component.html'
})
export class PromptReviewModalComponent implements OnChanges {
  @Input() public isVisible: boolean = false;
  @Output() public readonly isVisibleChange = new EventEmitter<boolean>();
  @Input() public selectedPromptPath: string | null = null;
  @Input() public defaultModel: string = '';
  @Output() public readonly reviewsQueued = new EventEmitter<AnalyzeSourceResponseDto[]>();

  public reviewModel: string = '';
  public analysisMode: AnalysisMode = 'chain_of_thought';
  public readonly analysisModeOptions: Array<{label: string; value: AnalysisMode}> = [
    {label: 'Chain of thought', value: 'chain_of_thought'},
    {label: 'One-shot', value: 'one_shot'}
  ];
  public selectedSourceKeys: string[] = [];
  public selectedSourceLeafKeys: string[] = [];
  public isSourceOptionsLoading: boolean = false;
  public isSubmittingReview: boolean = false;
  public reviewSubmitError: string | null = null;
  public openaiServerOptions: OpenAIServerDto[] = [];
  public selectedOpenaiServer: string | null = null;

  public constructor(
    private readonly sourcesApiService: SourcesApiService,
    private readonly nzMessageService: NzMessageService,
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


  public get selectedSourcesCount(): number {
    return this.selectedSourceLeafKeys.length;
  }

  public get canSubmitBulkReview(): boolean {
    return Boolean(
      this.selectedPromptPath
      && this.reviewModel.trim()
      && this.selectedSourceLeafKeys.length > 0
      && this.selectedOpenaiServer
      && !this.isSubmittingReview
      && !this.isSourceOptionsLoading
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

  public handleSourceKeysChange(keys: string[]): void {
    this.selectedSourceKeys = keys;
  }

  public handleLeafSelectionChange(leafKeys: string[]): void {
    this.selectedSourceLeafKeys = leafKeys;
  }

  public handleSourceLoadingChange(isLoading: boolean): void {
    this.isSourceOptionsLoading = isLoading;
  }

  public handleSourceError(errorMessage: string | null): void {
    this.reviewSubmitError = errorMessage;
  }

  public handleSubmit(): void {
    if (!this.selectedPromptPath || !this.canSubmitBulkReview) {
      return;
    }

    const selectedSources = this.selectedSourceLeafKeys;
    if (selectedSources.length === 0) {
      return;
    }

    this.isSubmittingReview = true;
    this.reviewSubmitError = null;

    const requests = selectedSources.map((sourcePath: string) => (
      this.sourcesApiService
        .analyzeSource(sourcePath, {
          model: this.reviewModel.trim(),
          prompt_path: this.selectedPromptPath!,
          analysis_mode: this.analysisMode,
          openai_server: this.selectedOpenaiServer!
        })
        .pipe(catchError(() => of(null)))
    ));

    forkJoin(requests)
      .pipe(
        finalize(() => {
          this.isSubmittingReview = false;
        })
      )
      .subscribe((responses) => {
        const successResponses = responses.filter(Boolean) as AnalyzeSourceResponseDto[];
        const successCount = successResponses.length;
        if (successCount === 0) {
          this.reviewSubmitError = 'Failed to submit reviews.';
          this.nzMessageService.error('Failed to queue prompt review jobs.');
          return;
        }

        this.reviewsQueued.emit(successResponses);
        if (successCount < selectedSources.length) {
          this.reviewSubmitError = 'Some reviews failed to queue.';
          this.nzMessageService.warning(`Queued ${successCount}/${selectedSources.length} review jobs.`);
        } else {
          this.nzMessageService.success(`Queued ${successCount} review jobs.`);
        }
        this.closeModal();
      });
  }

  private initializeModal(): void {
    this.reviewSubmitError = null;
    this.reviewModel = this.defaultModel ?? '';
    this.analysisMode = 'chain_of_thought';
    this.loadOpenaiServers();
    this.selectedSourceKeys = [];
    this.selectedSourceLeafKeys = [];
  }

  private resetForm(): void {
    this.reviewModel = '';
    this.analysisMode = 'chain_of_thought';
    this.selectedSourceKeys = [];
    this.selectedSourceLeafKeys = [];
    this.isSourceOptionsLoading = false;
    this.isSubmittingReview = false;
    this.reviewSubmitError = null;
    this.openaiServerOptions = [];
    this.selectedOpenaiServer = null;
  }

  private loadOpenaiServers(): void {
    this.configApiService
      .getOpenAIServers()
      .pipe(catchError(() => of<OpenAIServerListResponseDto>({servers: []})))
      .subscribe((response) => {
        this.openaiServerOptions = response.servers;
        this.selectedOpenaiServer = null;
      });
  }
}
