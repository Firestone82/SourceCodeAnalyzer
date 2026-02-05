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
import {catchError, interval, of, Subject, switchMap, takeUntil, startWith} from 'rxjs';

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
    NzSpinModule
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
