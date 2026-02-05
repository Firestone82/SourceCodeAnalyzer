import {Injectable} from '@angular/core';
import {HttpClient, HttpParams} from '@angular/common/http';
import {Observable} from 'rxjs';

import {environment} from '../../../../environments/environment';
import {LoginRequestDto, RaterDto} from '../api.models';

@Injectable({providedIn: 'root'})
export class AuthApiService {
  private readonly apiBaseUrl: string = environment.apiBaseUrl;

  public constructor(private readonly httpClient: HttpClient) {
  }

  public login(request: LoginRequestDto): Observable<RaterDto> {
    return this.httpClient.post<RaterDto>(this.buildUrl('/auth/login'), request);
  }

  public validate(key: string): Observable<RaterDto> {
    const params = new HttpParams().set('api_key', key);
    return this.httpClient.get<RaterDto>(this.buildUrl('/auth/me'), {params});
  }

  private buildUrl(path: string): string {
    const normalizedBaseUrl: string = this.apiBaseUrl.replace(/\/+$/, '');
    const normalizedPath: string = path.startsWith('/') ? path : `/${path}`;
    return `${normalizedBaseUrl}${normalizedPath}`;
  }
}
