import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';

import {ApiClientService} from '../api-client.service';
import {JobDto, JobListResponseDto} from '../api.models';

@Injectable({providedIn: 'root'})
export class JobsApiService {
  public constructor(private readonly apiClient: ApiClientService) {
  }

  public getJobs(
    status: string | null,
    page: number,
    pageSize: number
  ): Observable<JobListResponseDto> {
    return this.apiClient.get<JobListResponseDto>('/jobs', {
      queryParams: {
        status: status ?? null,
        page,
        page_size: pageSize
      }
    });
  }

  public getJob(jobId: string): Observable<JobDto> {
    return this.apiClient.get<JobDto>(`/jobs/${encodeURIComponent(jobId)}`);
  }
}
