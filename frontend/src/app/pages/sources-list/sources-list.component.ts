import {Component, OnDestroy, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {catchError, finalize, of, Subject, takeUntil} from 'rxjs';

import {NzButtonModule} from 'ng-zorro-antd/button';
import {FormsModule} from '@angular/forms';
import {NzCardComponent} from 'ng-zorro-antd/card';
import {NzLayoutModule} from 'ng-zorro-antd/layout';
import {NzSpinModule} from 'ng-zorro-antd/spin';
import {NzTabsModule} from 'ng-zorro-antd/tabs';
import {NzInputModule} from 'ng-zorro-antd/input';
import {NzAutocompleteModule} from 'ng-zorro-antd/auto-complete';
import {NzFormatEmitEvent, NzTreeModule} from 'ng-zorro-antd/tree';
import {NzTypographyModule} from 'ng-zorro-antd/typography';
import {NzMessageService} from 'ng-zorro-antd/message';
import {NzTreeNode, NzTreeNodeOptions} from 'ng-zorro-antd/core/tree';
import {NzTagModule} from 'ng-zorro-antd/tag';

import {SourcesApiService} from '../../service/api/types/sources-api.service';
import {
  AnalyzeSourceResponseDto,
  SourceCommentDto,
  SourceFilesResponseDto,
  SourceFolderChildEntryDto,
  SourceFolderChildrenResponseDto
} from '../../service/api/api.models';
import {SourceCodeViewerComponent} from '../../components/source-code-viewer/source-code-viewer.component';
import {SourceReviewModalComponent} from '../../components/source-review-modal/source-review-modal.component';
import {JobCreatedModalComponent} from '../../components/job-created-modal/job-created-modal.component';
import {AuthService} from '../../service/auth/auth.service';

@Component({
  selector: 'app-sources-list',
  standalone: true,
  imports: [
    NzButtonModule,
    FormsModule,
    NzCardComponent,
    NzLayoutModule,
    NzSpinModule,
    NzTabsModule,
    NzInputModule,
    NzAutocompleteModule,
    NzTreeModule,
    NzTypographyModule,
    NzTagModule,
    SourceCodeViewerComponent,
    SourceReviewModalComponent,
    JobCreatedModalComponent
  ],
  templateUrl: './sources-list.component.html',
  styleUrl: './sources-list.component.css',
})
export class SourcesListComponent implements OnInit, OnDestroy {
  private readonly sourceTagColors: string[] = ['blue', 'green', 'red', 'orange', 'purple', 'cyan', 'magenta', 'lime'];
  public isLoading: boolean = false;
  public isSourceLoading: boolean = false;
  public errorMessage: string | null = null;
  public sourceErrorMessage: string | null = null;
  public selectedSourcePath: string | null = null;
  public sourceTag: string = "";
  public isSourceTagSaving: boolean = false;
  public availableSourceTags: string[] = [];
  public selectedSourceKeys: string[] = [];
  public sourceTreeNodes: NzTreeNodeOptions[] = [];
  public files: Record<string, string> = {};
  public fileNames: string[] = [];
  public selectedFileName: string | null = null;
  public sourceComments: SourceCommentDto[] = [];
  private readonly expandedKeys = new Set<string>();
  private readonly folderPagination = new Map<string, FolderPaginationState>();
  private readonly loadingFolders = new Set<string>();
  private readonly loadedFolders = new Set<string>();
  private readonly pageSize: number = 50;

  public isReviewModalVisible: boolean = false;
  public isJobModalVisible: boolean = false;
  public jobModalIds: string[] = [];
  public isAdmin: boolean = false;
  private readonly destroy$ = new Subject<void>();

  public constructor(
    private readonly sourcesApiService: SourcesApiService,
    private readonly activatedRoute: ActivatedRoute,
    private readonly router: Router,
    private readonly authService: AuthService,
    private readonly nzMessageService: NzMessageService,
  ) {
  }


  public get filteredSourceTags(): string[] {
    const normalizedInput = this.sourceTag.trim().toLowerCase();
    if (!normalizedInput) {
      return this.availableSourceTags;
    }
    return this.availableSourceTags.filter((tag) => tag.toLowerCase().includes(normalizedInput));
  }

  public get selectedFileContent(): string {
    if (!this.selectedFileName) {
      return '';
    }
    return this.files[this.selectedFileName] ?? '';
  }

  public get selectedFileIndex(): number {
    if (!this.selectedFileName) {
      return 0;
    }
    const index = this.fileNames.indexOf(this.selectedFileName);
    return index >= 0 ? index : 0;
  }

  public get globalSourceComments(): SourceCommentDto[] {
    return this.sourceComments.filter((comment) => comment.source == null || comment.line == null);
  }

  public ngOnInit(): void {
    this.loadSources();
    this.loadExistingSourceTags();
    this.activatedRoute.queryParamMap
      .pipe(takeUntil(this.destroy$))
      .subscribe((queryParams) => {
        const sourcePath = queryParams.get('source');
        if (sourcePath) {
          this.selectSource(sourcePath);
        }
      });
    this.authService.rater$
      .pipe(takeUntil(this.destroy$))
      .subscribe((rater) => {
        this.isAdmin = Boolean(rater?.admin);
      });
  }

  public sourceTagColor(tag: string | null | undefined): string {
    if (!tag) {
      return 'default';
    }
    const hash = Array.from(tag).reduce((accumulator, character) => accumulator + character.charCodeAt(0), 0);
    return this.sourceTagColors[hash % this.sourceTagColors.length];
  }

  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  public onFileTabChange(index: number): void {
    const fileName = this.fileNames[index];
    if (fileName && fileName !== this.selectedFileName) {
      this.selectedFileName = fileName;
    }
  }

  public openReviewModal(): void {
    if (!this.selectedSourcePath) {
      this.nzMessageService.error('Select a source before starting a review.');
      return;
    }
    if (!this.isAdmin) {
      this.nzMessageService.error('Only admins can start reviews.');
      return;
    }
    this.isReviewModalVisible = true;
  }

  public handleReviewQueued(response: AnalyzeSourceResponseDto): void {
    this.jobModalIds = [response.job_id];
    this.isJobModalVisible = true;
  }

  public handleSourceNodeClick(event: NzFormatEmitEvent): void {
    const node = event.node;
    if (!node) {
      return;
    }

    const origin = node.origin as SourceTreeNodeOrigin;
    if (origin?.isLoadMore) {
      const parentPath = origin.parentPath ?? '';
      const nextOffset = this.folderPagination.get(parentPath)?.nextOffset ?? null;
      if (nextOffset !== null) {
        this.loadFolderChildren(parentPath, node.parentNode, nextOffset, true);
      }
      return;
    }

    const key = node.key?.toString();
    if (!key) {
      return;
    }

    if (origin?.hasChildren && !origin.hasSource) {
      const shouldExpand = !node.isExpanded;
      node.isExpanded = shouldExpand;
      this.updateExpandedKeys(key, shouldExpand);
      if (shouldExpand) {
        this.loadChildrenForNode(node);
      }
    }

    if (origin?.hasSource) {
      this.selectedSourceKeys = [key];
      this.selectSource(key);
    }
  }

  public handleSourceNodeExpand(event: NzFormatEmitEvent): void {
    const node = event.node;
    if (!node) {
      return;
    }
    const origin = node.origin as SourceTreeNodeOrigin;
    if (origin?.hasSource) {
      node.isExpanded = false;
      return;
    }
    const isExpanded = node.isExpanded;
    this.updateExpandedKeys(node.key?.toString() ?? '', isExpanded);
    if (isExpanded) {
      this.loadChildrenForNode(node);
    }
  }

  public selectSource(sourcePath: string): void {
    if (this.selectedSourcePath === sourcePath) {
      return;
    }

    this.selectedSourcePath = sourcePath;
    this.selectedSourceKeys = [sourcePath];
    this.files = {};
    this.fileNames = [];
    this.selectedFileName = null;
    this.sourceErrorMessage = null;
    this.sourceComments = [];
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
          return of<SourceFilesResponseDto>({source_path: sourcePath, files: {}, comments: []});
        }),
        finalize(() => {
          this.isSourceLoading = false;
        })
      )
      .subscribe((response: SourceFilesResponseDto) => {
        this.files = response.files;
        this.fileNames = Object.keys(response.files).sort((left, right) => left.localeCompare(right));
        this.selectedFileName = this.fileNames.length > 0 ? this.fileNames[0] : null;
        this.sourceComments = response.comments ?? [];

        if (this.isAdmin) {
          this.sourcesApiService.getSourceTag(sourcePath).subscribe({
            next: (tagResponse) => {
              this.sourceTag = tagResponse.tag || '';
            },
            error: () => {
              this.sourceTag = '';
            }
          });
        }
      });
  }


  public saveSourceTag(): void {
    if (!this.isAdmin || !this.selectedSourcePath || this.isSourceTagSaving) {
      return;
    }

    this.isSourceTagSaving = true;
    const trimmedTag = this.sourceTag.trim();
    const onSuccess = (savedTag: string | null): void => {
      this.updateSourceTagInTree(this.selectedSourcePath!, savedTag);
      this.loadExistingSourceTags();
      this.nzMessageService.success('Source tag updated.');
    };

    const onError = (): void => {
      this.nzMessageService.error('Failed to update source tag.');
    };

    if (trimmedTag) {
      this.sourcesApiService
        .setSourceTag(this.selectedSourcePath, trimmedTag)
        .pipe(finalize(() => {
          this.isSourceTagSaving = false;
        }))
        .subscribe({next: () => onSuccess(trimmedTag), error: () => onError()});
      return;
    }

    this.sourcesApiService
      .deleteSourceTag(this.selectedSourcePath)
      .pipe(finalize(() => {
        this.isSourceTagSaving = false;
      }))
      .subscribe({next: () => onSuccess(null), error: () => onError()});
  }


  private loadExistingSourceTags(): void {
    this.sourcesApiService.getSourceTags().subscribe({
      next: (response) => {
        this.availableSourceTags = response.tags ?? [];
      },
      error: () => {
        this.availableSourceTags = [];
      }
    });
  }

  private updateSourceTagInTree(sourcePath: string, sourceTag: string | null): void {
    const updateNode = (nodes: NzTreeNodeOptions[]): boolean => {
      for (const node of nodes) {
        if (node.key === sourcePath) {
          (node as SourceTreeNodeOrigin).sourceTag = sourceTag;
          return true;
        }
        const children = node.children as NzTreeNodeOptions[] | undefined;
        if (children && updateNode(children)) {
          return true;
        }
      }
      return false;
    };

    updateNode(this.sourceTreeNodes);
    this.sourceTreeNodes = [...this.sourceTreeNodes];
  }

  private loadSources(): void {
    this.errorMessage = null;
    this.sourceTreeNodes = [];
    this.isLoading = true;

    this.sourcesApiService
      .getSourceFolderChildren(null, {offset: 0, limit: this.pageSize})
      .pipe(
        catchError(() => {
          this.errorMessage = 'Failed to load sources.';
          return of<SourceFolderChildrenResponseDto>({children: [], total: 0, next_offset: null});
        }),
        finalize(() => {
          this.isLoading = false;
        })
      )
      .subscribe((response: SourceFolderChildrenResponseDto | null) => {
        if (!response) {
          return;
        }
        this.applyRootChildren(response, false);
        const sourcePath = this.activatedRoute.snapshot.queryParamMap.get('source');
        if (sourcePath) {
          this.selectSource(sourcePath);
        }
      });
  }

  private updateExpandedKeys(key: string, isExpanded: boolean): void {
    if (!key) {
      return;
    }
    if (isExpanded) {
      this.expandedKeys.add(key);
    } else {
      this.expandedKeys.delete(key);
    }
  }

  private loadChildrenForNode(node: NzTreeNode): void {
    if (node.isLeaf) {
      return;
    }
    const origin = node.origin as SourceTreeNodeOrigin;
    if (origin?.hasSource) {
      return;
    }
    const key = node.key?.toString() ?? '';
    if (!key) {
      return;
    }
    if (this.loadingFolders.has(key) || this.loadedFolders.has(key)) {
      return;
    }
    this.loadFolderChildren(key, node, 0, false);
  }

  private loadFolderChildren(
    folderPath: string,
    node: NzTreeNode | null,
    offset: number,
    append: boolean
  ): void {
    if (this.loadingFolders.has(folderPath)) {
      return;
    }
    this.loadingFolders.add(folderPath);

    this.sourcesApiService
      .getSourceFolderChildren(folderPath || null, {offset, limit: this.pageSize})
      .pipe(
        catchError(() => {
          if (!append) {
            this.errorMessage = 'Failed to load sources.';
          }
          return of<SourceFolderChildrenResponseDto>({children: [], total: 0, next_offset: null});
        }),
        finalize(() => {
          this.loadingFolders.delete(folderPath);
        })
      )
      .subscribe((response: SourceFolderChildrenResponseDto | null) => {
        if (!response) {
          return;
        }
        if (node) {
          this.applyNodeChildren(node, folderPath, response, append);
        } else {
          this.applyRootChildren(response, append);
        }
      });
  }

  private applyRootChildren(response: SourceFolderChildrenResponseDto, append: boolean): void {
    const nodes = this.buildTreeNodes(response.children ?? []);
    if (append) {
      this.sourceTreeNodes = this.stripLoadMore(this.sourceTreeNodes);
      this.sourceTreeNodes = [...this.sourceTreeNodes, ...nodes];
    } else {
      this.sourceTreeNodes = nodes;
      this.loadedFolders.add('');
    }
    this.updatePagination('', response);
  }

  private applyNodeChildren(
    node: NzTreeNode,
    folderPath: string,
    response: SourceFolderChildrenResponseDto,
    append: boolean
  ): void {
    const nodes = this.buildTreeNodes(response.children ?? []);
    const existing = node.children ?? [];
    const cleaned = this.stripLoadMore(existing);
    node.clearChildren();
    if (append) {
      node.addChildren([...cleaned, ...nodes]);
    } else {
      node.addChildren(nodes);
      this.loadedFolders.add(folderPath);
    }
    this.updatePagination(folderPath, response, node);
  }

  private buildTreeNodes(entries: SourceFolderChildEntryDto[]): NzTreeNodeOptions[] {
    return entries.map((entry) => ({
      title: entry.name,
      key: entry.path,
      isLeaf: entry.has_source || !entry.has_children,
      hasSource: entry.has_source,
      hasChildren: entry.has_children && !entry.has_source,
      sourceTag: entry.source_tag ?? null
    }));
  }

  private updatePagination(
    folderPath: string,
    response: SourceFolderChildrenResponseDto,
    node?: NzTreeNode
  ): void {
    const nextOffset = response.next_offset ?? null;
    this.folderPagination.set(folderPath, {nextOffset, total: response.total ?? null});
    if (nextOffset !== null) {
      const loadMoreNode: NzTreeNodeOptions = {
        title: 'Load more…',
        key: this.buildLoadMoreKey(folderPath, nextOffset),
        isLeaf: true,
        selectable: false,
        isLoadMore: true,
        parentPath: folderPath
      };
      if (node) {
        node.addChildren([loadMoreNode]);
      } else {
        this.sourceTreeNodes = [...this.sourceTreeNodes, loadMoreNode];
      }
    }
  }

  private stripLoadMore(nodes: NzTreeNodeOptions[] | NzTreeNode[]): NzTreeNodeOptions[] {
    return nodes
      .filter((child) => {
        if (child instanceof NzTreeNode) {
          return !(child.origin as SourceTreeNodeOrigin)?.isLoadMore;
        }
        return !(child as SourceTreeNodeOrigin)?.isLoadMore;
      })
      .map((child) => child instanceof NzTreeNode ? (child.origin as NzTreeNodeOptions) : child as NzTreeNodeOptions);
  }

  private buildLoadMoreKey(folderPath: string, offset: number): string {
    return `__load_more__:${folderPath}:${offset}`;
  }
}

type SourceTreeNodeOrigin = {
  hasSource?: boolean;
  hasChildren?: boolean;
  isLoadMore?: boolean;
  parentPath?: string;
  sourceTag?: string | null;
};

type FolderPaginationState = {
  nextOffset: number | null;
  total: number | null;
};
