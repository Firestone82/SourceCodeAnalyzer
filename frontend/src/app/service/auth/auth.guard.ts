import {Injectable} from '@angular/core';
import {CanActivateChild, Router, UrlTree} from '@angular/router';
import {Observable} from 'rxjs';
import {map} from 'rxjs/operators';

import {AuthService} from './auth.service';

@Injectable({providedIn: 'root'})
export class AuthGuard implements CanActivateChild {
  public constructor(
    private readonly authService: AuthService,
    private readonly router: Router
  ) {
  }

  public canActivateChild(): Observable<boolean | UrlTree> {
    return this.authService.ensureAuthenticated().pipe(
      map((isAuthenticated: boolean) => {
        if (isAuthenticated) {
          return true;
        }

        return this.router.createUrlTree(['/login']);
      })
    );
  }
}
