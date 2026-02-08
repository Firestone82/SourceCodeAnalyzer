import {Component, OnDestroy, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {catchError, finalize, of, Subject, takeUntil} from 'rxjs';

import {NzButtonModule} from 'ng-zorro-antd/button';
import {NzCardComponent} from 'ng-zorro-antd/card';
import {NzLayoutModule} from 'ng-zorro-antd/layout';
import {NzSpinModule} from 'ng-zorro-antd/spin';
import {NzTabsModule} from 'ng-zorro-antd/tabs';
import {NzFormatEmitEvent, NzTreeModule} from 'ng-zorro-antd/tree';
import {NzTypographyModule} from 'ng-zorro-antd/typography';
import {NzMessageService} from 'ng-zorro-antd/message';
import {NzTreeNode, NzTreeNodeOptions} from 'ng-zorro-antd/core/tree';

import {SourcesApiService} from '../../service/api/types/sources-api.service';
import {AnalyzeSourceResponseDto, SourceFilesResponseDto, SourcePathsResponseDto} from '../../service/api/api.models';
import {SourceCodeViewerComponent} from '../../components/source-code-viewer/source-code-viewer.component';
import {SourceReviewModalComponent} from '../../components/source-review-modal/source-review-modal.component';
import {JobCreatedModalComponent} from '../../components/job-created-modal/job-created-modal.component';
import {AuthService} from '../../service/auth/auth.service';

@Component({
  selector: 'app-sources-list',
  standalone: true,
  imports: [
    NzButtonModule,
    NzCardComponent,
    NzLayoutModule,
    NzSpinModule,
    NzTabsModule,
    NzTreeModule,
    NzTypographyModule,
    SourceCodeViewerComponent,
    SourceReviewModalComponent,
    JobCreatedModalComponent
  ],
  templateUrl: './sources-list.component.html',
  styleUrl: './sources-list.component.css',
})
export class SourcesListComponent implements OnInit, OnDestroy {
  public sourcePaths: string[] = [];
  public isLoading: boolean = false;
  public isLoadingMore: boolean = false;
  public isSourceLoading: boolean = false;
  public errorMessage: string | null = null;
  public sourceErrorMessage: string | null = null;
  public selectedSourcePath: string | null = null;
  public selectedSourceKeys: string[] = [];
  public sourceTreeNodes: NzTreeNodeOptions[] = [];
  public files: Record<string, string> = {};
  public fileNames: string[] = [];
  public selectedFileName: string | null = null;
  public totalSources: number | null = null;
  public nextOffset: number | null = null;
  private readonly pageSize: number = 200;
  private sourceTreeIndex: Map<string, Map<string, SourceTreeEntry>> = new Map();
  private readonly expandedKeys = new Set<string>();

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

  public ngOnInit(): void {
    this.loadSources();
    this.authService.rater$
      .pipe(takeUntil(this.destroy$))
      .subscribe((rater) => {
        this.isAdmin = Boolean(rater?.admin);
      });
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

    if (!node.isLeaf) {
      const shouldExpand = !node.isExpanded;
      node.isExpanded = shouldExpand;
      this.updateExpandedKeys(node.key?.toString() ?? '', shouldExpand);
      if (shouldExpand) {
        this.loadChildrenForNode(node);
      }
      return;
    }

    const key = node.key?.toString();
    if (!key) {
      return;
    }

    this.selectedSourceKeys = [key];
    this.selectSource(key);
  }

  public handleSourceNodeExpand(event: NzFormatEmitEvent): void {
    const node = event.node;
    if (!node) {
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
          return of<SourceFilesResponseDto>({source_path: sourcePath, files: {}});
        }),
        finalize(() => {
          this.isSourceLoading = false;
        })
      )
      .subscribe((response: SourceFilesResponseDto) => {
        this.files = response.files;
        this.fileNames = Object.keys(response.files).sort((left, right) => left.localeCompare(right));
        this.selectedFileName = this.fileNames.length > 0 ? this.fileNames[0] : null;
      });
  }

  public handleSourceTreeScroll(event: Event): void {
    if (this.isLoadingMore || this.isLoading || this.nextOffset === null) {
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

  private loadSources(): void {
    this.isLoading = true;
    this.errorMessage = null;
    this.sourcePaths = [];
    this.sourceTreeNodes = [];
    this.nextOffset = 0;

    this.sourcesApiService
      .getSourcePaths({offset: 0, limit: this.pageSize})
      .pipe(
        catchError(() => {
          this.errorMessage = 'Failed to load sources.';
          return of<SourcePathsResponseDto>({source_paths: [], total: 0, next_offset: null});
        }),
        finalize(() => {
          this.isLoading = false;
        })
      )
      .subscribe((response: SourcePathsResponseDto | null) => {
        if (!response) {
          return;
        }
        this.sourcePaths = response.source_paths;
        this.totalSources = response.total ?? this.sourcePaths.length;
        this.nextOffset = response.next_offset ?? null;
        this.sourceTreeIndex = this.buildSourceTreeIndex(this.sourcePaths);
        this.sourceTreeNodes = this.buildSourceTreeNodes();
      });
  }

  private loadMoreSources(): void {
    if (this.nextOffset === null) {
      return;
    }

    this.isLoadingMore = true;
    const offset = this.nextOffset;

    this.sourcesApiService
      .getSourcePaths({offset, limit: this.pageSize})
      .pipe(
        catchError(() => {
          this.errorMessage = 'Failed to load more sources.';
          return of<SourcePathsResponseDto>({source_paths: [], total: this.totalSources ?? 0, next_offset: null});
        }),
        finalize(() => {
          this.isLoadingMore = false;
        })
      )
      .subscribe((response: SourcePathsResponseDto | null) => {
        if (!response) {
          return;
        }
        const newPaths = response.source_paths ?? [];
        this.sourcePaths = [...this.sourcePaths, ...newPaths];
        this.totalSources = response.total ?? this.totalSources;
        this.nextOffset = response.next_offset ?? null;
        this.sourceTreeIndex = this.buildSourceTreeIndex(this.sourcePaths);
        this.sourceTreeNodes = this.buildSourceTreeNodes();
      });
  }

  private buildSourceTreeNodes(): NzTreeNodeOptions[] {
    return this.buildTreeNodesForParent('');
  }

  private buildTreeNodesForParent(parentPath: string): NzTreeNodeOptions[] {
    const entries = Array.from(this.sourceTreeIndex.get(parentPath)?.values() ?? []);
    return entries
      .sort((left, right) => {
        if (left.isLeaf !== right.isLeaf) {
          return left.isLeaf ? 1 : -1;
        }
        return left.name.localeCompare(right.name);
      })
      .map((entry) => {
        const isExpanded = this.expandedKeys.has(entry.path);
        const children = !entry.isLeaf && isExpanded
          ? this.buildTreeNodesForParent(entry.path)
          : undefined;
        return {
          title: entry.name,
          key: entry.path,
          children,
          isLeaf: entry.isLeaf,
          expanded: isExpanded
        };
      });
  }

  private buildSourceTreeIndex(sourcePaths: string[]): Map<string, Map<string, SourceTreeEntry>> {
    const index = new Map<string, Map<string, SourceTreeEntry>>();
    index.set('', new Map());

    for (const sourcePath of sourcePaths) {
      const parts = sourcePath.split('/').filter(Boolean);
      let parentPath = '';

      parts.forEach((part, indexPart) => {
        const currentPath = parentPath ? `${parentPath}/${part}` : part;
        const isLeaf = indexPart === parts.length - 1;
        const parentMap = index.get(parentPath) ?? new Map<string, SourceTreeEntry>();
        if (!index.has(parentPath)) {
          index.set(parentPath, parentMap);
        }

        const existing = parentMap.get(part);
        if (!existing) {
          parentMap.set(part, {name: part, path: currentPath, isLeaf});
        } else if (existing.isLeaf && !isLeaf) {
          existing.isLeaf = false;
        }

        if (!isLeaf && !index.has(currentPath)) {
          index.set(currentPath, new Map());
        }
        parentPath = currentPath;
      });
    }

    return index;
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
    if (node.children && node.children.length > 0) {
      return;
    }
    const key = node.key?.toString() ?? '';
    if (!key) {
      return;
    }
    const children = this.buildTreeNodesForParent(key);
    node.addChildren(children);
  }
}

type SourceTreeEntry = { name: string; path: string; isLeaf: boolean };
