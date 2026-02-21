import {Component, EventEmitter, Input, OnChanges, Output, SimpleChanges} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {DatePipe} from '@angular/common';

import {NzCardModule} from 'ng-zorro-antd/card';
import {NzRateModule} from 'ng-zorro-antd/rate';
import {NzTagModule} from 'ng-zorro-antd/tag';
import {NzTypographyModule} from 'ng-zorro-antd/typography';

import {IssueDto, SourceCommentDto} from '../../service/api/api.models';
import {DomSanitizer, SafeHtml} from '@angular/platform-browser';
import {SyntaxHighlighterService} from '../../service/syntax-highlighting.service';

interface LineViewModel {
  lineNumber: number;
  text: string;
  issues: IssueDto[];
  comments: SourceCommentDto[];
  highlightedHtml?: SafeHtml;
}

@Component({
  selector: 'app-file-viewer',
  standalone: true,
  imports: [FormsModule, DatePipe, NzCardModule, NzRateModule, NzTagModule, NzTypographyModule],
  templateUrl: 'source-code-viewer.component.html',
  styleUrl: 'source-code-viewer.component.css',
})
export class SourceCodeViewerComponent implements OnChanges {
  @Input({required: true}) public fileName: string = '';
  @Input({required: true}) public fileContent: string = '';
  @Input({required: true}) public issues: IssueDto[] = [];
  @Input() public fileComments: SourceCommentDto[] = [];

  @Output() public rate: EventEmitter<{ issue: IssueDto; criterion: 'relevance' | 'quality'; rating: number }> = new EventEmitter();

  public lines: LineViewModel[] = [];

  public constructor(
    private readonly syntaxHighlightService: SyntaxHighlighterService,
    private readonly domSanitizer: DomSanitizer
  ) {
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['fileContent'] || changes['fileComments']) {
      this.buildLines();
    }
  }

  public onRatingChange(issue: IssueDto, criterion: 'relevance' | 'quality', newValue: number): void {
    const normalized: number = Math.max(1, Math.min(10, Math.round(Number(newValue) * 2)));
    this.rate.emit({issue, criterion, rating: normalized});
  }

  public severityColor(severity: string): string {
    if (severity === 'critical') {
      return 'darkred';
    }

    if (severity === 'high') {
      return 'red';
    }

    if (severity === 'medium') {
      return 'orange';
    }

    return 'blue';
  }

  private buildLines(): void {
    const contentLines: string[] = (this.fileContent || '').split('\n');
    const issuesByLine: Map<number, IssueDto[]> = new Map<number, IssueDto[]>();

    for (const issue of this.issues || []) {
      const current: IssueDto[] = issuesByLine.get(issue.line) ?? [];
      current.push(issue);
      issuesByLine.set(issue.line, current);
    }

    const commentsByLine: Map<number, SourceCommentDto[]> = new Map<number, SourceCommentDto[]>();
    for (const comment of this.fileComments || []) {
      if (!comment.source || comment.source !== this.fileName || comment.line == null) {
        continue;
      }
      const current = commentsByLine.get(comment.line) ?? [];
      current.push(comment);
      commentsByLine.set(comment.line, current);
    }

    const lines: LineViewModel[] = [];
    for (let index: number = 0; index < contentLines.length; index++) {
      const lineNumber: number = index + 1;

      lines.push({
        lineNumber,
        text: contentLines[index],
        issues: issuesByLine.get(lineNumber) ?? [],
        comments: commentsByLine.get(lineNumber) ?? [],
        highlightedHtml: undefined,
      });
    }

    for (const line of lines) {
      this.syntaxHighlightService
        .codeToHtml(line.text, 'c')
        .then((highlighted: string) => {
          line.highlightedHtml = this.domSanitizer.bypassSecurityTrustHtml(highlighted);
        });
    }

    this.lines = lines;
  }
}
