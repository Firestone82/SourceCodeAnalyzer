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
import {catchError, interval, of, startWith, Subject, switchMap, takeUntil} from 'rxjs';

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
  public jobs: JobDto[] = [];
  public isLoading: boolean = false;
  public statusFilter: string | null = null;
  public pageIndex: number = 1;
  public pageSize: number = 20;
  public totalJobs: number = 0;

  public selectedLogJob: JobDto | null = null;
  public isErrorLogModalVisible: boolean = false;
  public selectedErrorLogText: string = '';

  private readonly destroy$ = new Subject<void>();

  public constructor(private readonly jobsApiService: JobsApiService) {
  }

  public ngOnInit(): void {
    interval(5000)
      .pipe(
        startWith(0),
        switchMap(() => {
          this.isLoading = true;
          return this.jobsApiService.getJobs(this.statusFilter, this.pageIndex, this.pageSize).pipe(
            catchError(() => of({items: [], total: 0, page: this.pageIndex, page_size: this.pageSize}))
          );
        }),
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

  public applyFilters(): void {
    this.isLoading = true;
    this.pageIndex = 1;
    this.jobsApiService.getJobs(this.statusFilter, this.pageIndex, this.pageSize)
      .pipe(
        catchError(() => of({items: [], total: 0, page: this.pageIndex, page_size: this.pageSize})),
        takeUntil(this.destroy$)
      )
      .subscribe((response: JobListResponseDto) => {
        this.jobs = response.items;
        this.totalJobs = response.total;
        this.isLoading = false;
      });
  }

  public onPageIndexChange(pageIndex: number): void {
    this.pageIndex = pageIndex;
    this.applyFilters();
  }

  public onPageSizeChange(pageSize: number): void {
    this.pageSize = pageSize;
    this.pageIndex = 1;
    this.applyFilters();
  }

  public shortJobId(jobId: string): string {
    const lastDash = jobId.lastIndexOf('-');

    if (lastDash >= 0 && lastDash < jobId.length - 1) {
      return jobId.slice(lastDash + 1);
    }

    return jobId;
  }

  public openErrorLog(job: JobDto): void {
    this.isErrorLogModalVisible = true;
    this.selectedLogJob = job;
    this.selectedErrorLogText = "Loading error log...";

    this.jobsApiService.getJobErrorLog(job.job_id)
      .pipe(
        catchError(() => {
          return of({job_id: job.job_id, error_log: 'No error log available.'});
        }),
        takeUntil(this.destroy$)
      )
      .subscribe((response) => {
        this.selectedErrorLogText = response.error_log;
      });
  }

  public closeErrorLogModal(): void {
    if (!this.selectedLogJob) {
      return;
    }

    this.isErrorLogModalVisible = false;
    this.selectedLogJob = null;
    this.selectedErrorLogText = "";
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
