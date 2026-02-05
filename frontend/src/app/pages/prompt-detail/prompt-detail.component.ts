import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, RouterLink} from '@angular/router';
import {catchError, finalize, of} from 'rxjs';

import {NzCardComponent} from 'ng-zorro-antd/card';
import {NzSpinModule} from 'ng-zorro-antd/spin';
import {NzTypographyModule} from 'ng-zorro-antd/typography';
import {NzButtonModule} from 'ng-zorro-antd/button';

import {PromptsApiService} from '../../service/api/prompts-api.service';
import {PromptContentResponseDto} from '../../service/api/prompts-api.models';

@Component({
  selector: 'app-prompt-detail',
  standalone: true,
  imports: [NzCardComponent, NzSpinModule, NzTypographyModule, NzButtonModule, RouterLink],
  templateUrl: './prompt-detail.component.html',
})
export class PromptDetailComponent implements OnInit {
  public isLoading: boolean = false;
  public errorMessage: string | null = null;
  public promptPath: string | null = null;
  public content: string = '';

  public constructor(
    private readonly activatedRoute: ActivatedRoute,
    private readonly promptsApiService: PromptsApiService
  ) {
  }

  public ngOnInit(): void {
    const promptPath: string | null = this.activatedRoute.snapshot.paramMap.get('promptPath');
    if (!promptPath) {
      this.errorMessage = 'Prompt not found.';
      return;
    }

    this.promptPath = promptPath;
    this.loadPrompt(promptPath);
  }

  private loadPrompt(promptPath: string): void {
    this.isLoading = true;

    this.promptsApiService
      .getPromptContent(promptPath)
      .pipe(
        catchError(() => {
          this.errorMessage = 'Failed to load prompt content.';
          return of<PromptContentResponseDto>({prompt_path: promptPath, content: ''});
        }),
        finalize(() => {
          this.isLoading = false;
        })
      )
      .subscribe((response: PromptContentResponseDto) => {
        this.content = response.content;
      });
  }
}
