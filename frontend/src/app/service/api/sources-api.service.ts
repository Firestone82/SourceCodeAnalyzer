import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';

import {ApiClientService} from './api-client.service';
import {SourceFilesResponseDto, SourcePathsResponseDto} from './sources-api.models';

@Injectable({providedIn: 'root'})
export class SourcesApiService {
  public constructor(private readonly apiClient: ApiClientService) {
  }

  public getSourcePaths(): Observable<SourcePathsResponseDto> {
    return this.apiClient.get<SourcePathsResponseDto>('/sources');
  }

  public getSourceFiles(sourcePath: string): Observable<SourceFilesResponseDto> {
    return this.apiClient.get<SourceFilesResponseDto>(`/sources/${encodeURIComponent(sourcePath)}`);
  }
}
