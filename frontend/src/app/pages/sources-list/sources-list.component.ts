import {Component, OnDestroy, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {catchError, finalize, of, Subject, takeUntil} from 'rxjs';

import {FormsModule} from '@angular/forms';
import {NzButtonModule} from 'ng-zorro-antd/button';
import {NzCardComponent} from 'ng-zorro-antd/card';
import {NzLayoutModule} from 'ng-zorro-antd/layout';
import {NzMenuModule} from 'ng-zorro-antd/menu';
import {NzPaginationModule} from 'ng-zorro-antd/pagination';
import {NzSelectModule} from 'ng-zorro-antd/select';
import {NzSpinModule} from 'ng-zorro-antd/spin';
import {NzTypographyModule} from 'ng-zorro-antd/typography';
import {NzMessageService} from 'ng-zorro-antd/message';

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
    FormsModule,
    NzButtonModule,
    NzCardComponent,
    NzLayoutModule,
    NzMenuModule,
    NzPaginationModule,
    NzSelectModule,
    NzSpinModule,
    NzTypographyModule,
    SourceCodeViewerComponent,
    SourceReviewModalComponent,
    JobCreatedModalComponent
  ],
  templateUrl: './sources-list.component.html',
})
export class SourcesListComponent implements OnInit, OnDestroy {
  public sourcePaths: string[] = [];
  public isLoading: boolean = false;
  public isSourceLoading: boolean = false;
  public errorMessage: string | null = null;
  public sourceErrorMessage: string | null = null;
  public selectedSourcePath: string | null = null;
  public files: Record<string, string> = {};
  public fileNames: string[] = [];
  public selectedFileName: string | null = null;
  public pageIndex: number = 1;
  public pageSize: number = 12;

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

  public get pagedSourcePaths(): string[] {
    const startIndex = (this.pageIndex - 1) * this.pageSize;
    return this.sourcePaths.slice(startIndex, startIndex + this.pageSize);
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
        const requestedSource: string | null = this.activatedRoute.snapshot.queryParamMap.get('source');
        const shouldSelectSource: string | null =
          (requestedSource && this.sourcePaths.includes(requestedSource)) ? requestedSource : null;
        if (shouldSelectSource) {
          this.updatePageForSource(shouldSelectSource);
          this.selectSource(shouldSelectSource);
        } else if (this.sourcePaths.length > 0) {
          this.pageIndex = 1;
          this.selectSource(this.sourcePaths[0]);
        }
      });
  }

  public onSourcePageChange(pageIndex: number): void {
    this.pageIndex = pageIndex;
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

  private updatePageForSource(sourcePath: string): void {
    const index = this.sourcePaths.indexOf(sourcePath);
    if (index === -1) {
      return;
    }
    this.pageIndex = Math.floor(index / this.pageSize) + 1;
  }

  public selectSource(sourcePath: string): void {
    if (this.selectedSourcePath === sourcePath) {
      return;
    }

    this.selectedSourcePath = sourcePath;
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
}
