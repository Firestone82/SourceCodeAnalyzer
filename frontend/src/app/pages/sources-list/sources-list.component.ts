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
import {NzTypographyModule} from 'ng-zorro-antd/typography';
import {NzMessageService} from 'ng-zorro-antd/message';
import {NzModalModule} from 'ng-zorro-antd/modal';

import {SourcesApiService} from '../../service/api/types/sources-api.service';
import {AnalyzeSourceResponseDto, SourceCommentDto, SourceFilesResponseDto} from '../../service/api/api.models';
import {SourceCodeViewerComponent} from '../../components/source-code-viewer/source-code-viewer.component';
import {SourceReviewModalComponent} from '../../components/source-review-modal/source-review-modal.component';
import {JobCreatedModalComponent} from '../../components/job-created-modal/job-created-modal.component';
import {AuthService} from '../../service/auth/auth.service';
import {SourceTreeSelectorComponent} from '../../components/source-tree-selector/source-tree-selector.component';

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
    NzTypographyModule,
    NzModalModule,
    SourceCodeViewerComponent,
    SourceReviewModalComponent,
    JobCreatedModalComponent,
    SourceTreeSelectorComponent
  ],
  templateUrl: './sources-list.component.html',
  styleUrl: './sources-list.component.css',
})
export class SourcesListComponent implements OnInit, OnDestroy {
  public isLoading: boolean = false;
  public isSourceLoading: boolean = false;
  public errorMessage: string | null = null;
  public sourceErrorMessage: string | null = null;
  public selectedSourcePath: string | null = null;
  public selectedSourceKeys: string[] = [];
  public sourceTag: string = '';
  public isSourceTagSaving: boolean = false;
  public availableSourceTags: string[] = [];
  public files: Record<string, string> = {};
  public fileNames: string[] = [];
  public selectedFileName: string | null = null;
  public sourceComments: SourceCommentDto[] = [];

  public isReviewModalVisible: boolean = false;
  public isEditModalVisible: boolean = false;
  public editableSourcePath: string = "";
  public isSourceRenaming: boolean = false;
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


  public openEditModal(): void {
    if (!this.isAdmin || !this.selectedSourcePath) {
      return;
    }

    this.editableSourcePath = this.selectedSourcePath;
    this.isEditModalVisible = true;
  }

  public closeEditModal(): void {
    if (this.isSourceRenaming) {
      return;
    }

    this.isEditModalVisible = false;
  }

  public saveSourcePathChanges(): void {
    if (!this.isAdmin || !this.selectedSourcePath || this.isSourceRenaming) {
      return;
    }

    const renamedSourcePath = this.editableSourcePath.trim();
    if (!renamedSourcePath) {
      this.nzMessageService.error('Source path is required.');
      return;
    }

    this.isSourceRenaming = true;
    this.sourcesApiService
      .updateSourcePath(this.selectedSourcePath, renamedSourcePath)
      .pipe(finalize(() => {
        this.isSourceRenaming = false;
      }))
      .subscribe({
        next: (response) => {
          this.nzMessageService.success('Source updated.');
          this.isEditModalVisible = false;
          this.selectSource(response.source_path);
        },
        error: () => {
          this.nzMessageService.error('Failed to update source.');
        }
      });
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

  public handleSourceSelection(sourcePath: string): void {
    this.selectSource(sourcePath);
  }

  public handleSelectedSourceKeysChange(keys: string[]): void {
    this.selectedSourceKeys = keys;
  }

  public handleSourceTreeLoading(isLoading: boolean): void {
    this.isLoading = isLoading;
  }

  public handleSourceTreeError(errorMessage: string | null): void {
    this.errorMessage = errorMessage;
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

    const onSuccess = (): void => {
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
        .subscribe({next: () => onSuccess(), error: () => onError()});
      return;
    }

    this.sourcesApiService
      .deleteSourceTag(this.selectedSourcePath)
      .pipe(finalize(() => {
        this.isSourceTagSaving = false;
      }))
      .subscribe({next: () => onSuccess(), error: () => onError()});
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
}
