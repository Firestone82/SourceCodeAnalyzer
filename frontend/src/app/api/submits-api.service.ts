import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiClientService } from './api-client.service';
import {
  SubmitDetailsDto,
  SubmitDto,
  SubmitListItemDto
} from './submits-api.models';

@Injectable({ providedIn: 'root' })
export class SubmitsApiService {
  public constructor(private readonly apiClientService: ApiClientService) {}

  public getSubmits(): Observable<SubmitListItemDto[]> {
    return this.apiClientService.get<SubmitListItemDto[]>('/submits');
  }

  public getSubmit(submitId: number): Observable<SubmitDto> {
    return this.apiClientService.get<SubmitDto>(`/submits/${submitId}`);
  }

  public getSubmitDetails(submitId: number): Observable<SubmitDetailsDto> {
    return this.apiClientService.get<SubmitDetailsDto>(`/submits/${submitId}/details`);
  }

  public rateIssue(issueId: number, rating: number): Observable<void> {
    return this.apiClientService.post<void, { rating: number }>(
      `/ratings/issues/${issueId}`,
      { rating }
    );
  }
}
