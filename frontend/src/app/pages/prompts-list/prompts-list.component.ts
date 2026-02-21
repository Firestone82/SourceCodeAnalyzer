import {Component, OnDestroy, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {catchError, finalize, of, Subject, takeUntil} from 'rxjs';

import {FormsModule} from '@angular/forms';
import {DomSanitizer, type SafeHtml} from '@angular/platform-browser';
import {NzCardComponent} from 'ng-zorro-antd/card';
import {NzLayoutModule} from 'ng-zorro-antd/layout';
import {NzFormatEmitEvent, NzTreeModule} from 'ng-zorro-antd/tree';
import {NzSpinModule} from 'ng-zorro-antd/spin';
import {NzTypographyModule} from 'ng-zorro-antd/typography';
import {NzButtonModule} from 'ng-zorro-antd/button';
import {NzInputModule} from 'ng-zorro-antd/input';
import {NzModalModule} from 'ng-zorro-antd/modal';
import {NzMessageService} from 'ng-zorro-antd/message';
import {NzSegmentedModule} from 'ng-zorro-antd/segmented';
import {NzTreeNodeOptions} from 'ng-zorro-antd/core/tree';

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
    NzTreeModule,
    NzSpinModule,
    NzTypographyModule,
    NzButtonModule,
    NzSegmentedModule,
    NzInputModule,
    NzModalModule,
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
  public selectedPromptKeys: string[] = [];
  public promptTreeNodes: NzTreeNodeOptions[] = [];
  public content: string = '';
  public renderedContent: SafeHtml | null = null;
  public isMarkdownView: boolean = true;
  public promptViewMode: 'markdown' | 'raw' = 'markdown';
  public promptViewOptions: Array<{ label: string; value: 'markdown' | 'raw' }> = [
    {label: 'Markdown', value: 'markdown'},
    {label: 'Raw', value: 'raw'}
  ];
  public isReviewModalVisible: boolean = false;
  public isEditModalVisible: boolean = false;
  public isJobModalVisible: boolean = false;
  public jobModalIds: string[] = [];
  public isAdmin: boolean = false;
  public editableContent: string = '';
  public isSavingPrompt: boolean = false;
  public isDeletingPrompt: boolean = false;
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
    this.activatedRoute.queryParamMap
      .pipe(takeUntil(this.destroy$))
      .subscribe((queryParams) => {
        const promptPath = queryParams.get('prompt');
        if (promptPath) {
          this.selectPrompt(promptPath);
        }
      });
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

  public handlePromptNodeClick(event: NzFormatEmitEvent): void {
    const node = event.node;
    if (!node) {
      return;
    }

    if (!node.isLeaf) {
      node.isExpanded = !node.isExpanded;
      return;
    }

    const key = node.key?.toString();
    if (!key) {
      return;
    }

    this.selectedPromptKeys = [key];
    this.selectPrompt(key);
  }

  public selectPrompt(promptPath: string): void {
    if (this.selectedPromptPath === promptPath) {
      return;
    }

    this.selectedPromptPath = promptPath;
    this.selectedPromptKeys = [promptPath];
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
        this.editableContent = response.content;

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

  public openReviewModal(): void {
    if (!this.selectedPromptPath) {
      this.nzMessageService.error('Select a prompt before starting a review.');
      return;
    }
    if (!this.isAdmin) {
      this.nzMessageService.error('Only admins can start reviews.');
      return;
    }

    this.isReviewModalVisible = true;
  }

  public openEditModal(): void {
    if (!this.isAdmin || !this.selectedPromptPath) {
      return;
    }

    this.editableContent = this.content;
    this.isEditModalVisible = true;
  }

  public closeEditModal(): void {
    if (this.isSavingPrompt || this.isDeletingPrompt) {
      return;
    }
    this.isEditModalVisible = false;
  }

  public handleReviewsQueued(responses: AnalyzeSourceResponseDto[]): void {
    this.jobModalIds = responses.map((response) => response.job_id);
    this.isJobModalVisible = true;
  }

  public savePromptChanges(): void {
    if (!this.isAdmin || !this.selectedPromptPath || this.isSavingPrompt) {
      return;
    }

    this.isSavingPrompt = true;
    this.promptsApiService
      .updatePromptContent(this.selectedPromptPath, this.editableContent)
      .pipe(finalize(() => {
        this.isSavingPrompt = false;
      }))
      .subscribe({
        next: (response) => {
          this.content = response.content;
          this.editableContent = response.content;
          if (this.isMarkdownView) {
            this.renderMarkdownContent();
          }
          this.nzMessageService.success('Prompt updated.');
          this.isEditModalVisible = false;
        },
        error: () => {
          this.nzMessageService.error('Failed to update prompt.');
        }
      });
  }

  public deletePrompt(): void {
    if (!this.isAdmin || !this.selectedPromptPath || this.isDeletingPrompt) {
      return;
    }

    const promptPath = this.selectedPromptPath;
    this.isDeletingPrompt = true;
    this.promptsApiService
      .deletePrompt(promptPath)
      .pipe(finalize(() => {
        this.isDeletingPrompt = false;
      }))
      .subscribe({
        next: () => {
          this.nzMessageService.success('Prompt deleted.');
          this.selectedPromptPath = null;
          this.selectedPromptKeys = [];
          this.content = '';
          this.editableContent = '';
          this.renderedContent = null;
          this.isEditModalVisible = false;
          this.loadPrompts();
        },
        error: () => {
          this.nzMessageService.error('Failed to delete prompt.');
        }
      });
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
        this.promptTreeNodes = this.buildPromptTreeNodes(this.promptPaths);
        const requestedPrompt: string | null = this.activatedRoute.snapshot.queryParamMap.get('prompt');
        const shouldSelectPrompt: string | null =
          (requestedPrompt && this.promptPaths.includes(requestedPrompt)) ? requestedPrompt : null;
        if (shouldSelectPrompt) {
          this.selectPrompt(shouldSelectPrompt);
        }
      });
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

  private buildPromptTreeNodes(promptPaths: string[]): NzTreeNodeOptions[] {
    type PromptTreeEntry = { children: Map<string, PromptTreeEntry>; path: string };
    const root: PromptTreeEntry = {children: new Map(), path: ''};

    for (const promptPath of promptPaths) {
      const parts = promptPath.split('/').filter(Boolean);
      let current = root;
      let currentPath = '';

      for (const part of parts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        if (!current.children.has(part)) {
          current.children.set(part, {children: new Map(), path: currentPath});
        }
        current = current.children.get(part)!;
      }
    }

    const buildNodes = (node: PromptTreeEntry): NzTreeNodeOptions[] => {
      return Array.from(node.children.entries())
        .sort(([leftName, leftChild], [rightName, rightChild]) => {
          const leftIsLeaf = leftChild.children.size === 0;
          const rightIsLeaf = rightChild.children.size === 0;
          if (leftIsLeaf !== rightIsLeaf) {
            return leftIsLeaf ? 1 : -1;
          }
          return leftName.localeCompare(rightName);
        })
        .map(([name, child]) => {
          const children = buildNodes(child);
          const isLeaf = children.length === 0;
          return {
            title: name,
            key: child.path,
            children,
            isLeaf,
            expanded: name === 'upload'
          };
        });
    };

    return buildNodes(root);
  }
}
