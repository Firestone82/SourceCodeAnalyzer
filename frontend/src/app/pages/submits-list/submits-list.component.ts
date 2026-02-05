import {Component, OnInit} from '@angular/core';
import {RouterLink} from '@angular/router';
import {DatePipe} from '@angular/common';
import {NzTableModule} from 'ng-zorro-antd/table';
import {NzButtonModule} from 'ng-zorro-antd/button';
import {NzTagModule} from 'ng-zorro-antd/tag';
import {SubmitsApiService} from '../../service/api/submits-api.service';
import {SubmitListItemDto} from '../../service/api/submits-api.models';
import {catchError, finalize, of} from 'rxjs';
import {NzCardComponent} from 'ng-zorro-antd/card';

@Component({
  selector: 'app-submits-list',
  standalone: true,
  imports: [DatePipe, RouterLink, NzTableModule, NzButtonModule, NzTagModule, NzCardComponent],
  templateUrl: './submits-list.component.html',
})
export class SubmitsListComponent implements OnInit {
  submits: SubmitListItemDto[] = [];
  isLoading: boolean = false;
  errorMessage: string | null = null;

  public constructor(private readonly submitsApiService: SubmitsApiService) {
  }

  public ngOnInit(): void {
    this.isLoading = true;

    this.submitsApiService
      .getSubmits()
      .pipe(
        catchError(() => {
          this.errorMessage = 'Failed to load submits.';
          return of<SubmitListItemDto[]>([]);
        }),
        finalize(() => {
          this.isLoading = false;
        })
      )
      .subscribe((submits: SubmitListItemDto[]) => {
        this.submits = submits;
      });
  }
}
