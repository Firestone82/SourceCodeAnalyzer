import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';

import {ApiClientService} from '../api-client.service';
import {
  PromptContentResponseDto,
  PromptDeleteResponseDto,
  PromptNamesResponseDto,
  PromptUpdateRequestDto
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


  public updatePromptContent(
    promptPath: string,
    content: string,
    renamedPromptPath?: string
  ): Observable<PromptContentResponseDto> {
    const payload: PromptUpdateRequestDto = {
      content,
      ...(renamedPromptPath ? {prompt_path: renamedPromptPath} : {})
    };
    return this.apiClient.put<PromptContentResponseDto, PromptUpdateRequestDto>(
      `/prompts/${encodeURIComponent(promptPath)}`,
      payload
    );
  }

  public deletePrompt(promptPath: string): Observable<PromptDeleteResponseDto> {
    return this.apiClient.delete<PromptDeleteResponseDto>(`/prompts/${encodeURIComponent(promptPath)}`);
  }

}
