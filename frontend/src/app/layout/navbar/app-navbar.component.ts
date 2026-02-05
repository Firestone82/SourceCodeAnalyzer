import {Component} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {Router, RouterLink, RouterLinkActive} from '@angular/router';
import {NzMenuModule} from 'ng-zorro-antd/menu';
import {NzButtonModule} from 'ng-zorro-antd/button';

import {AuthService} from '../../service/auth/auth.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [NzMenuModule, RouterLink, RouterLinkActive, AsyncPipe, NzButtonModule],
  templateUrl: './app-navbar.component.html',
  styleUrl: './app-navbar.component.css'
})
export class AppNavbarComponent {
  public constructor(
    public readonly authService: AuthService,
    private readonly router: Router
  ) {
  }

  public logout(): void {
    this.authService.clearSession();
    void this.router.navigate(['/login']);
  }
}
