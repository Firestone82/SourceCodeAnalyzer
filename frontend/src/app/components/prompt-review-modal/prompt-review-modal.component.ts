import {Component, EventEmitter, Input, OnChanges, Output, SimpleChanges} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {NzAutocompleteModule} from 'ng-zorro-antd/auto-complete';
import {NzInputModule} from 'ng-zorro-antd/input';
import {NzModalModule} from 'ng-zorro-antd/modal';
import {NzSpinModule} from 'ng-zorro-antd/spin';
import {NzTreeModule} from 'ng-zorro-antd/tree';
import {NzTypographyModule} from 'ng-zorro-antd/typography';
import {NzTreeNodeKey, NzTreeNodeOptions} from 'ng-zorro-antd/core/tree';
import {catchError, finalize, forkJoin, of} from 'rxjs';

import {KNOWN_MODELS} from '../../shared/model-options';
import {SourcesApiService} from '../../service/api/types/sources-api.service';
import {AnalyzeSourceResponseDto, SourcePathsResponseDto} from '../../service/api/api.models';
import {SubmitFooterComponent} from '../submit-footer/submit-footer.component';

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
    NzTypographyModule,
    SubmitFooterComponent
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
  public sourceTreeNodes: NzTreeNodeOptions[] = [];
  public selectedSourceKeys: NzTreeNodeKey[] = [];
  public selectedSourceLeafKeys: string[] = [];
  public isSourceOptionsLoading: boolean = false;
  public isSubmittingReview: boolean = false;
  public reviewSubmitError: string | null = null;
  private sourceTreeLeafMap: Map<string, string[]> = new Map();

  public constructor(
    private readonly sourcesApiService: SourcesApiService
  ) {
  }

  public get filteredModelOptions(): string[] {
    const query = this.reviewModel.trim().toLowerCase();
    if (!query) {
      return KNOWN_MODELS;
    }
    return KNOWN_MODELS.filter((model) => model.toLowerCase().includes(query));
  }

  public get canSubmitBulkReview(): boolean {
    return Boolean(
      this.selectedPromptPath
      && this.reviewModel.trim()
      && this.selectedSourceLeafKeys.length > 0
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

  public handleSourceKeysChange(keys: NzTreeNodeKey[]): void {
    this.selectedSourceKeys = keys;
    this.selectedSourceLeafKeys = this.expandSourceKeys(keys);
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
          prompt_path: this.selectedPromptPath!
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
          return;
        }

        this.reviewsQueued.emit(successResponses);
        if (successCount < selectedSources.length) {
          this.reviewSubmitError = 'Some reviews failed to queue.';
        }
        this.closeModal();
      });
  }

  private initializeModal(): void {
    this.reviewSubmitError = null;
    this.reviewModel = this.defaultModel ?? '';
    this.selectedSourceKeys = [];
    this.selectedSourceLeafKeys = [];
    this.loadSourcePaths();
  }

  private resetForm(): void {
    this.reviewModel = '';
    this.sourceTreeNodes = [];
    this.selectedSourceKeys = [];
    this.selectedSourceLeafKeys = [];
    this.isSourceOptionsLoading = false;
    this.isSubmittingReview = false;
    this.reviewSubmitError = null;
    this.sourceTreeLeafMap = new Map();
  }

  private loadSourcePaths(): void {
    this.isSourceOptionsLoading = true;

    this.sourcesApiService
      .getSourcePaths()
      .pipe(
        catchError(() => {
          this.reviewSubmitError = 'Failed to load sources.';
          return of<SourcePathsResponseDto>({source_paths: []});
        }),
        finalize(() => {
          this.isSourceOptionsLoading = false;
        })
      )
      .subscribe((response: SourcePathsResponseDto) => {
        this.sourceTreeNodes = this.buildSourceTreeNodes(response.source_paths);
        this.sourceTreeLeafMap = this.buildSourceTreeLeafMap(response.source_paths);
      });
  }

  private buildSourceTreeNodes(sourcePaths: string[]): NzTreeNodeOptions[] {
    type SourceTreeEntry = { children: Map<string, SourceTreeEntry>; path: string };
    const root: SourceTreeEntry = {children: new Map(), path: ''};

    for (const sourcePath of sourcePaths) {
      const parts = sourcePath.split('/').filter(Boolean);
      let current = root;
      let currentPath = '';

      for (const part of parts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        if (!current.children.has(part)) {
          current.children.set(part, {children: new Map(), path: currentPath});
        }
        current = current.children.get(part)!;
      }
    }

    const buildNodes = (node: SourceTreeEntry): NzTreeNodeOptions[] => {
      return Array.from(node.children.entries())
        .sort(([leftName, leftChild], [rightName, rightChild]) => {
          const leftIsLeaf = leftChild.children.size === 0;
          const rightIsLeaf = rightChild.children.size === 0;
          if (leftIsLeaf !== rightIsLeaf) {
            return leftIsLeaf ? 1 : -1;
          }
          return leftName.localeCompare(rightName);
        })
        .map(([name, child]) => {
          const children = buildNodes(child);
          const isLeaf = children.length === 0;
          return {
            title: name,
            key: child.path,
            children,
            isLeaf
          };
        });
    };

    return buildNodes(root);
  }

  private buildSourceTreeLeafMap(sourcePaths: string[]): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const sourcePath of sourcePaths) {
      const parts = sourcePath.split('/').filter(Boolean);
      let currentPath = '';
      for (const part of parts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const existing = map.get(currentPath) ?? [];
        existing.push(sourcePath);
        map.set(currentPath, existing);
      }
    }
    return map;
  }

  private expandSourceKeys(keys: NzTreeNodeKey[]): string[] {
    const expandedKeys = new Set<string>();
    for (const key of keys) {
      if (typeof key !== 'string') {
        continue;
      }
      const leafKeys = this.sourceTreeLeafMap.get(key);
      if (!leafKeys) {
        continue;
      }
      for (const leafKey of leafKeys) {
        expandedKeys.add(leafKey);
      }
    }
    return Array.from(expandedKeys);
  }
}
