import {Component, OnDestroy, OnInit} from '@angular/core';
import {Router, RouterLink} from '@angular/router';
import {DatePipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {NzTableModule} from 'ng-zorro-antd/table';
import {NzButtonModule} from 'ng-zorro-antd/button';
import {NzTagModule} from 'ng-zorro-antd/tag';
import {NzInputModule} from 'ng-zorro-antd/input';
import {NzCheckboxModule} from 'ng-zorro-antd/checkbox';
import {SubmitsApiService} from '../../service/api/types/submits-api.service';
import {SubmitListItemDto, SubmitListResponseDto} from '../../service/api/api.models';
import {catchError, finalize, interval, merge, of, Subject, switchMap, takeUntil, startWith} from 'rxjs';
import {NzCardComponent} from 'ng-zorro-antd/card';
import {SubmitUploadModalComponent} from '../../components/submit-upload-modal/submit-upload-modal.component';
import {JobCreatedModalComponent} from '../../components/job-created-modal/job-created-modal.component';
import {JobsApiService} from '../../service/api/types/jobs-api.service';
import {NzTypographyModule} from 'ng-zorro-antd/typography';
import {AnalyzeSourceResponseDto} from '../../service/api/api.models';
import {AuthService} from '../../service/auth/auth.service';

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
    SubmitUploadModalComponent,
    JobCreatedModalComponent
  ],
  templateUrl: './submits-list.component.html',
})
export class SubmitsListComponent implements OnInit, OnDestroy {
  submits: SubmitListItemDto[] = [];
  isLoading: boolean = false;
  errorMessage: string | null = null;

  // Table
  pageIndex: number = 1;
  pageSize: number = 20;
  totalSubmits: number = 0;
  onlyUnrated: boolean = true;
  modelFilter: string = '';
  promptFilter: string = '';
  sourceFilter: string = '';

  isUploadModalVisible: boolean = false;
  pendingUpload: { jobId: string; sourcePath: string; promptPath: string; model: string } | null = null;
  isJobModalVisible: boolean = false;
  jobModalIds: string[] = [];
  isAdmin: boolean = false;
  publishingSubmitIds: Set<number> = new Set<number>();
  private readonly destroy$ = new Subject<void>();
  private readonly uploadPollingStop$ = new Subject<void>();

  public constructor(
    private readonly submitsApiService: SubmitsApiService,
    private readonly jobsApiService: JobsApiService,
    private readonly router: Router,
    private readonly authService: AuthService
  ) {
  }

  public ngOnInit(): void {
    this.loadSubmits();
    this.authService.rater$
      .pipe(takeUntil(this.destroy$))
      .subscribe((rater) => {
        this.isAdmin = Boolean(rater?.admin);
      });
  }

  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.uploadPollingStop$.next();
    this.uploadPollingStop$.complete();
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
  }

  private startUploadPolling(): void {
    if (!this.pendingUpload) {
      return;
    }

    const pending = this.pendingUpload;
    this.uploadPollingStop$.next();
    interval(4000)
      .pipe(
        startWith(0),
        switchMap(() => this.jobsApiService.getJob(pending.jobId)),
        catchError(() => of(null)),
        takeUntil(merge(this.destroy$, this.uploadPollingStop$))
      )
      .subscribe((response) => {
        if (!response) {
          return;
        }
        if (response.status === 'failed') {
          this.pendingUpload = null;
          this.uploadPollingStop$.next();
          return;
        }
        if (response.status === 'succeeded' && response.submit_id) {
          this.pendingUpload = null;
          this.uploadPollingStop$.next();
          void this.router.navigate(['/submits', response.submit_id]);
        }
      });
  }

  public handleUploadCompleted(response: AnalyzeSourceResponseDto): void {
    this.pendingUpload = {
      jobId: response.job_id,
      sourcePath: response.source_path,
      promptPath: response.prompt_path,
      model: response.model
    };
    this.jobModalIds = [response.job_id];
    this.isJobModalVisible = true;
    this.startUploadPolling();
    this.loadSubmits();
  }

  public togglePublish(submit: SubmitListItemDto): void {
    if (!this.isAdmin || this.publishingSubmitIds.has(submit.id)) {
      return;
    }

    this.publishingSubmitIds.add(submit.id);
    this.submitsApiService
      .setSubmitPublishState(submit.id, !submit.published)
      .pipe(finalize(() => this.publishingSubmitIds.delete(submit.id)))
      .subscribe({
        next: (response) => {
          submit.published = response.published;
        },
        error: () => {
          this.errorMessage = 'Failed to update submit visibility.';
        }
      });
  }

  private loadSubmits(): void {
    this.isLoading = true;

    this.submitsApiService
      .getSubmits(
        this.pageIndex,
        this.pageSize,
        this.onlyUnrated,
        this.modelFilter,
        this.sourceFilter,
        this.promptFilter
      )
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
