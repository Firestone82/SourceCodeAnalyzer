import {Injectable} from '@angular/core';
import {Observable} from 'rxjs';

import {ApiClientService} from '../api-client.service';
import {
  RaterCreateRequestDto,
  RaterDeleteResponseDto,
  RaterDto,
  RatersResponseDto,
  RaterUpdateRequestDto
} from '../api.models';

@Injectable({providedIn: 'root'})
export class RatersApiService {
  public constructor(private readonly apiClientService: ApiClientService) {
  }

  public listRaters(): Observable<RatersResponseDto> {
    return this.apiClientService.get<RatersResponseDto>('/raters');
  }

  public createRater(request: RaterCreateRequestDto): Observable<RaterDto> {
    return this.apiClientService.post<RaterDto, RaterCreateRequestDto>('/raters', request);
  }

  public updateRater(raterId: number, request: RaterUpdateRequestDto): Observable<RaterDto> {
    return this.apiClientService.put<RaterDto, RaterUpdateRequestDto>(`/raters/${raterId}`, request);
  }

  public deleteRater(raterId: number): Observable<RaterDeleteResponseDto> {
    return this.apiClientService.delete<RaterDeleteResponseDto>(`/raters/${raterId}`);
  }
}
