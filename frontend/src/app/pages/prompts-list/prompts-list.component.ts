import {Component, OnInit} from '@angular/core';
import {RouterLink} from '@angular/router';
import {catchError, finalize, of} from 'rxjs';

import {NzCardComponent} from 'ng-zorro-antd/card';
import {NzTableModule} from 'ng-zorro-antd/table';
import {NzTypographyModule} from 'ng-zorro-antd/typography';

import {PromptsApiService} from '../../service/api/prompts-api.service';
import {PromptNamesResponseDto} from '../../service/api/prompts-api.models';

@Component({
  selector: 'app-prompts-list',
  standalone: true,
  imports: [NzCardComponent, NzTableModule, NzTypographyModule, RouterLink],
  templateUrl: './prompts-list.component.html',
})
export class PromptsListComponent implements OnInit {
  public promptPaths: string[] = [];
  public isLoading: boolean = false;
  public errorMessage: string | null = null;

  public constructor(private readonly promptsApiService: PromptsApiService) {
  }

  public ngOnInit(): void {
    this.loadPrompts();
  }

  private loadPrompts(): void {
    this.isLoading = true;

    this.promptsApiService
      .getPromptPaths()
      .pipe(
        catchError(() => {
          this.errorMessage = 'Failed to load prompts.';
          return of<PromptNamesResponseDto>({prompt_paths: []});
        }),
        finalize(() => {
          this.isLoading = false;
        })
      )
      .subscribe((response: PromptNamesResponseDto) => {
        this.promptPaths = response.prompt_paths;
      });
  }
}
