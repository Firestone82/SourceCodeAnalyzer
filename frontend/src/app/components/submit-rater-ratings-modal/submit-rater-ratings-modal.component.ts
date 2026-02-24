import {Component, EventEmitter, Input, Output} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {NzModalModule} from 'ng-zorro-antd/modal';
import {NzSpinModule} from 'ng-zorro-antd/spin';
import {NzTypographyModule} from 'ng-zorro-antd/typography';
import {NzTableModule} from 'ng-zorro-antd/table';
import {NzButtonModule} from 'ng-zorro-antd/button';
import {NzRateModule} from 'ng-zorro-antd/rate';

import {SubmitRaterRatingDto} from '../../service/api/api.models';

@Component({
  selector: 'app-submit-rater-ratings-modal',
  standalone: true,
  imports: [FormsModule, NzModalModule, NzSpinModule, NzTypographyModule, NzTableModule, NzButtonModule, NzRateModule],
  templateUrl: './submit-rater-ratings-modal.component.html'
})
export class SubmitRaterRatingsModalComponent {
  @Input() public isVisible: boolean = false;
  @Input() public isLoading: boolean = false;
  @Input() public ratings: SubmitRaterRatingDto[] = [];
  @Output() public readonly isVisibleChange: EventEmitter<boolean> = new EventEmitter<boolean>();

  public expandedRaterIds: number[] = [];

  public closeModal(): void {
    this.isVisibleChange.emit(false);
  }

  public toggleExpanded(raterId: number): void {
    if (this.expandedRaterIds.includes(raterId)) {
      this.expandedRaterIds = this.expandedRaterIds.filter((id) => id !== raterId);
      return;
    }

    this.expandedRaterIds = [...this.expandedRaterIds, raterId];
  }

  public isExpanded(raterId: number): boolean {
    return this.expandedRaterIds.includes(raterId);
  }

  public averageRating(rating: SubmitRaterRatingDto): number | null {
    if (rating.relevance_rating === null || rating.quality_rating === null) {
      return null;
    }

    return (rating.relevance_rating + rating.quality_rating) / 2;
  }
}
