import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface StepDef {
  label: string;
  /** Mark the step as always-done (e.g. a pre-completed admin action). */
  done?: boolean;
}

@Component({
  selector: 'app-auth-steps-card',
  templateUrl: './auth-steps-card.component.html',
  styleUrl: './auth-steps-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthStepsCardComponent {
  readonly title = input.required<string>();
  readonly steps = input.required<StepDef[]>();
  /** 1-indexed. Steps before currentStep are shown as done. */
  readonly currentStep = input(1);

  readonly resolvedSteps = computed(() =>
    this.steps().map((step, i) => {
      const stepNum = i + 1;
      const isDone = !!step.done || stepNum < this.currentStep();
      const isActive = !step.done && stepNum === this.currentStep();
      return { label: step.label, isDone, isActive, stepNum };
    }),
  );
}
