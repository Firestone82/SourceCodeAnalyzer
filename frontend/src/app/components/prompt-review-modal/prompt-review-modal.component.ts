import {Component, EventEmitter, Input, Output} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {NzAutocompleteModule} from 'ng-zorro-antd/auto-complete';
import {NzInputModule} from 'ng-zorro-antd/input';
import {NzModalModule} from 'ng-zorro-antd/modal';
import {NzSpinModule} from 'ng-zorro-antd/spin';
import {NzTreeModule} from 'ng-zorro-antd/tree';
import {NzTypographyModule} from 'ng-zorro-antd/typography';
import {NzTreeNodeKey, NzTreeNodeOptions} from 'ng-zorro-antd/core/tree';

import {KNOWN_MODELS} from '../../shared/model-options';

@Component({
  selector: 'app-prompt-review-modal',
  standalone: true,
  imports: [
    FormsModule,
    NzAutocompleteModule,
    NzInputModule,
    NzModalModule,
    NzSpinModule,
    NzTreeModule,
    NzTypographyModule
  ],
  templateUrl: './prompt-review-modal.component.html'
})
export class PromptReviewModalComponent {
  @Input() public isVisible: boolean = false;
  @Output() public readonly isVisibleChange = new EventEmitter<boolean>();
  @Input() public selectedPromptPath: string | null = null;
  @Input() public reviewModel: string = '';
  @Output() public readonly reviewModelChange = new EventEmitter<string>();
  @Input() public sourceTreeNodes: NzTreeNodeOptions[] = [];
  @Input() public selectedSourceKeys: NzTreeNodeKey[] = [];
  @Output() public readonly selectedSourceKeysChange = new EventEmitter<NzTreeNodeKey[]>();
  @Input() public isSourceOptionsLoading: boolean = false;
  @Input() public isSubmittingReview: boolean = false;
  @Input() public reviewSubmitError: string | null = null;
  @Input() public canSubmitBulkReview: boolean = false;
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

  public handleSourceKeysChange(keys: NzTreeNodeKey[]): void {
    this.selectedSourceKeysChange.emit(keys);
  }

  public handleSubmit(): void {
    this.submitReview.emit();
  }
}
