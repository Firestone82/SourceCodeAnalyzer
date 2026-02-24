import {Component, OnDestroy, OnInit} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {Router} from '@angular/router';
import {Subject, takeUntil} from 'rxjs';
import {NzButtonModule} from 'ng-zorro-antd/button';
import {NzCardComponent} from 'ng-zorro-antd/card';
import {NzCheckboxModule} from 'ng-zorro-antd/checkbox';
import {NzInputModule} from 'ng-zorro-antd/input';
import {NzMessageService} from 'ng-zorro-antd/message';
import {NzModalModule} from 'ng-zorro-antd/modal';
import {NzTableModule} from 'ng-zorro-antd/table';
import {NzTagModule} from 'ng-zorro-antd/tag';

import {RaterDto, RaterUpdateRequestDto} from '../../service/api/api.models';
import {RatersApiService} from '../../service/api/types/raters-api.service';
import {AuthService} from '../../service/auth/auth.service';
import {NzTypographyComponent} from 'ng-zorro-antd/typography';

@Component({
  selector: 'app-raters-list',
  standalone: true,
  imports: [
    FormsModule,
    NzCardComponent,
    NzButtonModule,
    NzModalModule,
    NzTableModule,
    NzInputModule,
    NzCheckboxModule,
    NzTagModule,
    NzTypographyComponent
  ],
  templateUrl: './raters-list.component.html',
  styleUrl: './raters-list.component.css'
})
export class RatersListComponent implements OnInit, OnDestroy {
  public raters: RaterDto[] = [];
  public isLoading: boolean = false;
  public isModalVisible: boolean = false;
  public isSaving: boolean = false;
  public editingRater: RaterDto | null = null;
  public formName: string = '';
  public formKey: string = '';
  public formAdmin: boolean = false;

  private readonly destroy$ = new Subject<void>();

  public constructor(
    private readonly ratersApiService: RatersApiService,
    private readonly authService: AuthService,
    private readonly router: Router,
    private readonly nzMessageService: NzMessageService
  ) {
  }

  public ngOnInit(): void {
    this.authService.rater$
      .pipe(takeUntil(this.destroy$))
      .subscribe((rater) => {
        if (rater && !rater.admin) {
          this.nzMessageService.error('Only admins can access raters page.');
          void this.router.navigate(['/submits']);
        }
      });

    this.loadRaters();
  }

  public ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  public loadRaters(): void {
    this.isLoading = true;
    this.ratersApiService.listRaters().subscribe({
      next: (response) => {
        this.raters = response.items;
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
        this.nzMessageService.error('Failed to load raters.');
      }
    });
  }

  public openCreateModal(): void {
    this.editingRater = null;
    this.formName = '';
    this.formKey = '';
    this.formAdmin = false;
    this.isModalVisible = true;
  }

  public openEditModal(rater: RaterDto): void {
    this.editingRater = rater;
    this.formName = rater.name;
    this.formKey = rater.key ?? '';
    this.formAdmin = rater.admin;
    this.isModalVisible = true;
  }

  public saveRater(): void {
    const name = this.formName.trim();
    const key = this.formKey.trim();

    if (!name) {
      this.nzMessageService.error('Name is required.');
      return;
    }

    if (!this.editingRater && !key) {
      this.nzMessageService.error('Key is required for new rater.');
      return;
    }

    this.isSaving = true;

    if (this.editingRater) {
      const request: RaterUpdateRequestDto = {name, admin: this.formAdmin, key};

      this.ratersApiService.updateRater(this.editingRater.id, request).subscribe({
        next: () => {
          this.nzMessageService.success('Rater updated.');
          this.isSaving = false;
          this.isModalVisible = false;
          this.loadRaters();
        },
        error: () => {
          this.isSaving = false;
          this.nzMessageService.error('Failed to update rater.');
        }
      });
      return;
    }

    this.ratersApiService.createRater({name, key, admin: this.formAdmin}).subscribe({
      next: () => {
        this.nzMessageService.success('Rater created.');
        this.isSaving = false;
        this.isModalVisible = false;
        this.loadRaters();
      },
      error: () => {
        this.isSaving = false;
        this.nzMessageService.error('Failed to create rater.');
      }
    });
  }

  public deleteRater(rater: RaterDto): void {
    this.ratersApiService.deleteRater(rater.id).subscribe({
      next: () => {
        this.nzMessageService.success('Rater deleted.');
        this.loadRaters();
      },
      error: () => {
        this.nzMessageService.error('Failed to delete rater.');
      }
    });
  }

  public formatLastLogin(lastLoginAt?: string | null): string {
    if (!lastLoginAt) {
      return 'Never';
    }

    const date = new Date(lastLoginAt);
    if (Number.isNaN(date.getTime())) {
      return 'Unknown';
    }

    return date.toLocaleString();
  }
}
