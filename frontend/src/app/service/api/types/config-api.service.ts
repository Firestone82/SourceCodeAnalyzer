import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';

import {ApiClientService} from '../api-client.service';
import {OpenAIServerListResponseDto} from '../api.models';

@Injectable({providedIn: 'root'})
export class ConfigApiService {
  public constructor(private readonly apiClient: ApiClientService) {
  }

  public getOpenAIServers(): Observable<OpenAIServerListResponseDto> {
    return this.apiClient.get<OpenAIServerListResponseDto>('/config/openai-servers');
  }
}
