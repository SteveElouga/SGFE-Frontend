import { TestBed } from '@angular/core/testing';
import { SkeletonComponent } from './skeleton.component';

describe('SkeletonComponent', () => {
  it('applies width/height/radius as inline host styles', () => {
    const fixture = TestBed.createComponent(SkeletonComponent);
    fixture.componentRef.setInput('height', '88px');
    fixture.componentRef.setInput('radius', '14px');
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.style.height).toBe('88px');
    expect(host.style.borderRadius).toBe('14px');
    expect(host.style.width).toBe('100%'); // défaut
  });
});
