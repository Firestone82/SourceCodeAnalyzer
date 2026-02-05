import {Injectable} from '@angular/core';
import {BehaviorSubject, Observable, of} from 'rxjs';
import {catchError, map, tap} from 'rxjs/operators';

import {AuthApiService} from '../api/types/auth-api.service';
import {RaterDto} from '../api/api.models';

const API_KEY_STORAGE = 'rater_api_key';
const RATER_STORAGE = 'rater_info';

@Injectable({providedIn: 'root'})
export class AuthService {
  private readonly raterSubject: BehaviorSubject<RaterDto | null> = new BehaviorSubject<RaterDto | null>(this.loadStoredRater());
  private apiKeyValue: string | null = this.loadStoredApiKey();
  private hasValidatedSession: boolean = false;

  public constructor(private readonly authApiService: AuthApiService) {
  }

  public get rater$(): Observable<RaterDto | null> {
    return this.raterSubject.asObservable();
  }

  public get currentRater(): RaterDto | null {
    return this.raterSubject.value;
  }

  public get apiKey(): string | null {
    return this.apiKeyValue;
  }

  public login(key: string): Observable<RaterDto> {
    const trimmedKey = key.trim();

    return this.authApiService.login({key: trimmedKey}).pipe(
      tap((rater: RaterDto) => {
        this.setSession(trimmedKey, rater);
        this.hasValidatedSession = true;
      })
    );
  }

  public ensureAuthenticated(): Observable<boolean> {
    if (!this.apiKeyValue) {
      this.raterSubject.next(null);
      return of(false);
    }

    if (this.hasValidatedSession) {
      return of(Boolean(this.currentRater));
    }

    return this.authApiService
      .validate(this.apiKeyValue)
      .pipe(
        tap((rater: RaterDto) => {
          this.setSession(this.apiKeyValue as string, rater);
          this.hasValidatedSession = true;
        }),
        map(() => true),
        catchError(() => {
          this.clearSession();
          this.hasValidatedSession = true;
          return of(false);
        })
      );
  }

  public clearSession(): void {
    this.apiKeyValue = null;
    this.hasValidatedSession = false;
    this.raterSubject.next(null);
    localStorage.removeItem(API_KEY_STORAGE);
    localStorage.removeItem(RATER_STORAGE);
  }

  private setSession(key: string, rater: RaterDto): void {
    this.apiKeyValue = key;
    this.raterSubject.next(rater);
    localStorage.setItem(API_KEY_STORAGE, key);
    localStorage.setItem(RATER_STORAGE, JSON.stringify(rater));
  }

  private loadStoredApiKey(): string | null {
    return localStorage.getItem(API_KEY_STORAGE);
  }

  private loadStoredRater(): RaterDto | null {
    const storedRater = localStorage.getItem(RATER_STORAGE);
    if (!storedRater) {
      return null;
    }

    try {
      return JSON.parse(storedRater) as RaterDto;
    } catch {
      return null;
    }
  }
}
