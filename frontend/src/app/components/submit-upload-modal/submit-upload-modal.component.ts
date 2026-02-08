import {Component, EventEmitter, Input, OnChanges, Output, SimpleChanges} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {NzAutocompleteModule} from 'ng-zorro-antd/auto-complete';
import {NzInputModule} from 'ng-zorro-antd/input';
import {NzModalModule} from 'ng-zorro-antd/modal';
import {NzSelectModule} from 'ng-zorro-antd/select';
import {NzTypographyModule} from 'ng-zorro-antd/typography';
import {catchError, finalize, of} from 'rxjs';
import {PromptsApiService} from '../../service/api/types/prompts-api.service';
import {SubmitsApiService} from '../../service/api/types/submits-api.service';
import {AnalyzeSourceResponseDto, PromptContentResponseDto, PromptNamesResponseDto} from '../../service/api/api.models';
import {SubmitFooterComponent} from '../submit-footer/submit-footer.component';
import {environment} from '../../../environments/environment';

@Component({
  selector: 'app-submit-upload-modal',
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
  templateUrl: './submit-upload-modal.component.html'
})
export class SubmitUploadModalComponent implements OnChanges {
  @Input() public isVisible: boolean = false;
  @Output() public readonly isVisibleChange = new EventEmitter<boolean>();
  @Output() public readonly uploadComplete = new EventEmitter<AnalyzeSourceResponseDto>();

  public uploadModel: string = '';
  public sourceName: string = '';
  public promptName: string = '';
  public promptPaths: string[] = [];
  public selectedPromptPath: string | null = null;
  public promptDraft: string = '';
  public promptErrorMessage: string | null = null;
  public sourceFile: File | null = null;
  public isPromptOptionsLoading: boolean = false;
  public isSubmitting: boolean = false;
  public uploadErrorMessage: string | null = null;
  private promptContent: string = '';

  public constructor(
    private readonly promptsApiService: PromptsApiService,
    private readonly submitsApiService: SubmitsApiService
  ) {
  }

  public get filteredModelOptions(): string[] {
    const query = this.uploadModel.trim().toLowerCase();
    if (!query) {
      return environment.models ?? [];
    }

    return (environment.models ?? []).filter((model: string) => model.toLowerCase().includes(query));
  }

  public get sourceFileName(): string | null {
    return this.sourceFile?.name ?? null;
  }

  public get canSubmit(): boolean {
    return Boolean(
      this.uploadModel.trim()
      && this.sourceFile
      && this.promptDraft.trim()
      && !this.isPromptOptionsLoading
      && !this.isSubmitting
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
    this.uploadModel = model;
  }

  public handlePromptSelection(promptPath: string | null): void {
    if (!promptPath) {
      this.selectedPromptPath = null;
      this.promptContent = '';
      this.promptDraft = '';
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

  public handleSourceNameChange(name: string): void {
    this.sourceName = name;
  }

  public handlePromptNameChange(name: string): void {
    this.promptName = name;
  }

  public handleSourceFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files.length > 0 ? input.files[0] : null;
    this.sourceFile = file;
  }

  public handlePromptDraftChange(draft: string): void {
    this.promptDraft = draft;
  }

  public handleSubmit(): void {
    if (!this.canSubmit) {
      return;
    }

    this.uploadErrorMessage = null;
    this.isSubmitting = true;

    const trimmedDraft = this.promptDraft.trim();
    const trimmedContent = this.promptContent.trim();
    const hasPromptChanged = !this.selectedPromptPath || trimmedDraft !== trimmedContent;

    const finalizeUpload = (promptPath: string, promptFile?: File): void => {
      const formData = new FormData();
      formData.append('model', this.uploadModel.trim());

      const normalizedSourceName = this.normalizeUploadName(this.sourceName.trim());
      const sourcePath = normalizedSourceName || this.buildSourceUploadName();
      formData.append('source_path', sourcePath);

      if (this.sourceFile) {
        formData.append('source_file', this.sourceFile);
      }

      formData.append('prompt_path', promptPath);
      if (promptFile) {
        formData.append('prompt_file', promptFile);
      }

      this.submitsApiService
        .uploadSubmit(formData)
        .pipe(
          catchError(() => {
            this.uploadErrorMessage = 'Failed to upload submit.';
            return of(null);
          }),
          finalize(() => {
            this.isSubmitting = false;
          })
        )
        .subscribe((response) => {
          if (!response) {
            return;
          }
          this.uploadComplete.emit(response);
          this.closeModal();
        });
    };

    if (hasPromptChanged) {
      const normalizedPromptName = this.normalizeUploadName(this.promptName.trim());
      const uploadName = normalizedPromptName || this.buildPromptUploadName();
      const promptFile = new File([trimmedDraft], `${uploadName}.txt`, {type: 'text/plain'});
      finalizeUpload(uploadName, promptFile);
    } else if (this.selectedPromptPath) {
      finalizeUpload(this.selectedPromptPath);
    }
  }

  private initializeModal(): void {
    this.uploadErrorMessage = null;
    this.promptErrorMessage = null;
    this.loadPromptPaths();
  }

  private resetForm(): void {
    this.uploadModel = '';
    this.sourceName = '';
    this.promptName = '';
    this.promptPaths = [];
    this.selectedPromptPath = null;
    this.promptContent = '';
    this.promptDraft = '';
    this.promptErrorMessage = null;
    this.sourceFile = null;
    this.isPromptOptionsLoading = false;
    this.isSubmitting = false;
    this.uploadErrorMessage = null;
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

  private buildPromptUploadName(): string {
    return `prompt-${this.buildUploadTimestamp()}`;
  }

  private buildSourceUploadName(): string {
    return `src-${this.buildUploadTimestamp()}`;
  }

  private buildUploadTimestamp(): string {
    const iso = new Date().toISOString();
    const date = iso.slice(0, 10);
    const time = iso.slice(11, 16).replace(':', '-');
    return `${date}-${time}`;
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
}
