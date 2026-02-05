import {Injectable} from '@angular/core';
import {HttpClient, HttpHeaders, HttpParams} from '@angular/common/http';
import {Observable} from 'rxjs';
import {environment} from '../../../environments/environment';
import {AuthService} from '../auth/auth.service';

export interface ApiRequestOptions {
  queryParams?: Record<string, string | number | boolean | null | undefined>;
  headers?: Record<string, string>;
}

@Injectable({providedIn: 'root'})
export class ApiClientService {
  private readonly apiBaseUrl: string = environment.apiBaseUrl;

  public constructor(
    private readonly httpClient: HttpClient,
    private readonly authService: AuthService
  ) {
  }

  public get<ResponseBody>(path: string, options?: ApiRequestOptions): Observable<ResponseBody> {
    return this.httpClient.get<ResponseBody>(this.buildUrl(path), {
      params: this.buildParams(options?.queryParams),
      headers: this.buildHeaders(options?.headers)
    });
  }

  public post<ResponseBody, RequestBody>(
    path: string,
    body: RequestBody,
    options?: ApiRequestOptions
  ): Observable<ResponseBody> {
    return this.httpClient.post<ResponseBody>(this.buildUrl(path), body, {
      params: this.buildParams(options?.queryParams),
      headers: this.buildHeaders(options?.headers, true)
    });
  }

  public postFormData<ResponseBody>(
    path: string,
    body: FormData,
    options?: ApiRequestOptions
  ): Observable<ResponseBody> {
    return this.httpClient.post<ResponseBody>(this.buildUrl(path), body, {
      params: this.buildParams(options?.queryParams),
      headers: this.buildHeaders(options?.headers, false)
    });
  }

  public put<ResponseBody, RequestBody>(
    path: string,
    body: RequestBody,
    options?: ApiRequestOptions
  ): Observable<ResponseBody> {
    return this.httpClient.put<ResponseBody>(this.buildUrl(path), body, {
      params: this.buildParams(options?.queryParams),
      headers: this.buildHeaders(options?.headers, true)
    });
  }

  public delete<ResponseBody>(path: string, options?: ApiRequestOptions): Observable<ResponseBody> {
    return this.httpClient.delete<ResponseBody>(this.buildUrl(path), {
      params: this.buildParams(options?.queryParams),
      headers: this.buildHeaders(options?.headers, true)
    });
  }

  private buildUrl(path: string): string {
    const normalizedBaseUrl: string = this.apiBaseUrl.replace(/\/+$/, '');
    const normalizedPath: string = path.startsWith('/') ? path : `/${path}`;
    return `${normalizedBaseUrl}${normalizedPath}`;
  }

  private buildParams(extraParams?: Record<string, string | number | boolean | null | undefined>): HttpParams {
    let httpParams: HttpParams = new HttpParams();

    if (extraParams) {
      for (const [key, value] of Object.entries(extraParams)) {
        if (value === null || value === undefined) {
          continue;
        }
        httpParams = httpParams.set(key, String(value));
      }
    }

    return httpParams;
  }

  private buildHeaders(extraHeaders?: Record<string, string>, includeJsonContentType: boolean = true): HttpHeaders {
    let httpHeaders: HttpHeaders = new HttpHeaders();

    // Assign api_key header, if configured
    const apiKey = this.authService.apiKey;
    if (apiKey && apiKey.trim().length > 0) {
      httpHeaders = httpHeaders.set('Authorization', `X-API-Key ${apiKey}`);
    }

    if (includeJsonContentType) {
      httpHeaders = httpHeaders.set('Content-Type', 'application/json');
    }

    if (extraHeaders) {
      for (const [key, value] of Object.entries(extraHeaders)) {
        httpHeaders = httpHeaders.set(key, value);
      }
    }

    return httpHeaders;
  }
}
