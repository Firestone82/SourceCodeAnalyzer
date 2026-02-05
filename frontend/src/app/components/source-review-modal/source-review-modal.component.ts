import {Component, EventEmitter, Input, Output} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {NzAutocompleteModule} from 'ng-zorro-antd/auto-complete';
import {NzInputModule} from 'ng-zorro-antd/input';
import {NzModalModule} from 'ng-zorro-antd/modal';
import {NzSelectModule} from 'ng-zorro-antd/select';
import {NzTypographyModule} from 'ng-zorro-antd/typography';

import {KNOWN_MODELS} from '../../shared/model-options';

@Component({
  selector: 'app-source-review-modal',
  standalone: true,
  imports: [
    FormsModule,
    NzAutocompleteModule,
    NzInputModule,
    NzModalModule,
    NzSelectModule,
    NzTypographyModule
  ],
  templateUrl: './source-review-modal.component.html'
})
export class SourceReviewModalComponent {
  @Input() public isVisible: boolean = false;
  @Output() public readonly isVisibleChange = new EventEmitter<boolean>();
  @Input() public selectedSourcePath: string | null = null;
  @Input() public reviewModel: string = '';
  @Output() public readonly reviewModelChange = new EventEmitter<string>();
  @Input() public promptPaths: string[] = [];
  @Input() public selectedPromptPath: string | null = null;
  @Output() public readonly promptSelectionChange = new EventEmitter<string>();
  @Input() public promptDraft: string = '';
  @Output() public readonly promptDraftChange = new EventEmitter<string>();
  @Input() public promptErrorMessage: string | null = null;
  @Input() public reviewSubmitError: string | null = null;
  @Input() public isPromptOptionsLoading: boolean = false;
  @Input() public isSubmittingReview: boolean = false;
  @Input() public canSubmitReview: boolean = false;
  @Output() public readonly submitReview = new EventEmitter<void>();

  public get filteredModelOptions(): string[] {
    const query = this.reviewModel.trim().toLowerCase();
    if (!query) {
      return KNOWN_MODELS;
    }
    return KNOWN_MODELS.filter((model) => model.toLowerCase().includes(query));
  }

  public closeModal(): void {
    this.isVisibleChange.emit(false);
  }

  public handleModelChange(model: string): void {
    this.reviewModelChange.emit(model);
  }

  public handlePromptSelection(promptPath: string): void {
    this.promptSelectionChange.emit(promptPath);
  }

  public handlePromptDraftChange(draft: string): void {
    this.promptDraftChange.emit(draft);
  }

  public handleSubmit(): void {
    this.submitReview.emit();
  }
}
