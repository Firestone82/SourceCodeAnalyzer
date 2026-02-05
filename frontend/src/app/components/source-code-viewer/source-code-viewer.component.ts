import {Component, EventEmitter, Input, OnChanges, Output, SimpleChanges} from '@angular/core';
import {NgFor, NgIf} from '@angular/common';
import {FormsModule} from '@angular/forms';

import {NzCardModule} from 'ng-zorro-antd/card';
import {NzRateModule} from 'ng-zorro-antd/rate';
import {NzTagModule} from 'ng-zorro-antd/tag';
import {NzTypographyModule} from 'ng-zorro-antd/typography';

import {IssueDto} from '../../api/submits-api.models';

interface LineViewModel {
  lineNumber: number;
  text: string;
  issues: IssueDto[];
}

@Component({
  selector: 'app-file-viewer',
  standalone: true,
  imports: [NgIf, NgFor, FormsModule, NzCardModule, NzRateModule, NzTagModule, NzTypographyModule],
  templateUrl: 'source-code-viewer.component.html',
  styleUrl: 'source-code-viewer.component.css',
})
export class SourceCodeViewerComponent implements OnChanges {
  @Input({required: true}) public fileName: string = '';
  @Input({required: true}) public fileContent: string = '';
  @Input({required: true}) public issues: IssueDto[] = [];

  @Output() public rate: EventEmitter<{ issue: IssueDto; rating: number }> = new EventEmitter();

  public lines: LineViewModel[] = [];

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['fileContent'] || changes['issues']) {
      this.buildLines();
    }
  }

  public onRatingChange(issue: IssueDto, newValue: number): void {
    const normalized: number = Math.max(0, Math.min(10, Math.round(Number(newValue))));
    this.rate.emit({issue, rating: normalized});
  }

  public severityColor(severity: string): string {
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

    const viewModels: LineViewModel[] = [];
    for (let index: number = 0; index < contentLines.length; index++) {
      const lineNumber: number = index + 1;
      viewModels.push({
        lineNumber,
        text: contentLines[index],
        issues: issuesByLine.get(lineNumber) ?? []
      });
    }

    this.lines = viewModels;
  }
}
