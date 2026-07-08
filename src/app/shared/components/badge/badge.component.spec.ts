import { TestBed } from '@angular/core/testing';
import { BadgeComponent } from './badge.component';

describe('BadgeComponent', () => {
  it('renders the label and the tone modifier class', () => {
    const fixture = TestBed.createComponent(BadgeComponent);
    fixture.componentRef.setInput('label', 'Payée');
    fixture.componentRef.setInput('tone', 'success');
    fixture.detectChanges();

    const span = fixture.nativeElement.querySelector('.badge') as HTMLElement;
    expect(span.textContent?.trim()).toBe('Payée');
    expect(span.classList).toContain('badge--success');
  });

  it('defaults to the neutral tone', () => {
    const fixture = TestBed.createComponent(BadgeComponent);
    fixture.componentRef.setInput('label', 'X');
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.badge').classList).toContain('badge--neutral');
  });
});
