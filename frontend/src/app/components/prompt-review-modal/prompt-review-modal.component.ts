import {Component, EventEmitter, Input, OnChanges, Output, SimpleChanges} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {NzAutocompleteModule} from 'ng-zorro-antd/auto-complete';
import {NzInputModule} from 'ng-zorro-antd/input';
import {NzModalModule} from 'ng-zorro-antd/modal';
import {NzSpinModule} from 'ng-zorro-antd/spin';
import {NzTreeModule} from 'ng-zorro-antd/tree';
import {NzTypographyModule} from 'ng-zorro-antd/typography';
import {NzTreeNodeKey, NzTreeNodeOptions} from 'ng-zorro-antd/core/tree';
import {NzMessageService} from 'ng-zorro-antd/message';
import {catchError, finalize, forkJoin, of} from 'rxjs';
import {SourcesApiService} from '../../service/api/types/sources-api.service';
import {AnalyzeSourceResponseDto, SourcePathsResponseDto} from '../../service/api/api.models';
import {SubmitFooterComponent} from '../submit-footer/submit-footer.component';
import {environment} from '../../../environments/environment';

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
  public isLoadingMoreSources: boolean = false;
  public isSubmittingReview: boolean = false;
  public reviewSubmitError: string | null = null;
  private sourceTreeLeafMap: Map<string, string[]> = new Map();
  private sourcePaths: string[] = [];
  private nextOffset: number | null = null;
  private readonly pageSize: number = 200;

  public constructor(
    private readonly sourcesApiService: SourcesApiService,
    private readonly nzMessageService: NzMessageService
  ) {
  }

  public get filteredModelOptions(): string[] {
    const query = this.reviewModel.trim().toLowerCase();
    if (!query) {
      return environment.models ?? [];
    }

    return (environment.models ?? []).filter((model: string) => model.toLowerCase().includes(query));
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

  public handleSourceScroll(event: Event): void {
    if (this.isSourceOptionsLoading || this.isLoadingMoreSources || this.nextOffset === null) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }

    const threshold = 120;
    const position = target.scrollTop + target.clientHeight;
    if (position >= target.scrollHeight - threshold) {
      this.loadMoreSources();
    }
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
    this.isLoadingMoreSources = false;
    this.isSubmittingReview = false;
    this.reviewSubmitError = null;
    this.sourceTreeLeafMap = new Map();
    this.sourcePaths = [];
    this.nextOffset = null;
  }

  private loadSourcePaths(): void {
    this.isSourceOptionsLoading = true;
    this.sourcePaths = [];
    this.sourceTreeNodes = [];
    this.nextOffset = 0;

    this.sourcesApiService
      .getSourcePaths({offset: 0, limit: this.pageSize})
      .pipe(
        catchError(() => {
          this.reviewSubmitError = 'Failed to load sources.';
          return of<SourcePathsResponseDto>({source_paths: [], total: 0, next_offset: null});
        }),
        finalize(() => {
          this.isSourceOptionsLoading = false;
        })
      )
      .subscribe((response: SourcePathsResponseDto | null) => {
        if (!response) {
          return;
        }
        this.sourcePaths = response.source_paths;
        this.nextOffset = response.next_offset ?? null;
        this.sourceTreeNodes = this.buildSourceTreeNodes(this.sourcePaths);
        this.sourceTreeLeafMap = this.buildSourceTreeLeafMap(this.sourcePaths);
      });
  }

  private loadMoreSources(): void {
    if (this.nextOffset === null) {
      return;
    }

    this.isLoadingMoreSources = true;
    const offset = this.nextOffset;

    this.sourcesApiService
      .getSourcePaths({offset, limit: this.pageSize})
      .pipe(
        catchError(() => {
          this.reviewSubmitError = 'Failed to load more sources.';
          return of<SourcePathsResponseDto>({source_paths: [], total: this.sourcePaths.length, next_offset: null});
        }),
        finalize(() => {
          this.isLoadingMoreSources = false;
        })
      )
      .subscribe((response: SourcePathsResponseDto | null) => {
        if (!response) {
          return;
        }
        const newPaths = response.source_paths ?? [];
        this.sourcePaths = [...this.sourcePaths, ...newPaths];
        this.nextOffset = response.next_offset ?? null;
        this.sourceTreeNodes = this.buildSourceTreeNodes(this.sourcePaths);
        this.sourceTreeLeafMap = this.buildSourceTreeLeafMap(this.sourcePaths);
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

          const leftNumber = Number(leftName);
          const rightNumber = Number(rightName);
          const isLeftWholeNumber = Number.isInteger(leftNumber) && leftName.trim() !== '';
          const isRightWholeNumber = Number.isInteger(rightNumber) && rightName.trim() !== '';

          if (isLeftWholeNumber && isRightWholeNumber) {
            return leftNumber - rightNumber;
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
            isLeaf,
            expanded: name === 'upload'
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
