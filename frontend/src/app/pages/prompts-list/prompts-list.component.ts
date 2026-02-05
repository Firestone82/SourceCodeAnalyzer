import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {catchError, finalize, of} from 'rxjs';

import {NzCardComponent} from 'ng-zorro-antd/card';
import {NzLayoutModule} from 'ng-zorro-antd/layout';
import {NzMenuModule} from 'ng-zorro-antd/menu';
import {NzPaginationModule} from 'ng-zorro-antd/pagination';
import {NzSpinModule} from 'ng-zorro-antd/spin';
import {NzTypographyModule} from 'ng-zorro-antd/typography';

import {PromptsApiService} from '../../service/api/prompts-api.service';
import {PromptContentResponseDto, PromptNamesResponseDto} from '../../service/api/prompts-api.models';

@Component({
  selector: 'app-prompts-list',
  standalone: true,
  imports: [NzCardComponent, NzLayoutModule, NzMenuModule, NzPaginationModule, NzSpinModule, NzTypographyModule],
  templateUrl: './prompts-list.component.html',
})
export class PromptsListComponent implements OnInit {
  public promptPaths: string[] = [];
  public isLoading: boolean = false;
  public isPromptLoading: boolean = false;
  public errorMessage: string | null = null;
  public promptErrorMessage: string | null = null;
  public selectedPromptPath: string | null = null;
  public content: string = '';
  public pageIndex: number = 1;
  public pageSize: number = 12;

  public constructor(
    private readonly promptsApiService: PromptsApiService,
    private readonly activatedRoute: ActivatedRoute,
    private readonly router: Router
  ) {
  }

  public ngOnInit(): void {
    this.loadPrompts();
  }

  public get pagedPromptPaths(): string[] {
    const startIndex = (this.pageIndex - 1) * this.pageSize;
    return this.promptPaths.slice(startIndex, startIndex + this.pageSize);
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
        const requestedPrompt: string | null = this.activatedRoute.snapshot.queryParamMap.get('prompt');
        const shouldSelectPrompt: string | null =
          (requestedPrompt && this.promptPaths.includes(requestedPrompt)) ? requestedPrompt : null;
        if (shouldSelectPrompt) {
          this.updatePageForPrompt(shouldSelectPrompt);
          this.selectPrompt(shouldSelectPrompt);
        } else if (this.promptPaths.length > 0) {
          this.pageIndex = 1;
          this.selectPrompt(this.promptPaths[0]);
        }
      });
  }

  public onPromptPageChange(pageIndex: number): void {
    this.pageIndex = pageIndex;
  }

  public selectPrompt(promptPath: string): void {
    if (this.selectedPromptPath === promptPath) {
      return;
    }

    this.selectedPromptPath = promptPath;
    this.content = '';
    this.promptErrorMessage = null;
    this.isPromptLoading = true;
    void this.router.navigate([], {
      queryParams: {prompt: promptPath},
      queryParamsHandling: 'merge'
    });

    this.promptsApiService
      .getPromptContent(promptPath)
      .pipe(
        catchError(() => {
          this.promptErrorMessage = 'Failed to load prompt content.';
          return of<PromptContentResponseDto>({prompt_path: promptPath, content: ''});
        }),
        finalize(() => {
          this.isPromptLoading = false;
        })
      )
      .subscribe((response: PromptContentResponseDto) => {
        this.content = response.content;
      });
  }

  private updatePageForPrompt(promptPath: string): void {
    const index = this.promptPaths.indexOf(promptPath);
    if (index === -1) {
      return;
    }
    this.pageIndex = Math.floor(index / this.pageSize) + 1;
  }
}
