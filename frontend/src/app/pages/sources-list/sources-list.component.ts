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
import {NzTreeNodeOptions} from 'ng-zorro-antd/core/tree';

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
  public isSourceLoading: boolean = false;
  public errorMessage: string | null = null;
  public sourceErrorMessage: string | null = null;
  public selectedSourcePath: string | null = null;
  public selectedSourceKeys: string[] = [];
  public sourceTreeNodes: NzTreeNodeOptions[] = [];
  public files: Record<string, string> = {};
  public fileNames: string[] = [];
  public selectedFileName: string | null = null;

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

  public onFileTabChange(index: number): void {
    const fileName = this.fileNames[index];
    if (fileName && fileName !== this.selectedFileName) {
      this.selectedFileName = fileName;
    }
  }

  private loadSources(): void {
    this.isLoading = true;
    this.errorMessage = null;

    this.sourcesApiService
      .getSourcePaths()
      .pipe(
        catchError(() => {
          this.errorMessage = 'Failed to load sources.';
          return of<SourcePathsResponseDto>({source_paths: []});
        }),
        finalize(() => {
          this.isLoading = false;
        })
      )
      .subscribe((response: SourcePathsResponseDto) => {
        this.sourcePaths = response.source_paths;
        this.sourceTreeNodes = this.buildSourceTreeNodes(this.sourcePaths);
      });
  }

  public openReviewModal(): void {
    if (!this.selectedSourcePath) {
      this.errorMessage = 'Select a source before starting a review.';
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
      node.isExpanded = !node.isExpanded;
      return;
    }

    const key = node.key?.toString();
    if (!key) {
      return;
    }

    this.selectedSourceKeys = [key];
    this.selectSource(key);
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

  private buildSourceTreeNodes(sourcePaths: string[]): NzTreeNodeOptions[] {
    type SourceTreeEntry = {children: Map<string, SourceTreeEntry>; path: string};
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
}
