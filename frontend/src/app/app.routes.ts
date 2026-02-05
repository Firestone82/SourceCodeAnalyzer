import {Routes} from '@angular/router';
import {SubmitsListComponent} from './pages/submits-list/submits-list.component';
import {SubmitDetailComponent} from './pages/submit-detail/submit-detail.component';
import {AppLayout} from './layout/main/app-layout.component';
import {PromptsListComponent} from './pages/prompts-list/prompts-list.component';
import {PromptDetailComponent} from './pages/prompt-detail/prompt-detail.component';
import {SourcesListComponent} from './pages/sources-list/sources-list.component';
import {SourceDetailComponent} from './pages/source-detail/source-detail.component';

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
      {
        path: 'prompts',
        component: PromptsListComponent
      },
      {
        path: 'prompts/:promptPath',
        component: PromptDetailComponent
      },
      {
        path: 'sources',
        component: SourcesListComponent
      },
      {
        path: 'sources/:sourcePath',
        component: SourceDetailComponent
      },
    ]
  },
  {
    path: '**',
    redirectTo: 'submits'
  }
];
