import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';

import {ApiClientService} from '../api-client.service';
import {
  PromptContentResponseDto,
  PromptNamesResponseDto,
  PromptUploadRequestDto,
  PromptUploadResponseDto
} from '../api.models';

@Injectable({providedIn: 'root'})
export class PromptsApiService {
  public constructor(private readonly apiClient: ApiClientService) {
  }

  public getPromptPaths(): Observable<PromptNamesResponseDto> {
    return this.apiClient.get<PromptNamesResponseDto>('/prompts');
  }

  public getPromptContent(promptPath: string): Observable<PromptContentResponseDto> {
    return this.apiClient.get<PromptContentResponseDto>(`/prompts/${encodeURIComponent(promptPath)}`);
  }

  public uploadPrompt(request: PromptUploadRequestDto): Observable<PromptUploadResponseDto> {
    return this.apiClient.post<PromptUploadResponseDto, PromptUploadRequestDto>('/prompts/upload', request);
  }
}
