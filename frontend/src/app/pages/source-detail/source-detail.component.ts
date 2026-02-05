import {Component, OnInit} from '@angular/core';
import {ActivatedRoute, RouterLink} from '@angular/router';
import {catchError, finalize, of} from 'rxjs';

import {NzBadgeModule} from 'ng-zorro-antd/badge';
import {NzCardComponent} from 'ng-zorro-antd/card';
import {NzLayoutModule} from 'ng-zorro-antd/layout';
import {NzMenuModule} from 'ng-zorro-antd/menu';
import {NzSpinModule} from 'ng-zorro-antd/spin';
import {NzTypographyModule} from 'ng-zorro-antd/typography';
import {NzButtonModule} from 'ng-zorro-antd/button';

import {SourcesApiService} from '../../service/api/types/sources-api.service';
import {SourceFilesResponseDto} from '../../service/api/api.models';
import {SourceCodeViewerComponent} from '../../components/source-code-viewer/source-code-viewer.component';

@Component({
  selector: 'app-source-detail',
  standalone: true,
  imports: [
    NzBadgeModule,
    NzCardComponent,
    NzLayoutModule,
    NzMenuModule,
    NzSpinModule,
    NzTypographyModule,
    NzButtonModule,
    RouterLink,
    SourceCodeViewerComponent
  ],
  templateUrl: './source-detail.component.html',
})
export class SourceDetailComponent implements OnInit {
  public isLoading: boolean = false;
  public errorMessage: string | null = null;

  public sourcePath: string | null = null;
  public files: Record<string, string> = {};
  public fileNames: string[] = [];
  public selectedFileName: string | null = null;

  public constructor(
    private readonly activatedRoute: ActivatedRoute,
    private readonly sourcesApiService: SourcesApiService
  ) {
  }

  public get selectedFileContent(): string {
    if (!this.selectedFileName) {
      return '';
    }
    return this.files[this.selectedFileName] ?? '';
  }

  public ngOnInit(): void {
    const sourcePath: string | null = this.activatedRoute.snapshot.paramMap.get('sourcePath');
    if (!sourcePath) {
      this.errorMessage = 'Source not found.';
      return;
    }

    this.sourcePath = sourcePath;
    this.loadSource(sourcePath);
  }

  public selectFile(fileName: string): void {
    this.selectedFileName = fileName;
  }

  private loadSource(sourcePath: string): void {
    this.isLoading = true;

    this.sourcesApiService
      .getSourceFiles(sourcePath)
      .pipe(
        catchError(() => {
          this.errorMessage = 'Failed to load source files.';
          return of<SourceFilesResponseDto>({source_path: sourcePath, files: {}});
        }),
        finalize(() => {
          this.isLoading = false;
        })
      )
      .subscribe((response: SourceFilesResponseDto) => {
        this.files = response.files;
        this.fileNames = Object.keys(response.files).sort((left, right) => left.localeCompare(right));
        this.selectedFileName = this.fileNames.length > 0 ? this.fileNames[0] : null;
      });
  }
}
