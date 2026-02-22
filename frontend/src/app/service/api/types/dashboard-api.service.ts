import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';
import {ApiClientService} from '../api-client.service';
import {DashboardStatsResponseDto} from '../api.models';

@Injectable({providedIn: 'root'})
export class DashboardApiService {
  public constructor(private readonly apiClientService: ApiClientService) {
  }

  public getStats(sourcePath: string | null, promptPath: string | null, model: string | null): Observable<DashboardStatsResponseDto> {
    return this.apiClientService.get<DashboardStatsResponseDto>('/dashboard/stats', {
      queryParams: {
        source_path: sourcePath && sourcePath.trim() ? sourcePath.trim() : null,
        prompt_path: promptPath && promptPath.trim() ? promptPath.trim() : null,
        model: model && model.trim() ? model.trim() : null
      }
    });
  }
}
