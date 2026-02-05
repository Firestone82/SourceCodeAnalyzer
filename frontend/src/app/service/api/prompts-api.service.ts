import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';

import {ApiClientService} from './api-client.service';
import {PromptContentResponseDto, PromptNamesResponseDto} from './prompts-api.models';

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
}
