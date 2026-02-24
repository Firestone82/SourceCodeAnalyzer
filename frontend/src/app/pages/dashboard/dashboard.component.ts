import {Component, OnInit} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {DatePipe, DecimalPipe} from '@angular/common';
import {RouterLink} from '@angular/router';
import {NzCardModule} from 'ng-zorro-antd/card';
import {NzTableModule} from 'ng-zorro-antd/table';
import {NzInputModule} from 'ng-zorro-antd/input';
import {NzButtonModule} from 'ng-zorro-antd/button';
import {NzSpinModule} from 'ng-zorro-antd/spin';
import {NzProgressModule} from 'ng-zorro-antd/progress';
import {
  DashboardPromptModelStatDto,
  DashboardPromptPerformanceDto,
  DashboardRaterStatDto,
  DashboardRatingEventDto,
  DashboardSourceRatingTrendDto,
  DashboardStatsResponseDto
} from '../../service/api/api.models';
import {DashboardApiService} from '../../service/api/types/dashboard-api.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [
    FormsModule,
    DatePipe,
    DecimalPipe,
    RouterLink,
    NzCardModule,
    NzTableModule,
    NzInputModule,
    NzButtonModule,
    NzSpinModule,
    NzProgressModule
  ],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css'
})
export class DashboardComponent implements OnInit {
  public isLoading: boolean = false;
  public sourceFilter: string = '';
  public promptFilter: string = '';
  public modelFilter: string = '';

  public raters: DashboardRaterStatDto[] = [];
  public ratingEvents: DashboardRatingEventDto[] = [];
  public promptModelStats: DashboardPromptModelStatDto[] = [];
  public sourceRatingTrends: DashboardSourceRatingTrendDto[] = [];
  public promptPerformance: DashboardPromptPerformanceDto[] = [];

  public constructor(private readonly dashboardApiService: DashboardApiService) {
  }

  public ngOnInit(): void {
    this.loadStats();
  }

  public loadStats(): void {
    this.isLoading = true;
    this.dashboardApiService.getStats(this.sourceFilter, this.promptFilter, this.modelFilter).subscribe({
      next: (response: DashboardStatsResponseDto) => {
        this.raters = response.raters;
        this.ratingEvents = response.rating_events;
        this.promptModelStats = response.prompt_model_stats;
        this.sourceRatingTrends = response.source_rating_trends;
        this.promptPerformance = response.prompt_performance;
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
      }
    });
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

  public sourceTrendAverage(row: DashboardSourceRatingTrendDto): number | null {
    if (row.avg_relevance_rating == null || row.avg_quality_rating == null) {
      return null;
    }

    return (row.avg_relevance_rating + row.avg_quality_rating) / 2;
  }
}
