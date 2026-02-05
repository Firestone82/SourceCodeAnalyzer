import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {catchError, finalize, forkJoin, of} from 'rxjs';

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
import {NzTreeNodeOptions, NzTreeNodeKey} from 'ng-zorro-antd/core/tree';

import {PromptsApiService} from '../../service/api/types/prompts-api.service';
import {PromptContentResponseDto, PromptNamesResponseDto} from '../../service/api/api.models';
import {SourcesApiService} from '../../service/api/types/sources-api.service';
import {SourcePathsResponseDto} from '../../service/api/api.models';
import {SyntaxHighlighterService} from '../../service/syntax-highlighting.service';
import {PromptReviewModalComponent} from '../../components/prompt-review-modal/prompt-review-modal.component';

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
    PromptReviewModalComponent
  ],
  templateUrl: './prompts-list.component.html',
})
export class PromptsListComponent implements OnInit {
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
  public pageIndex: number = 1;
  public pageSize: number = 12;

  public isReviewModalVisible: boolean = false;
  public sourcePaths: string[] = [];
  public sourceTreeNodes: NzTreeNodeOptions[] = [];
  public selectedSourceKeys: NzTreeNodeKey[] = [];
  public selectedSourceLeafKeys: string[] = [];
  public isSourceOptionsLoading: boolean = false;
  public reviewModel: string = '';
  public isSubmittingReview: boolean = false;
  public reviewSubmitError: string | null = null;
  private sourceTreeLeafMap: Map<string, string[]> = new Map();

  public constructor(
    private readonly promptsApiService: PromptsApiService,
    private readonly sourcesApiService: SourcesApiService,
    private readonly activatedRoute: ActivatedRoute,
    private readonly router: Router,
    private readonly syntaxHighlighterService: SyntaxHighlighterService,
    private readonly domSanitizer: DomSanitizer,
    private readonly nzMessageService: NzMessageService
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
        this.content = response.content.trim();

        if (this.isMarkdownView) {
          this.renderMarkdownContent();
        }
      });
  }

  public togglePromptView(): void {
    this.isMarkdownView = !this.isMarkdownView;
    if (this.isMarkdownView) {
      this.renderMarkdownContent();
    }
  }

  private renderMarkdownContent(): void {
    if (!this.isMarkdownView) {
      return;
    }

    if (!this.content.trim()) {
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
      return;
    }

    this.isReviewModalVisible = true;
    this.reviewSubmitError = null;
    this.selectedSourceKeys = [];
    this.selectedSourceLeafKeys = [];
    if (this.sourcePaths.length === 0) {
      this.loadSourcePaths();
    }
  }

  public closeReviewModal(): void {
    this.isReviewModalVisible = false;
  }

  public onSourceKeysChange(keys: NzTreeNodeKey[]): void {
    this.selectedSourceKeys = keys;
    this.selectedSourceLeafKeys = this.expandSourceKeys(keys);
  }

  public get canSubmitBulkReview(): boolean {
    return Boolean(
      this.selectedPromptPath
      && this.reviewModel.trim()
      && this.selectedSourceLeafKeys.length > 0
      && !this.isSubmittingReview
      && !this.isSourceOptionsLoading
    );
  }

  public submitBulkReview(): void {
    if (!this.selectedPromptPath || !this.canSubmitBulkReview) {
      return;
    }

    const selectedSources = this.selectedSourceLeafKeys;
    if (selectedSources.length === 0) {
      return;
    }

    this.isSubmittingReview = true;
    this.reviewSubmitError = null;

    const requests = selectedSources.map((sourcePath: string) => (
      this.sourcesApiService
        .analyzeSource(sourcePath, {
          model: this.reviewModel.trim(),
          prompt_path: this.selectedPromptPath!
        })
        .pipe(catchError(() => of(null)))
    ));

    forkJoin(requests)
      .pipe(
        finalize(() => {
          this.isSubmittingReview = false;
        })
      )
      .subscribe((responses) => {
        const successCount = responses.filter(Boolean).length;
        if (successCount === 0) {
          this.reviewSubmitError = 'Failed to submit reviews.';
          return;
        }

        this.nzMessageService.success(`Queued ${successCount} review(s).`);
        if (successCount < selectedSources.length) {
          this.nzMessageService.warning('Some reviews failed to queue.');
        }
        this.closeReviewModal();
      });
  }

  private loadSourcePaths(): void {
    this.isSourceOptionsLoading = true;

    this.sourcesApiService
      .getSourcePaths()
      .pipe(
        catchError(() => {
          this.reviewSubmitError = 'Failed to load sources.';
          return of<SourcePathsResponseDto>({source_paths: []});
        }),
        finalize(() => {
          this.isSourceOptionsLoading = false;
        })
      )
      .subscribe((response: SourcePathsResponseDto) => {
        this.sourcePaths = response.source_paths;
        this.sourceTreeNodes = this.buildSourceTreeNodes(this.sourcePaths);
        this.sourceTreeLeafMap = this.buildSourceTreeLeafMap(this.sourcePaths);
      });
  }

  private buildSourceTreeNodes(sourcePaths: string[]): NzTreeNodeOptions[] {
    type SourceTreeEntry = {children: Map<string, SourceTreeEntry>; path: string};
    const root: SourceTreeEntry = {children: new Map(), path: ''};

    for (const sourcePath of sourcePaths) {
      const parts = sourcePath.split('/').filter(Boolean);
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

    const buildNodes = (node: SourceTreeEntry): NzTreeNodeOptions[] => {
      return Array.from(node.children.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, child]) => {
          const children = buildNodes(child);
          const isLeaf = children.length === 0;
          return {
            title: name,
            key: child.path,
            children,
            isLeaf
          };
        });
    };

    return buildNodes(root);
  }

  private buildSourceTreeLeafMap(sourcePaths: string[]): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const sourcePath of sourcePaths) {
      const parts = sourcePath.split('/').filter(Boolean);
      let currentPath = '';
      for (const part of parts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const existing = map.get(currentPath) ?? [];
        existing.push(sourcePath);
        map.set(currentPath, existing);
      }
    }
    return map;
  }

  private expandSourceKeys(keys: NzTreeNodeKey[]): string[] {
    const expandedKeys = new Set<string>();
    for (const key of keys) {
      if (typeof key !== 'string') {
        continue;
      }
      const leafKeys = this.sourceTreeLeafMap.get(key);
      if (!leafKeys) {
        continue;
      }
      for (const leafKey of leafKeys) {
        expandedKeys.add(leafKey);
      }
    }
    return Array.from(expandedKeys);
  }

  private updatePageForPrompt(promptPath: string): void {
    const index = this.promptPaths.indexOf(promptPath);
    if (index === -1) {
      return;
    }
    this.pageIndex = Math.floor(index / this.pageSize) + 1;
  }
}
