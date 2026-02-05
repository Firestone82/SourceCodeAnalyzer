import {Component, OnInit} from '@angular/core';
import {RouterLink} from '@angular/router';
import {catchError, finalize, of} from 'rxjs';

import {NzCardComponent} from 'ng-zorro-antd/card';
import {NzTableModule} from 'ng-zorro-antd/table';
import {NzTypographyModule} from 'ng-zorro-antd/typography';

import {SourcesApiService} from '../../service/api/sources-api.service';
import {SourcePathsResponseDto} from '../../service/api/sources-api.models';

@Component({
  selector: 'app-sources-list',
  standalone: true,
  imports: [NzCardComponent, NzTableModule, NzTypographyModule, RouterLink],
  templateUrl: './sources-list.component.html',
})
export class SourcesListComponent implements OnInit {
  public sourcePaths: string[] = [];
  public isLoading: boolean = false;
  public errorMessage: string | null = null;

  public constructor(private readonly sourcesApiService: SourcesApiService) {
  }

  public ngOnInit(): void {
    this.loadSources();
  }

  private loadSources(): void {
    this.isLoading = true;

    this.sourcesApiService
      .getSourcePaths()
      .pipe(
        catchError(() => {
          this.errorMessage = 'Failed to load sources.';
          return of<SourcePathsResponseDto>({source_paths: []});
        }),
        finalize(() => {
          this.isLoading = false;
        })
      )
      .subscribe((response: SourcePathsResponseDto) => {
        this.sourcePaths = response.source_paths;
      });
  }
}
