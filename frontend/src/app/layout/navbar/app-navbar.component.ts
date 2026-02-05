import {Component} from '@angular/core';
import {AsyncPipe} from '@angular/common';
import {RouterLink, RouterLinkActive} from '@angular/router';
import {NzMenuModule} from 'ng-zorro-antd/menu';

import {AuthService} from '../../service/auth/auth.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [NzMenuModule, RouterLink, RouterLinkActive, AsyncPipe],
  templateUrl: './app-navbar.component.html',
  styleUrl: './app-navbar.component.css'
})
export class AppNavbarComponent {
  public constructor(public readonly authService: AuthService) {
  }
}
