import {Component} from '@angular/core';
import {RouterOutlet} from '@angular/router';
import {NzLayoutModule} from 'ng-zorro-antd/layout';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NzLayoutModule],
  template: `
    <router-outlet/>
  `
})
export class AppComponent {
}
