import {Component, OnInit} from '@angular/core';
import {RouterLink} from '@angular/router';
import {DatePipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {NzTableModule} from 'ng-zorro-antd/table';
import {NzButtonModule} from 'ng-zorro-antd/button';
import {NzTagModule} from 'ng-zorro-antd/tag';
import {NzInputModule} from 'ng-zorro-antd/input';
import {NzCheckboxModule} from 'ng-zorro-antd/checkbox';
import {SubmitsApiService} from '../../service/api/submits-api.service';
import {SubmitListItemDto, SubmitListResponseDto} from '../../service/api/submits-api.models';
import {catchError, finalize, of} from 'rxjs';
import {NzCardComponent} from 'ng-zorro-antd/card';

@Component({
  selector: 'app-submits-list',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    NzTableModule,
    NzButtonModule,
    NzTagModule,
    NzInputModule,
    NzCheckboxModule,
    NzCardComponent
  ],
  templateUrl: './submits-list.component.html',
})
export class SubmitsListComponent implements OnInit {
  submits: SubmitListItemDto[] = [];
  isLoading: boolean = false;
  errorMessage: string | null = null;
  pageIndex: number = 1;
  pageSize: number = 20;
  totalSubmits: number = 0;
  onlyUnrated: boolean = true;
  modelFilter: string = '';

  public constructor(private readonly submitsApiService: SubmitsApiService) {
  }

  public ngOnInit(): void {
    this.loadSubmits();
  }

  public applyFilters(): void {
    this.pageIndex = 1;
    this.loadSubmits();
  }

  public onPageIndexChange(pageIndex: number): void {
    this.pageIndex = pageIndex;
    this.loadSubmits();
  }

  public onPageSizeChange(pageSize: number): void {
    this.pageSize = pageSize;
    this.pageIndex = 1;
    this.loadSubmits();
  }

  private loadSubmits(): void {
    this.isLoading = true;

    this.submitsApiService
      .getSubmits(this.pageIndex, this.pageSize, this.onlyUnrated, this.modelFilter)
      .pipe(
        catchError(() => {
          this.errorMessage = 'Failed to load submits.';
          return of<SubmitListResponseDto>({
            items: [],
            total: 0,
            page: this.pageIndex,
            page_size: this.pageSize
          });
        }),
        finalize(() => {
          this.isLoading = false;
        })
      )
      .subscribe((response: SubmitListResponseDto) => {
        this.submits = response.items;
        this.totalSubmits = response.total;
      });
  }
}
