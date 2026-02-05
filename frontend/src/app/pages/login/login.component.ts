import {Component} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {Router} from '@angular/router';
import {NzButtonModule} from 'ng-zorro-antd/button';
import {NzCardModule} from 'ng-zorro-antd/card';
import {NzInputModule} from 'ng-zorro-antd/input';
import {NzTypographyModule} from 'ng-zorro-antd/typography';
import {catchError, finalize, of} from 'rxjs';

import {AuthService} from '../../service/auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, NzButtonModule, NzCardModule, NzInputModule, NzTypographyModule],
  templateUrl: './login.component.html'
})
export class LoginComponent {
  public apiKey: string = '';
  public isSubmitting: boolean = false;
  public errorMessage: string | null = null;

  public constructor(
    private readonly authService: AuthService,
    private readonly router: Router
  ) {
  }

  public submit(): void {
    this.errorMessage = null;
    const key = this.apiKey.trim();

    if (!key) {
      this.errorMessage = 'API key is required.';
      return;
    }

    this.isSubmitting = true;
    this.authService
      .login(key)
      .pipe(
        catchError(() => {
          this.errorMessage = 'Login failed. Please check your key.';
          return of(null);
        }),
        finalize(() => {
          this.isSubmitting = false;
        })
      )
      .subscribe((rater) => {
        if (!rater) {
          return;
        }
        void this.router.navigate(['/submits']);
      });
  }
}
