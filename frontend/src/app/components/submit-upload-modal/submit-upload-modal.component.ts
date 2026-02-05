import {Component, EventEmitter, Input, Output} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {NzAutocompleteModule} from 'ng-zorro-antd/auto-complete';
import {NzInputModule} from 'ng-zorro-antd/input';
import {NzModalModule} from 'ng-zorro-antd/modal';
import {NzSelectModule} from 'ng-zorro-antd/select';
import {NzTypographyModule} from 'ng-zorro-antd/typography';

import {KNOWN_MODELS} from '../../shared/model-options';

@Component({
  selector: 'app-submit-upload-modal',
  standalone: true,
  imports: [
    FormsModule,
    NzAutocompleteModule,
    NzInputModule,
    NzModalModule,
    NzSelectModule,
    NzTypographyModule
  ],
  templateUrl: './submit-upload-modal.component.html'
})
export class SubmitUploadModalComponent {
  @Input() public isVisible: boolean = false;
  @Output() public readonly isVisibleChange = new EventEmitter<boolean>();
  @Input() public uploadModel: string = '';
  @Output() public readonly uploadModelChange = new EventEmitter<string>();
  @Input() public sourceName: string = '';
  @Output() public readonly sourceNameChange = new EventEmitter<string>();
  @Input() public promptName: string = '';
  @Output() public readonly promptNameChange = new EventEmitter<string>();
  @Input() public promptPaths: string[] = [];
  @Input() public selectedPromptPath: string | null = null;
  @Output() public readonly selectedPromptPathChange = new EventEmitter<string | null>();
  @Input() public promptDraft: string = '';
  @Output() public readonly promptDraftChange = new EventEmitter<string>();
  @Input() public promptErrorMessage: string | null = null;
  @Input() public sourceFileName: string | null = null;
  @Input() public isPromptOptionsLoading: boolean = false;
  @Input() public isSubmitting: boolean = false;
  @Input() public canSubmit: boolean = false;
  @Input() public uploadErrorMessage: string | null = null;
  @Output() public readonly sourceFileSelected = new EventEmitter<File | null>();
  @Output() public readonly submitUpload = new EventEmitter<void>();

  public get filteredModelOptions(): string[] {
    const query = this.uploadModel.trim().toLowerCase();
    if (!query) {
      return KNOWN_MODELS;
    }
    return KNOWN_MODELS.filter((model) => model.toLowerCase().includes(query));
  }

  public closeModal(): void {
    this.isVisibleChange.emit(false);
  }

  public handleModelChange(model: string): void {
    this.uploadModelChange.emit(model);
  }

  public handlePromptSelection(promptPath: string | null): void {
    this.selectedPromptPathChange.emit(promptPath);
  }

  public handleSourceNameChange(name: string): void {
    this.sourceNameChange.emit(name);
  }

  public handlePromptNameChange(name: string): void {
    this.promptNameChange.emit(name);
  }

  public handleSourceFileInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files.length > 0 ? input.files[0] : null;
    this.sourceFileSelected.emit(file);
  }

  public handlePromptDraftChange(draft: string): void {
    this.promptDraftChange.emit(draft);
  }

  public handleSubmit(): void {
    this.submitUpload.emit();
  }
}
