import {Component, EventEmitter, Input, Output} from '@angular/core';
import {NzButtonModule} from 'ng-zorro-antd/button';

@Component({
  selector: 'app-submit-footer',
  standalone: true,
  imports: [NzButtonModule],
  templateUrl: './submit-footer.component.html'
})
export class SubmitFooterComponent {
  @Input() public submitLabel: string = 'Submit';
  @Input() public cancelLabel: string = 'Cancel';
  @Input() public isSubmitting: boolean = false;
  @Input() public isDisabled: boolean = false;
  @Output() public readonly cancel = new EventEmitter<void>();
  @Output() public readonly submit = new EventEmitter<void>();

  public handleCancel(): void {
    this.cancel.emit();
  }

  public handleSubmit(): void {
    this.submit.emit();
  }
}
