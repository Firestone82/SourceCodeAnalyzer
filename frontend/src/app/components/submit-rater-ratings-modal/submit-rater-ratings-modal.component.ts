import {Component, EventEmitter, Input, OnChanges, Output, SimpleChanges} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {NzModalModule} from 'ng-zorro-antd/modal';
import {NzSelectModule} from 'ng-zorro-antd/select';
import {NzSpinModule} from 'ng-zorro-antd/spin';
import {NzTypographyModule} from 'ng-zorro-antd/typography';

import {SubmitRaterRatingDto} from '../../service/api/api.models';
import {NzCollapseComponent, NzCollapsePanelComponent} from 'ng-zorro-antd/collapse';
import {NzRateComponent} from 'ng-zorro-antd/rate';
import {NzSpaceComponent} from 'ng-zorro-antd/space';
import {NzDividerComponent} from 'ng-zorro-antd/divider';

@Component({
  selector: 'app-submit-rater-ratings-modal',
  standalone: true,
  imports: [NzModalModule, NzSelectModule, NzSpinModule, NzTypographyModule, FormsModule, NzCollapseComponent, NzCollapsePanelComponent, NzRateComponent, NzSpaceComponent, NzDividerComponent],
  templateUrl: './submit-rater-ratings-modal.component.html'
})
export class SubmitRaterRatingsModalComponent implements OnChanges {
  @Input() public isVisible: boolean = false;
  @Input() public isLoading: boolean = false;
  @Input() public ratings: SubmitRaterRatingDto[] = [];
  @Output() public readonly isVisibleChange: EventEmitter<boolean> = new EventEmitter<boolean>();

  public selectedRaterId: number | null = null;

  public ngOnChanges(changes: SimpleChanges): void {
    if (changes['ratings'] && this.ratings.length > 0 && !this.selectedRaterId) {
      this.selectedRaterId = this.ratings[0].rater_id;
    }
  }

  public get selectedRating(): SubmitRaterRatingDto | null {
    if (!this.selectedRaterId) {
      return null;
    }

    return this.ratings.find((rating) => rating.rater_id === this.selectedRaterId) ?? null;
  }

  public closeModal(): void {
    this.isVisibleChange.emit(false);
  }
}
