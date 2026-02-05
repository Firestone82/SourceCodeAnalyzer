import {Component} from '@angular/core';
import {RouterOutlet} from '@angular/router';
import {NzLayoutModule} from 'ng-zorro-antd/layout';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NzLayoutModule],
  template: `
    <nz-layout class="app-layout">
      <nz-header class="app-header">Submits Rater</nz-header>

      <nz-content class="max-w-7xl w-full mx-auto p-4">
        <router-outlet/>
      </nz-content>
    </nz-layout>
  `,
  styles: [`
    .app-layout {
      min-height: 100vh;
    }

    .app-header {
      color: rgba(255, 255, 255, .85);
      font-weight: 600;
    }

    .app-content {
      padding: 16px;
    }
  `]
})
export class AppLayout {
}
