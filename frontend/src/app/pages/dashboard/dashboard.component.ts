import {Component, OnDestroy, OnInit} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {DecimalPipe} from '@angular/common';
import {RouterLink} from '@angular/router';
import {Subject, debounceTime, takeUntil} from 'rxjs';
import {NzCardModule} from 'ng-zorro-antd/card';
import {NzTableModule} from 'ng-zorro-antd/table';
import {NzInputModule} from 'ng-zorro-antd/input';
import {NzButtonModule} from 'ng-zorro-antd/button';
import {NzSpinModule} from 'ng-zorro-antd/spin';
import {NzProgressModule} from 'ng-zorro-antd/progress';
import {NzIconModule} from 'ng-zorro-antd/icon';
import {
  DashboardPromptModelStatDto,
  DashboardPromptPerformanceDto,
  DashboardRaterStatDto,
  DashboardRatingEventDto,
  DashboardStatsResponseDto
} from '../../service/api/api.models';
import {DashboardApiService} from '../../service/api/types/dashboard-api.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    FormsModule,
    DecimalPipe,
    RouterLink,
    NzCardModule,
    NzTableModule,
    NzInputModule,
    NzButtonModule,
    NzSpinModule,
    NzProgressModule,
    NzIconModule
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit, OnDestroy {
  public isLoading: boolean = false;
  public sourceFilter: string = '';
  public promptFilter: string = '';
  public modelFilter: string = '';
  public raterFilter: string = '';
  public submitFilter: string = '';

  public debouncedSourceFilter: string = '';
  public debouncedPromptFilter: string = '';
  public debouncedModelFilter: string = '';
  public debouncedRaterFilter: string = '';
  public debouncedSubmitFilter: string = '';

  public raters: DashboardRaterStatDto[] = [];
  public ratingEvents: DashboardRatingEventDto[] = [];
  public promptModelStats: DashboardPromptModelStatDto[] = [];
  public promptPerformance: DashboardPromptPerformanceDto[] = [];

  private readonly destroy$ = new Subject<void>();
  private readonly ratingFiltersChanged$ = new Subject<void>();

  public constructor(private readonly dashboardApiService: DashboardApiService) {
  }

  public ngOnInit(): void {
    this.ratingFiltersChanged$
      .pipe(debounceTime(300), takeUntil(this.destroy$))
      .subscribe(() => this.applyDebouncedFilters());

    this.loadStats();
  }

  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  public loadStats(): void {
    this.isLoading = true;
    this.dashboardApiService.getStats(null, null, null).subscribe({
      next: (response: DashboardStatsResponseDto) => {
        this.raters = response.raters;
        this.ratingEvents = response.rating_events;
        this.promptModelStats = response.prompt_model_stats;
        this.promptPerformance = response.prompt_performance;
        this.applyDebouncedFilters();
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
      }
    });
  }

  public onRatingFiltersChanged(): void {
    this.ratingFiltersChanged$.next();
  }

  public resetRatingFilters(): void {
    this.sourceFilter = '';
    this.promptFilter = '';
    this.modelFilter = '';
    this.raterFilter = '';
    this.submitFilter = '';
    this.applyDebouncedFilters();
  }

  public get bestPromptScore(): number {
    const scores: number[] = this.promptPerformance
      .map((item) => item.complex_rating ?? 0)
      .filter((value) => value > 0);
    return scores.length === 0 ? 0 : Math.max(...scores);
  }

  public promptBarPercent(score: number | null): number {
    if (!score || this.bestPromptScore === 0) {
      return 0;
    }
    return Math.round((score / this.bestPromptScore) * 100);
  }

  public get filteredRatingEvents(): DashboardRatingEventDto[] {
    const sourceFilter = this.debouncedSourceFilter.trim().toLowerCase();
    const promptFilter = this.debouncedPromptFilter.trim().toLowerCase();
    const modelFilter = this.debouncedModelFilter.trim().toLowerCase();
    const raterFilter = this.debouncedRaterFilter.trim().toLowerCase();
    const submitFilter = this.debouncedSubmitFilter.trim();

    return this.ratingEvents.filter((row) => {
      if (sourceFilter && !row.source_path.toLowerCase().includes(sourceFilter)) {
        return false;
      }
      if (promptFilter && !row.prompt_path.toLowerCase().includes(promptFilter)) {
        return false;
      }
      if (modelFilter && !row.model.toLowerCase().includes(modelFilter)) {
        return false;
      }
      if (raterFilter && !row.rater_name.toLowerCase().includes(raterFilter)) {
        return false;
      }
      return !submitFilter || row.submit_id.toString().includes(submitFilter);
    });
  }

  private applyDebouncedFilters(): void {
    this.debouncedSourceFilter = this.sourceFilter;
    this.debouncedPromptFilter = this.promptFilter;
    this.debouncedModelFilter = this.modelFilter;
    this.debouncedRaterFilter = this.raterFilter;
    this.debouncedSubmitFilter = this.submitFilter;
  }
}
