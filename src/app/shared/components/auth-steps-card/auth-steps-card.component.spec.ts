import { TestBed } from '@angular/core/testing';
import { AuthStepsCardComponent, StepDef } from './auth-steps-card.component';

/**
 * Carte de progression par étapes (ex. activation de compte). La règle : une
 * étape est faite si elle est marquée `done` OU si son numéro précède
 * `currentStep` ; elle est active seulement si elle n'est pas déjà `done`.
 */
describe('AuthStepsCardComponent', () => {
  const STEPS: StepDef[] = [
    { label: 'Vérifier le numéro' },
    { label: 'Créer le mot de passe' },
    { label: 'Confirmer' },
  ];

  function setup(steps: StepDef[] = STEPS, currentStep?: number) {
    TestBed.configureTestingModule({ imports: [AuthStepsCardComponent] });
    const fixture = TestBed.createComponent(AuthStepsCardComponent);
    fixture.componentRef.setInput('title', 'Activation du compte');
    fixture.componentRef.setInput('steps', steps);
    if (currentStep !== undefined) fixture.componentRef.setInput('currentStep', currentStep);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, racine: fixture.nativeElement as HTMLElement };
  }

  it('à l’étape 1, seule la première est active et aucune n’est faite', () => {
    const { component } = setup();
    const [e1, e2, e3] = component.resolvedSteps();
    expect(e1).toMatchObject({ isDone: false, isActive: true, stepNum: 1 });
    expect(e2).toMatchObject({ isDone: false, isActive: false, stepNum: 2 });
    expect(e3).toMatchObject({ isDone: false, isActive: false, stepNum: 3 });
  });

  it('à l’étape 2, la première est faite et la deuxième active', () => {
    const { component } = setup(STEPS, 2);
    const [e1, e2, e3] = component.resolvedSteps();
    expect(e1).toMatchObject({ isDone: true, isActive: false });
    expect(e2).toMatchObject({ isDone: false, isActive: true });
    expect(e3).toMatchObject({ isDone: false, isActive: false });
  });

  it('au-delà de la dernière étape, tout est fait et rien n’est actif', () => {
    const { component } = setup(STEPS, 4);
    expect(component.resolvedSteps().every((s) => s.isDone)).toBe(true);
    expect(component.resolvedSteps().every((s) => !s.isActive)).toBe(true);
  });

  it('une étape marquée `done` est faite et jamais active, quel que soit currentStep', () => {
    const stepsAvecActionAdmin: StepDef[] = [
      { label: 'Compte créé par un administrateur', done: true },
      { label: 'Choisir un mot de passe' },
    ];
    // currentStep = 2 pour que la deuxième étape (celle qui reste à faire)
    // devienne active — cohérent avec un appelant qui saute l'étape déjà faite.
    const { component } = setup(stepsAvecActionAdmin, 2);
    const [e1, e2] = component.resolvedSteps();
    expect(e1).toMatchObject({ isDone: true, isActive: false });
    expect(e2).toMatchObject({ isDone: false, isActive: true });
  });

  it("currentStep pointant sur une étape déjà `done` ne rend personne actif", () => {
    // `isActive` exige `!step.done` : currentStep=1 sur une étape déjà faite ne
    // rattrape pas l'étape suivante automatiquement — c'est à l'appelant de
    // pointer currentStep sur la bonne étape restante.
    const stepsAvecActionAdmin: StepDef[] = [
      { label: 'Compte créé par un administrateur', done: true },
      { label: 'Choisir un mot de passe' },
    ];
    const { component } = setup(stepsAvecActionAdmin, 1);
    expect(component.resolvedSteps().some((s) => s.isActive)).toBe(false);
  });

  it('affiche une coche pour les étapes faites et un numéro pour les autres', () => {
    const { racine } = setup(STEPS, 2);
    const items = [...racine.querySelectorAll('.auth-steps-card__list li')];
    expect(items).toHaveLength(3);
    expect(items[0].querySelector('svg')).toBeTruthy(); // faite → coche
    expect(items[0].textContent).not.toMatch(/^\s*1\s*Vérifier/); // pas de "1" visible
    expect(items[1].querySelector('svg')).toBeNull(); // active → numéro
    expect(items[1].textContent).toContain('2');
  });

  it('affiche le titre de la carte', () => {
    const { racine } = setup();
    expect(racine.querySelector('.auth-steps-card__title')?.textContent).toBe('Activation du compte');
  });

  it('currentStep vaut 1 par défaut sans le préciser', () => {
    const { component } = setup(STEPS);
    expect(component.resolvedSteps()[0].isActive).toBe(true);
  });
});
