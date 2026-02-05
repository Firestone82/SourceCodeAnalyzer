import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, Router} from '@angular/router';
import {catchError, finalize, of} from 'rxjs';

import {FormsModule} from '@angular/forms';
import {NzCardComponent} from 'ng-zorro-antd/card';
import {NzLayoutModule} from 'ng-zorro-antd/layout';
import {NzMenuModule} from 'ng-zorro-antd/menu';
import {NzSelectModule} from 'ng-zorro-antd/select';
import {NzSpinModule} from 'ng-zorro-antd/spin';
import {NzTypographyModule} from 'ng-zorro-antd/typography';

import {SourcesApiService} from '../../service/api/sources-api.service';
import {SourceFilesResponseDto, SourcePathsResponseDto} from '../../service/api/sources-api.models';
import {SourceCodeViewerComponent} from '../../components/source-code-viewer/source-code-viewer.component';

@Component({
  selector: 'app-sources-list',
  standalone: true,
  imports: [
    FormsModule,
    NzCardComponent,
    NzLayoutModule,
    NzMenuModule,
    NzSelectModule,
    NzSpinModule,
    NzTypographyModule,
    SourceCodeViewerComponent
  ],
  templateUrl: './sources-list.component.html',
})
export class SourcesListComponent implements OnInit {
  public sourcePaths: string[] = [];
  public isLoading: boolean = false;
  public isSourceLoading: boolean = false;
  public errorMessage: string | null = null;
  public sourceErrorMessage: string | null = null;
  public selectedSourcePath: string | null = null;
  public files: Record<string, string> = {};
  public fileNames: string[] = [];
  public selectedFileName: string | null = null;

  public constructor(
    private readonly sourcesApiService: SourcesApiService,
    private readonly activatedRoute: ActivatedRoute,
    private readonly router: Router
  ) {
  }

  public ngOnInit(): void {
    this.loadSources();
  }

  public get selectedFileContent(): string {
    if (!this.selectedFileName) {
      return '';
    }
    return this.files[this.selectedFileName] ?? '';
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
        const requestedSource: string | null = this.activatedRoute.snapshot.queryParamMap.get('source');
        const shouldSelectSource: string | null =
          (requestedSource && this.sourcePaths.includes(requestedSource)) ? requestedSource : null;
        if (shouldSelectSource) {
          this.selectSource(shouldSelectSource);
        } else if (this.sourcePaths.length > 0) {
          this.selectSource(this.sourcePaths[0]);
        }
      });
  }

  public selectSource(sourcePath: string): void {
    if (this.selectedSourcePath === sourcePath) {
      return;
    }

    this.selectedSourcePath = sourcePath;
    this.files = {};
    this.fileNames = [];
    this.selectedFileName = null;
    this.sourceErrorMessage = null;
    this.isSourceLoading = true;
    void this.router.navigate([], {
      queryParams: {source: sourcePath},
      queryParamsHandling: 'merge'
    });

    this.sourcesApiService
      .getSourceFiles(sourcePath)
      .pipe(
        catchError(() => {
          this.sourceErrorMessage = 'Failed to load source files.';
          return of<SourceFilesResponseDto>({source_path: sourcePath, files: {}});
        }),
        finalize(() => {
          this.isSourceLoading = false;
        })
      )
      .subscribe((response: SourceFilesResponseDto) => {
        this.files = response.files;
        this.fileNames = Object.keys(response.files).sort((left, right) => left.localeCompare(right));
        this.selectedFileName = this.fileNames.length > 0 ? this.fileNames[0] : null;
      });
  }
}
