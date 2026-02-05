import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, RouterLink} from '@angular/router';
import {forkJoin} from 'rxjs';
import {DatePipe} from '@angular/common';

import {NzLayoutModule} from 'ng-zorro-antd/layout';
import {NzMenuModule} from 'ng-zorro-antd/menu';
import {NzBadgeModule} from 'ng-zorro-antd/badge';
import {NzTypographyModule} from 'ng-zorro-antd/typography';
import {NzSpinModule} from 'ng-zorro-antd/spin';
import {NzMessageService} from 'ng-zorro-antd/message';
import {SubmitsApiService} from '../../service/api/types/submits-api.service';
import {IssueDto, SubmitDetailsDto, SubmitDto} from '../../service/api/api.models';
import {SourceCodeViewerComponent} from '../../components/source-code-viewer/source-code-viewer.component';
import {NzCardComponent} from 'ng-zorro-antd/card';
import {NzButtonComponent} from 'ng-zorro-antd/button';

@Component({
  selector: 'app-submit-detail',
  standalone: true,
  imports: [
    NzLayoutModule,
    NzMenuModule,
    NzBadgeModule,
    NzTypographyModule,
    NzSpinModule,
    SourceCodeViewerComponent,
    NzCardComponent,
    DatePipe,
    NzButtonComponent,
    RouterLink
  ],
  templateUrl: './submit-detail.component.html',
  styleUrl: './submit-detail.component.css'
})
export class SubmitDetailComponent implements OnInit {
  public isLoading: boolean = false;

  public submit: SubmitDto | null = null;
  public submitDetails: SubmitDetailsDto | null = null;

  public fileNames: string[] = [];
  public selectedFileName: string | null = null;

  public remainingIssuesByFile: Record<string, number> = {};

  public constructor(
    private readonly activatedRoute: ActivatedRoute,
    private readonly submitsApiService: SubmitsApiService,
    private readonly nzMessageService: NzMessageService
  ) {
  }

  public get issuesBySelectedFile(): IssueDto[] {
    if (!this.submitDetails || !this.selectedFileName) {
      return [];
    }
    return this.submitDetails.issues.filter((issue: IssueDto) => issue.file === this.selectedFileName);
  }

  public ngOnInit(): void {
    const submitId: number = Number(this.activatedRoute.snapshot.paramMap.get('submitId'));
    if (!Number.isFinite(submitId)) {
      return;
    }

    this.isLoading = true;

    forkJoin({
      submit: this.submitsApiService.getSubmit(submitId),
      details: this.submitsApiService.getSubmitDetails(submitId)
    }).subscribe({
      next: ({submit, details}: { submit: SubmitDto; details: SubmitDetailsDto }) => {
        this.submit = submit;
        this.submitDetails = details;

        this.fileNames = Object.keys(submit.files || {}).sort((left: string, right: string) => left.localeCompare(right));
        this.selectedFileName = this.fileNames.length > 0 ? this.fileNames[0] : null;

        this.recalculateRemainingIssues();
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
      }
    });
  }

  public selectFile(fileName: string): void {
    this.selectedFileName = fileName;
  }

  public handleRate(issue: IssueDto, rating: number): void {
    const previousRating: number | null = issue.rating;

    issue.rating = rating;

    this.submitsApiService.rateIssue(issue.id, rating).subscribe({
      next: () => {
        if (previousRating === null) {
          this.recalculateRemainingIssues();
        }
      },
      error: () => {
        issue.rating = previousRating;
        this.nzMessageService.error('Failed to save rating.');
      }
    });
  }

  private recalculateRemainingIssues(): void {
    const remaining: Record<string, number> = {};
    if (!this.submitDetails) {
      this.remainingIssuesByFile = remaining;
      return;
    }

    for (const issue of this.submitDetails.issues) {
      if (!remaining[issue.file]) {
        remaining[issue.file] = 0;
      }
      if (issue.rating === null) {
        remaining[issue.file] += 1;
      }
    }

    this.remainingIssuesByFile = remaining;
  }
}
