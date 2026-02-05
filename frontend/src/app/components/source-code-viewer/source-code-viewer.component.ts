import {Component, EventEmitter, Input, OnChanges, Output, SimpleChanges} from '@angular/core';
import {FormsModule} from '@angular/forms';

import {NzCardModule} from 'ng-zorro-antd/card';
import {NzRateModule} from 'ng-zorro-antd/rate';
import {NzTagModule} from 'ng-zorro-antd/tag';
import {NzTypographyModule} from 'ng-zorro-antd/typography';

import {IssueDto} from '../../service/api/submits-api.models';
import {DomSanitizer, SafeHtml} from '@angular/platform-browser';
import {SyntaxHighlighterService} from '../../service/syntax-highlighting.service';


interface LineViewModel {
  lineNumber: number;
  text: string;
  issues: IssueDto[];
  highlightedHtml?: SafeHtml;
}

@Component({
  selector: 'app-file-viewer',
  standalone: true,
  imports: [FormsModule, NzCardModule, NzRateModule, NzTagModule, NzTypographyModule],
  templateUrl: 'source-code-viewer.component.html',
  styleUrl: 'source-code-viewer.component.css',
})
export class SourceCodeViewerComponent implements OnChanges {
  @Input({required: true}) public fileName: string = '';
  @Input({required: true}) public fileContent: string = '';
  @Input({required: true}) public issues: IssueDto[] = [];

  @Output() public rate: EventEmitter<{ issue: IssueDto; rating: number }> = new EventEmitter();

  public lines: LineViewModel[] = [];

  public constructor(
    private readonly syntaxHighlightService: SyntaxHighlighterService,
    private readonly domSanitizer: DomSanitizer
  ) {
  }

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['fileContent']) {
      this.buildLines();
    }
  }

  public onRatingChange(issue: IssueDto, newValue: number): void {
    const normalized: number = Math.max(0, Math.min(10, Math.round(Number(newValue))));
    this.rate.emit({issue, rating: normalized});
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

    const lines: LineViewModel[] = [];
    for (let index: number = 0; index < contentLines.length; index++) {
      const lineNumber: number = index + 1;


      lines.push({
        lineNumber,
        text: contentLines[index].trim(),
        issues: issuesByLine.get(lineNumber) ?? [],
        highlightedHtml: undefined,
      });
    }

    // Apply late syntax highlighting
    for (const line of lines) {
      this.syntaxHighlightService
        .codeToHtml(line.text, 'c', 'github-light')
        .then((highlighted: string) => {
          line.highlightedHtml = this.domSanitizer.bypassSecurityTrustHtml(highlighted);
        });
    }

    this.lines = lines;
  }
}
