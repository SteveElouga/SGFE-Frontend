import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { Apollo } from 'apollo-angular';
import { TranslateService } from '@ngx-translate/core';
import { AuthService } from '../../../core/auth/auth.service';
import { CampagnesService } from '../../../core/campagnes/campagnes.service';
import { FacturesService } from '../../../core/factures/factures.service';
import { DashboardComponent } from './dashboard.component';

describe('DashboardComponent', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        { provide: Apollo, useValue: { query: vi.fn() } },
        { provide: CampagnesService, useValue: {} },
        { provide: FacturesService, useValue: {} },
        { provide: AuthService, useValue: { user: signal(null) } },
        { provide: TranslateService, useValue: { instant: (k: string) => k, currentLang: () => 'fr' } },
      ],
    });
    // Pas de detectChanges → ngOnInit (chargement des données) ne s'exécute pas.
    const fixture = TestBed.createComponent(DashboardComponent);
    return { component: fixture.componentInstance };
  }

  it('should create', () => {
    expect(setup().component).toBeTruthy();
  });

  it('computes the recovery rate from global stats', () => {
    const { component } = setup();
    expect(component.tauxRecouvrement()).toBe('0'); // stats null au départ

    component.stats.set({
      consommationTotaleGlobale: 0,
      montantTotalFactureGlobal: 200000,
      montantTotalEncaisseGlobal: 150000,
    });
    expect(component.tauxRecouvrement()).toBe('75');
  });

  it('localizes the recovery rate to 1 decimal (maquette « 65,8 % »)', () => {
    const { component } = setup();
    component.stats.set({
      consommationTotaleGlobale: 0,
      montantTotalFactureGlobal: 200000,
      montantTotalEncaisseGlobal: 131600,
    });
    expect(component.tauxRecouvrement()).toBe('65,8');
  });

  it('returns 0 when nothing has been invoiced', () => {
    const { component } = setup();
    component.stats.set({
      consommationTotaleGlobale: 0,
      montantTotalFactureGlobal: 0,
      montantTotalEncaisseGlobal: 0,
    });
    expect(component.tauxRecouvrement()).toBe('0');
  });
});
