import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';

import {ApiClientService} from '../api-client.service';
import {
  AnalyzeSourceRequestDto,
  AnalyzeSourceResponseDto,
  SourceFilesResponseDto,
  SourceFolderChildrenResponseDto,
  SourceFoldersResponseDto,
  SourcePathsResponseDto
} from '../api.models';

@Injectable({providedIn: 'root'})
export class SourcesApiService {
  public constructor(private readonly apiClient: ApiClientService) {
  }

  public getSourcePaths(options?: {offset?: number; limit?: number}): Observable<SourcePathsResponseDto> {
    return this.apiClient.get<SourcePathsResponseDto>('/sources', {
      queryParams: {
        offset: options?.offset,
        limit: options?.limit
      }
    });
  }

  public getSourceFiles(sourcePath: string): Observable<SourceFilesResponseDto> {
    return this.apiClient.get<SourceFilesResponseDto>(`/sources/${encodeURIComponent(sourcePath)}`);
  }

  public getSourceFolders(): Observable<SourceFoldersResponseDto> {
    return this.apiClient.get<SourceFoldersResponseDto>('/sources/folders');
  }

  public getSourceFolderChildren(
    folderPath: string | null,
    options?: {offset?: number; limit?: number}
  ): Observable<SourceFolderChildrenResponseDto> {
    return this.apiClient.get<SourceFolderChildrenResponseDto>('/sources/folders/children', {
      queryParams: {
        folder_path: folderPath || undefined,
        offset: options?.offset,
        limit: options?.limit
      }
    });
  }

  public analyzeSource(
    sourcePath: string,
    request: AnalyzeSourceRequestDto
  ): Observable<AnalyzeSourceResponseDto> {
    return this.apiClient.post<AnalyzeSourceResponseDto, AnalyzeSourceRequestDto>(
      `/sources/${encodeURIComponent(sourcePath)}`,
      request
    );
  }
}
