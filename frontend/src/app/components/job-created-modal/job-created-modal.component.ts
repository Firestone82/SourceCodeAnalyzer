import {Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges} from '@angular/core';
import {Router, RouterLink} from '@angular/router';
import {NzButtonModule} from 'ng-zorro-antd/button';
import {NzModalModule} from 'ng-zorro-antd/modal';
import {NzSpinModule} from 'ng-zorro-antd/spin';
import {NzTagModule} from 'ng-zorro-antd/tag';
import {forkJoin, interval, Observable, of, Subscription} from 'rxjs';
import {catchError, map, startWith, switchMap} from 'rxjs/operators';

import {JobDto} from '../../service/api/api.models';
import {JobsApiService} from '../../service/api/types/jobs-api.service';

type JobPollingSnapshot = {
  jobStatuses: Record<string, string>;
  jobsById: Record<string, JobDto>;
};

@Component({
  selector: 'app-job-created-modal',
  standalone: true,
  imports: [
    RouterLink,
    NzButtonModule,
    NzModalModule,
    NzSpinModule,
    NzTagModule
  ],
  templateUrl: './job-created-modal.component.html'
})
export class JobCreatedModalComponent implements OnChanges, OnDestroy {
  @Input() public isVisible: boolean = false;
  @Output() public readonly isVisibleChange = new EventEmitter<boolean>();
  @Input() public jobIds: string[] = [];

  public jobStatuses: Record<string, string> = {};
  private pollingSubscription?: Subscription;

  public constructor(
    private readonly jobsApiService: JobsApiService,
    private readonly router: Router
  ) {
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['isVisible'] || changes['jobIds']) {
      if (this.isVisible) {
        this.startPolling();
      } else {
        this.stopPolling();
      }
    }
  }

  public ngOnDestroy(): void {
    this.stopPolling();
  }

  public closeModal(): void {
    this.isVisibleChange.emit(false);
  }

  private startPolling(): void {
    if (this.pollingSubscription) {
      return;
    }

    this.pollingSubscription = interval(2000)
      .pipe(
        startWith(0),
        switchMap(() => this.fetchSnapshot())
      )
      .subscribe((snapshot: JobPollingSnapshot) => {
        this.jobStatuses = snapshot.jobStatuses;

        const allFinished: boolean = this.jobIds.every((jobId: string) => {
          const status: string | undefined = snapshot.jobStatuses[jobId];
          return status === 'succeeded' || status === 'failed';
        });

        if (!allFinished) {
          return;
        }

        this.stopPolling();
        this.closeModal();

        if (this.jobIds.length === 1) {
          const singleJobId: string = this.jobIds[0];
          const singleJob: JobDto | undefined = snapshot.jobsById[singleJobId];
          const submitId: number | null | undefined = singleJob?.submit_id;

          if (submitId != null) {
            this.router.navigate(['/submits', submitId]).then(() => {});
          } else {
            // fallback if API hasn’t populated submit_id (or it’s genuinely null)
            this.router.navigate(['/submits']).then(() => {});
          }
        } else {
          this.router.navigate(['/submits']).then(() => {});
        }
      });
  }

  private stopPolling(): void {
    this.pollingSubscription?.unsubscribe();
    this.pollingSubscription = undefined;
  }

  private fetchSnapshot(): Observable<JobPollingSnapshot> {
    if (!this.jobIds.length) {
      return of({jobStatuses: {}, jobsById: {}});
    }

    return forkJoin(
      this.jobIds.map((jobId: string) => this.jobsApiService.getJob(jobId))
    ).pipe(
      map((jobs: JobDto[]) => {
        const jobsById: Record<string, JobDto> = {};
        const jobStatuses: Record<string, string> = {};

        for (const job of jobs) {
          jobsById[job.job_id] = job;
          jobStatuses[job.job_id] = job.status;
        }

        return {jobStatuses, jobsById};
      }),
      catchError(() => of({jobStatuses: {}, jobsById: {}}))
    );
  }
}
