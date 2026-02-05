import {Injectable} from '@angular/core';
import {HttpClient, HttpHeaders, HttpParams} from '@angular/common/http';
import {Observable} from 'rxjs';
import {environment} from '../../../environments/environment';

export interface ApiRequestOptions {
  queryParams?: Record<string, string | number | boolean | null | undefined>;
  headers?: Record<string, string>;
}

@Injectable({providedIn: 'root'})
export class ApiClientService {
  private readonly apiBaseUrl: string = environment.apiBaseUrl;
  private readonly apiKey: string = environment.apiKey;

  public constructor(private readonly httpClient: HttpClient) {
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
      headers: this.buildHeaders(options?.headers)
    });
  }

  public put<ResponseBody, RequestBody>(
    path: string,
    body: RequestBody,
    options?: ApiRequestOptions
  ): Observable<ResponseBody> {
    return this.httpClient.put<ResponseBody>(this.buildUrl(path), body, {
      params: this.buildParams(options?.queryParams),
      headers: this.buildHeaders(options?.headers)
    });
  }

  public delete<ResponseBody>(path: string, options?: ApiRequestOptions): Observable<ResponseBody> {
    return this.httpClient.delete<ResponseBody>(this.buildUrl(path), {
      params: this.buildParams(options?.queryParams),
      headers: this.buildHeaders(options?.headers)
    });
  }

  private buildUrl(path: string): string {
    const normalizedBaseUrl: string = this.apiBaseUrl.replace(/\/+$/, '');
    const normalizedPath: string = path.startsWith('/') ? path : `/${path}`;
    return `${normalizedBaseUrl}${normalizedPath}`;
  }

  private buildParams(extraParams?: Record<string, string | number | boolean | null | undefined>): HttpParams {
    let httpParams: HttpParams = new HttpParams();

    // Always include api_key (query param), if configured
    if (this.apiKey && this.apiKey.trim().length > 0) {
      httpParams = httpParams.set('api_key', this.apiKey);
    }

    if (!extraParams) {
      return httpParams;
    }

    for (const [key, value] of Object.entries(extraParams)) {
      if (value === null || value === undefined) {
        continue;
      }
      httpParams = httpParams.set(key, String(value));
    }

    return httpParams;
  }

  private buildHeaders(extraHeaders?: Record<string, string>): HttpHeaders {
    let httpHeaders: HttpHeaders = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    if (!extraHeaders) {
      return httpHeaders;
    }

    for (const [key, value] of Object.entries(extraHeaders)) {
      httpHeaders = httpHeaders.set(key, value);
    }

    return httpHeaders;
  }
}
