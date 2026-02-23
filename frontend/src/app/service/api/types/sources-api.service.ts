import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';

import {ApiClientService} from '../api-client.service';
import {
  AnalyzeSourceRequestDto,
  AnalyzeSourceResponseDto,
  SourceFilesResponseDto,
  SourceFolderChildrenResponseDto,
  SourceFoldersResponseDto,
  SourcePathsResponseDto,
  SourceTagDeleteResponseDto,
  SourceTagRequestDto,
  SourceTagResponseDto,
  SourceTagsResponseDto,
  SourceUpdateRequestDto,
  SourceUpdateResponseDto
} from '../api.models';

@Injectable({providedIn: 'root'})
export class SourcesApiService {
  public constructor(private readonly apiClient: ApiClientService) {
  }

  public getSourcePaths(options?: {offset?: number; limit?: number; tag?: string | null}): Observable<SourcePathsResponseDto> {
    return this.apiClient.get<SourcePathsResponseDto>('/sources', {
      queryParams: {
        offset: options?.offset,
        limit: options?.limit,
        tag: options?.tag && options.tag.trim() ? options.tag.trim() : undefined
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

  public updateSourcePath(sourcePath: string, renamedSourcePath: string): Observable<SourceUpdateResponseDto> {
    const payload: SourceUpdateRequestDto = {source_path: renamedSourcePath};
    return this.apiClient.put<SourceUpdateResponseDto, SourceUpdateRequestDto>(
      `/sources/${encodeURIComponent(sourcePath)}`,
      payload
    );
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


  public getSourceTags(): Observable<SourceTagsResponseDto> {
    return this.apiClient.get<SourceTagsResponseDto>('/sources/tags');
  }

  public getSourceTag(sourcePath: string): Observable<SourceTagResponseDto> {
    return this.apiClient.get<SourceTagResponseDto>(`/sources/tags/${encodeURIComponent(sourcePath)}`);
  }

  public setSourceTag(sourcePath: string, tag: string): Observable<SourceTagResponseDto> {
    const payload: SourceTagRequestDto = {tag};
    return this.apiClient.put<SourceTagResponseDto, SourceTagRequestDto>(
      `/sources/tags/${encodeURIComponent(sourcePath)}`,
      payload
    );
  }

  public deleteSourceTag(sourcePath: string): Observable<SourceTagDeleteResponseDto> {
    return this.apiClient.delete<SourceTagDeleteResponseDto>(`/sources/tags/${encodeURIComponent(sourcePath)}`);
  }

}
