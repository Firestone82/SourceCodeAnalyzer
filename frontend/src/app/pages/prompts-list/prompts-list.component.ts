import {Component, OnDestroy, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {catchError, finalize, of, Subject, takeUntil} from 'rxjs';

import {FormsModule} from '@angular/forms';
import {DomSanitizer, type SafeHtml} from '@angular/platform-browser';
import {NzCardComponent} from 'ng-zorro-antd/card';
import {NzLayoutModule} from 'ng-zorro-antd/layout';
import {NzMenuModule} from 'ng-zorro-antd/menu';
import {NzPaginationModule} from 'ng-zorro-antd/pagination';
import {NzSpinModule} from 'ng-zorro-antd/spin';
import {NzTypographyModule} from 'ng-zorro-antd/typography';
import {NzButtonModule} from 'ng-zorro-antd/button';
import {NzMessageService} from 'ng-zorro-antd/message';
import {NzSegmentedModule} from 'ng-zorro-antd/segmented';

import {PromptsApiService} from '../../service/api/types/prompts-api.service';
import {AnalyzeSourceResponseDto, PromptContentResponseDto, PromptNamesResponseDto} from '../../service/api/api.models';
import {SyntaxHighlighterService} from '../../service/syntax-highlighting.service';
import {PromptReviewModalComponent} from '../../components/prompt-review-modal/prompt-review-modal.component';
import {JobCreatedModalComponent} from '../../components/job-created-modal/job-created-modal.component';
import {AuthService} from '../../service/auth/auth.service';

@Component({
  selector: 'app-prompts-list',
  standalone: true,
  imports: [
    FormsModule,
    NzCardComponent,
    NzLayoutModule,
    NzMenuModule,
    NzPaginationModule,
    NzSpinModule,
    NzTypographyModule,
    NzButtonModule,
    NzSegmentedModule,
    PromptReviewModalComponent,
    JobCreatedModalComponent
  ],
  templateUrl: './prompts-list.component.html',
  styleUrl: './prompts-list.component.css'
})
export class PromptsListComponent implements OnInit, OnDestroy {
  public promptPaths: string[] = [];
  public isLoading: boolean = false;
  public isPromptLoading: boolean = false;
  public isMarkdownRendering: boolean = false;
  public errorMessage: string | null = null;
  public promptErrorMessage: string | null = null;
  public selectedPromptPath: string | null = null;
  public content: string = '';
  public renderedContent: SafeHtml | null = null;
  public isMarkdownView: boolean = true;
  public promptViewMode: 'markdown' | 'raw' = 'markdown';
  public promptViewOptions: Array<{ label: string; value: 'markdown' | 'raw' }> = [
    {label: 'Markdown', value: 'markdown'},
    {label: 'Raw', value: 'raw'}
  ];
  public pageIndex: number = 1;
  public pageSize: number = 12;

  public isReviewModalVisible: boolean = false;
  public isJobModalVisible: boolean = false;
  public jobModalIds: string[] = [];
  public isAdmin: boolean = false;
  private readonly destroy$ = new Subject<void>();

  public constructor(
    private readonly promptsApiService: PromptsApiService,
    private readonly activatedRoute: ActivatedRoute,
    private readonly router: Router,
    private readonly syntaxHighlighterService: SyntaxHighlighterService,
    private readonly domSanitizer: DomSanitizer,
    private readonly authService: AuthService,
    private readonly nzMessageService: NzMessageService
  ) {
  }

  public ngOnInit(): void {
    this.loadPrompts();
    this.authService.rater$
      .pipe(takeUntil(this.destroy$))
      .subscribe((rater) => {
        this.isAdmin = Boolean(rater?.admin);
      });
  }

  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  public get pagedPromptPaths(): string[] {
    const startIndex = (this.pageIndex - 1) * this.pageSize;
    return this.promptPaths.slice(startIndex, startIndex + this.pageSize);
  }

  private loadPrompts(): void {
    this.isLoading = true;
    this.errorMessage = null;

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
    this.renderedContent = null;
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

        if (this.isMarkdownView) {
          this.renderMarkdownContent();
        }
      });
  }

  public onPromptViewChange(mode: 'markdown' | 'raw'): void {
    this.isMarkdownView = mode === 'markdown';
    this.promptViewMode = mode;
    if (this.isMarkdownView) {
      this.renderMarkdownContent();
    }
  }

  private renderMarkdownContent(): void {
    if (!this.isMarkdownView) {
      return;
    }

    if (this.content.length === 0) {
      this.renderedContent = '';
      this.isMarkdownRendering = false;
      return;
    }

    this.isMarkdownRendering = true;
    this.syntaxHighlighterService
      .markdownToHtml(this.content)
      .then((html: string) => {
        this.renderedContent = this.domSanitizer.bypassSecurityTrustHtml(html);
      })
      .catch(() => {
        this.promptErrorMessage = 'Failed to render markdown content.';
        this.renderedContent = '';
      })
      .finally(() => {
        this.isMarkdownRendering = false;
      });
  }

  public openReviewModal(): void {
    if (!this.selectedPromptPath) {
      this.errorMessage = 'Select a prompt before starting a review.';
      return;
    }
    if (!this.isAdmin) {
      this.nzMessageService.error('Only admins can start reviews.');
      return;
    }

    this.isReviewModalVisible = true;
  }

  public handleReviewsQueued(responses: AnalyzeSourceResponseDto[]): void {
    this.jobModalIds = responses.map((response) => response.job_id);
    this.isJobModalVisible = true;
  }

  private updatePageForPrompt(promptPath: string): void {
    const index = this.promptPaths.indexOf(promptPath);
    if (index === -1) {
      return;
    }
    this.pageIndex = Math.floor(index / this.pageSize) + 1;
  }
}
