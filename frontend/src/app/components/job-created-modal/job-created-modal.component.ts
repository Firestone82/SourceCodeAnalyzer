import {Component, EventEmitter, Input, Output} from '@angular/core';
import {RouterLink} from '@angular/router';
import {NzButtonModule} from 'ng-zorro-antd/button';
import {NzModalModule} from 'ng-zorro-antd/modal';
import {NzSpinModule} from 'ng-zorro-antd/spin';
import {NzTagModule} from 'ng-zorro-antd/tag';

@Component({
  selector: 'app-job-created-modal',
  standalone: true,
  imports: [
    RouterLink,
    NzButtonModule,
    NzModalModule,
    NzSpinModule,
    NzTagModule
  ],
  templateUrl: './job-created-modal.component.html'
})
export class JobCreatedModalComponent {
  @Input() public isVisible: boolean = false;
  @Output() public readonly isVisibleChange = new EventEmitter<boolean>();
  @Input() public jobIds: string[] = [];

  public closeModal(): void {
    this.isVisibleChange.emit(false);
  }
}
