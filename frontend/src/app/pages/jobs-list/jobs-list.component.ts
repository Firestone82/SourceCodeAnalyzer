import {Component, OnDestroy, OnInit} from '@angular/core';
import {RouterLink} from '@angular/router';
import {DatePipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {NzTableModule} from 'ng-zorro-antd/table';
import {NzCardComponent} from 'ng-zorro-antd/card';
import {NzSelectModule} from 'ng-zorro-antd/select';
import {NzTagModule} from 'ng-zorro-antd/tag';
import {NzTypographyModule} from 'ng-zorro-antd/typography';
import {NzSpinModule} from 'ng-zorro-antd/spin';
import {NzButtonModule} from 'ng-zorro-antd/button';
import {NzModalModule} from 'ng-zorro-antd/modal';
import {NzMessageService} from 'ng-zorro-antd/message';
import {catchError, interval, Observable, of, startWith, Subject, switchMap, takeUntil} from 'rxjs';

import {JobsApiService} from '../../service/api/types/jobs-api.service';
import {JobDto, JobListResponseDto} from '../../service/api/api.models';

@Component({
  selector: 'app-jobs-list',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    NzTableModule,
    NzCardComponent,
    NzSelectModule,
    NzTagModule,
    NzTypographyModule,
    NzSpinModule,
    NzButtonModule,
    NzModalModule
  ],
  templateUrl: './jobs-list.component.html'
})
export class JobsListComponent implements OnInit, OnDestroy {
  public readonly refreshIntervalMs: number = 5000;
  public jobs: JobDto[] = [];
  public isLoading: boolean = false;
  public statusFilter: string | null = null;
  public pageIndex: number = 1;
  public pageSize: number = 20;
  public totalJobs: number = 0;

  public selectedLogJob: JobDto | null = null;
  public isLogModalVisible: boolean = false;
  public selectedLogText: string = '';

  private readonly destroy$ = new Subject<void>();

  public constructor(
    private readonly jobsApiService: JobsApiService,
    private readonly nzMessageService: NzMessageService
  ) {
  }

  public ngOnInit(): void {
    interval(this.refreshIntervalMs)
      .pipe(
        startWith(0),
        switchMap(() => this.fetchJobs(false)),
        takeUntil(this.destroy$)
      )
      .subscribe((response: JobListResponseDto) => {
        this.jobs = response.items;
        this.totalJobs = response.total;
        this.isLoading = false;
      });
  }

  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  public applyFilters(resetPage: boolean = true): void {
    this.fetchJobs(resetPage)
      .pipe(takeUntil(this.destroy$))
      .subscribe((response: JobListResponseDto) => {
        this.jobs = response.items;
        this.totalJobs = response.total;
        this.isLoading = false;
      });
  }

  public onPageIndexChange(pageIndex: number): void {
    this.pageIndex = pageIndex;
    this.applyFilters(false);
  }

  public onPageSizeChange(pageSize: number): void {
    this.pageSize = pageSize;
    this.pageIndex = 1;
    this.applyFilters(false);
  }

  public shortJobId(jobId: string): string {
    const lastDash = jobId.lastIndexOf('-');

    if (lastDash >= 0 && lastDash < jobId.length - 1) {
      return jobId.slice(lastDash + 1);
    }

    return jobId;
  }

  public openJobLog(job: JobDto): void {
    this.isLogModalVisible = true;
    this.selectedLogJob = job;
    this.selectedLogText = 'Loading log...';

    this.jobsApiService.getJobErrorLog(job.job_id)
      .pipe(
        catchError(() => {
          return of({job_id: job.job_id, error_log: 'No error log available.'});
        }),
        takeUntil(this.destroy$)
      )
      .subscribe((response) => {
        this.selectedLogText = response.error_log;
      });
  }

  public closeLogModal(): void {
    if (!this.selectedLogJob) {
      return;
    }

    this.isLogModalVisible = false;
    this.selectedLogJob = null;
    this.selectedLogText = '';
  }

  public restartJob(job: JobDto): void {
    if (job.status !== 'failed') {
      return;
    }

    this.jobsApiService.restartJob(job.job_id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.nzMessageService.success(`Restarted job as ${response.job_id}`);
          this.applyFilters(false);
        },
        error: (error) => {
          const detail = error?.error?.detail;
          const errorText = typeof detail === 'string' ? detail : 'Failed to restart job';
          this.nzMessageService.error(errorText);
        }
      });
  }


  private fetchJobs(resetPage: boolean): Observable<JobListResponseDto> {
    if (resetPage) {
      this.pageIndex = 1;
    }

    this.isLoading = true;
    return this.jobsApiService.getJobs(this.statusFilter, this.pageIndex, this.pageSize).pipe(
      catchError(() => of({items: [], total: 0, page: this.pageIndex, page_size: this.pageSize}))
    );
  }

  public statusColor(status: string): string {
    switch (status) {
      case 'succeeded':
        return 'green';
      case 'failed':
        return 'red';
      default:
        return 'blue';
    }
  }
}
