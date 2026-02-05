import {Routes} from '@angular/router';
import {SubmitsListComponent} from './pages/submits-list/submits-list.component';
import {SubmitDetailComponent} from './pages/submit-detail/submit-detail.component';
import {AppLayout} from './layout/main/app-layout.component';

export const routes: Routes = [
  {
    path: '',
    component: AppLayout,
    children: [
      {
        path: 'submits',
        component: SubmitsListComponent
      },
      {
        path: 'submits/:submitId',
        component: SubmitDetailComponent
      },
    ]
  },
  {
    path: '**',
    redirectTo: 'submits'
  }
];
