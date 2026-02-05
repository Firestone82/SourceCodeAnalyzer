import {Component, OnInit} from '@angular/core';
import {RouterLink} from '@angular/router';
import {DatePipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {NzTableModule} from 'ng-zorro-antd/table';
import {NzButtonModule} from 'ng-zorro-antd/button';
import {NzTagModule} from 'ng-zorro-antd/tag';
import {NzInputModule} from 'ng-zorro-antd/input';
import {NzCheckboxModule} from 'ng-zorro-antd/checkbox';
import {SubmitsApiService} from '../../service/api/types/submits-api.service';
import {SubmitListItemDto, SubmitListResponseDto} from '../../service/api/api.models';
import {catchError, finalize, of} from 'rxjs';
import {NzCardComponent} from 'ng-zorro-antd/card';
import {SubmitUploadModalComponent} from '../../components/submit-upload-modal/submit-upload-modal.component';
import {PromptsApiService} from '../../service/api/types/prompts-api.service';
import {NzTypographyModule} from 'ng-zorro-antd/typography';

@Component({
  selector: 'app-submits-list',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    NzTableModule,
    NzButtonModule,
    NzTagModule,
    NzInputModule,
    NzCheckboxModule,
    NzCardComponent,
    NzTypographyModule,
    SubmitUploadModalComponent
  ],
  templateUrl: './submits-list.component.html',
})
export class SubmitsListComponent implements OnInit {
  submits: SubmitListItemDto[] = [];
  isLoading: boolean = false;
  errorMessage: string | null = null;

  // Table
  pageIndex: number = 1;
  pageSize: number = 20;
  totalSubmits: number = 0;
  onlyUnrated: boolean = true;
  modelFilter: string = '';

  isUploadModalVisible: boolean = false;
  uploadModel: string = '';
  sourceName: string = '';
  promptName: string = '';
  promptPaths: string[] = [];
  selectedPromptPath: string | null = null;
  sourceFile: File | null = null;
  promptFile: File | null = null;
  isPromptOptionsLoading: boolean = false;
  isSubmittingUpload: boolean = false;
  uploadErrorMessage: string | null = null;
  uploadSuccessMessage: string | null = null;

  public constructor(
    private readonly submitsApiService: SubmitsApiService,
    private readonly promptsApiService: PromptsApiService
  ) {
  }

  public ngOnInit(): void {
    this.loadSubmits();
  }

  public applyFilters(): void {
    this.pageIndex = 1;
    this.loadSubmits();
  }

  public onPageIndexChange(pageIndex: number): void {
    this.pageIndex = pageIndex;
    this.loadSubmits();
  }

  public onPageSizeChange(pageSize: number): void {
    this.pageSize = pageSize;
    this.pageIndex = 1;
    this.loadSubmits();
  }

  public openUploadModal(): void {
    this.isUploadModalVisible = true;
    this.uploadErrorMessage = null;
    this.uploadSuccessMessage = null;
    this.loadPromptPaths();
  }

  public handleSourceFileSelected(file: File | null): void {
    this.sourceFile = file;
  }

  public handlePromptFileSelected(file: File | null): void {
    this.promptFile = file;
  }

  public submitUpload(): void {
    if (!this.canSubmitUpload) {
      return;
    }

    this.uploadErrorMessage = null;
    this.isSubmittingUpload = true;

    const formData = new FormData();
    formData.append('model', this.uploadModel.trim());

    if (this.sourceName.trim()) {
      formData.append('source_path', this.sourceName.trim());
    }

    if (this.sourceFile) {
      formData.append('source_file', this.sourceFile);
    }

    if (this.promptFile) {
      formData.append('prompt_file', this.promptFile);
      if (this.promptName.trim()) {
        formData.append('prompt_path', this.promptName.trim());
      }
    } else if (this.selectedPromptPath) {
      formData.append('prompt_path', this.selectedPromptPath);
    }

    this.submitsApiService
      .uploadSubmit(formData)
      .pipe(
        catchError(() => {
          this.uploadErrorMessage = 'Failed to upload submit.';
          return of(null);
        }),
        finalize(() => {
          this.isSubmittingUpload = false;
        })
      )
      .subscribe((response) => {
        if (!response) {
          return;
        }
        this.uploadSuccessMessage = `Upload started. Job: ${response.job_id}`;
        this.isUploadModalVisible = false;
        this.resetUploadForm();
        this.loadSubmits();
      });
  }

  public get canSubmitUpload(): boolean {
    return Boolean(
      this.uploadModel.trim() &&
      this.sourceFile &&
      (this.promptFile || this.selectedPromptPath)
    );
  }

  private resetUploadForm(): void {
    this.uploadModel = '';
    this.sourceName = '';
    this.promptName = '';
    this.selectedPromptPath = null;
    this.sourceFile = null;
    this.promptFile = null;
  }

  private loadPromptPaths(): void {
    this.isPromptOptionsLoading = true;
    this.promptsApiService
      .getPromptPaths()
      .pipe(
        catchError(() => {
          this.uploadErrorMessage = 'Failed to load prompt options.';
          return of({prompt_paths: []});
        }),
        finalize(() => {
          this.isPromptOptionsLoading = false;
        })
      )
      .subscribe((response) => {
        this.promptPaths = response.prompt_paths;
      });
  }

  private loadSubmits(): void {
    this.isLoading = true;

    this.submitsApiService
      .getSubmits(this.pageIndex, this.pageSize, this.onlyUnrated, this.modelFilter)
      .pipe(
        catchError(() => {
          this.errorMessage = 'Failed to load submits.';
          return of<SubmitListResponseDto>({
            items: [],
            total: 0,
            page: this.pageIndex,
            page_size: this.pageSize
          });
        }),
        finalize(() => {
          this.isLoading = false;
        })
      )
      .subscribe((response: SubmitListResponseDto) => {
        this.submits = response.items;
        this.totalSubmits = response.total;
      });
  }
}
