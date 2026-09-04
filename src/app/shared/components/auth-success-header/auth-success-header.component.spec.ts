import { TestBed } from '@angular/core/testing';
import { AuthSuccessHeaderComponent } from './auth-success-header.component';

describe('AuthSuccessHeaderComponent', () => {
  function setup(title: string) {
    TestBed.configureTestingModule({ imports: [AuthSuccessHeaderComponent] });
    const fixture = TestBed.createComponent(AuthSuccessHeaderComponent);
    fixture.componentRef.setInput('title', title);
    fixture.detectChanges();
    return { racine: fixture.nativeElement as HTMLElement };
  }

  it('affiche le titre dans un h2 avec l’icône de succès', () => {
    const { racine } = setup('Compte activé');
    expect(racine.querySelector('h2')?.textContent).toBe('Compte activé');
    expect(racine.querySelector('svg')).toBeTruthy();
  });

  it('reflète un autre titre', () => {
    const { racine } = setup('Mot de passe modifié');
    expect(racine.querySelector('h2')?.textContent).toBe('Mot de passe modifié');
  });
});
