import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { AuthService } from '../../../core/auth/auth.service';
import { User } from '../../../shared/models/user.model';
import { DashboardComponent } from './dashboard.component';

const mockUser: User = {
  id: '1',
  username: 'thierno.d',
  email: 'thierno@aquabill.test',
  phoneNumber: '+225 01 23 45 67 89',
  role: 'ADMIN',
  isActive: true,
  createdAt: '2025-07-01T00:00:00Z',
};

describe('DashboardComponent', () => {
  function setup(user: User | null = mockUser) {
    TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user: signal(user) } },
      ],
    });

    const fixture = TestBed.createComponent(DashboardComponent);
    return { fixture, component: fixture.componentInstance };
  }

  it('should create', () => {
    const { component } = setup();
    expect(component).toBeTruthy();
  });

  it('exposes the authenticated user via the user signal', () => {
    const { component } = setup(mockUser);
    expect(component.user()).toEqual(mockUser);
  });

  it('handles a null user without throwing', () => {
    const { component } = setup(null);
    expect(component.user()).toBeNull();
  });
});
