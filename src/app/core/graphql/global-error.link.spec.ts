import { Injector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ApolloLink, execute } from '@apollo/client/link';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { gql } from '@apollo/client';
import type { DocumentNode } from 'graphql';
import { Observable } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { ToastService } from '../../shared/services/toast.service';
import { createGlobalErrorLink } from './global-error.link';

/**
 * Ce link décide, pour chaque erreur GraphQL remontée, si elle mérite un toast
 * global — seulement les deux codes vraiment transverses — ou si elle est déjà
 * prise en charge ailleurs (composant, lien d'auth, synchro de fond en
 * silentError). Se tromper dans un sens spamme l'écran de toasts redondants ;
 * dans l'autre, une panne transverse (droits, service indisponible) ne
 * s'affiche jamais nulle part.
 */
const QUERY: DocumentNode = gql`query Test { test }`;
const SUBSCRIPTION: DocumentNode = gql`subscription TestSub { testSub }`;

function setup() {
  const toast = { error: vi.fn(), warning: vi.fn(), success: vi.fn(), info: vi.fn(), progress: vi.fn() };
  const translate = { instant: (k: string) => k };
  TestBed.configureTestingModule({
    providers: [
      { provide: ToastService, useValue: toast },
      { provide: TranslateService, useValue: translate },
    ],
  });
  return { injector: TestBed.inject(Injector), toast };
}

function declencher(
  injector: Injector,
  error: unknown,
  options: { context?: Record<string, unknown>; query?: DocumentNode } = {},
): void {
  const echoue = new ApolloLink(() => new Observable((observer) => observer.error(error)));
  const link = ApolloLink.from([createGlobalErrorLink(injector), echoue]);
  execute(
    link,
    { query: options.query ?? QUERY, context: options.context ?? {} },
    { client: {} as never },
  ).subscribe({
    next: () => undefined,
    error: () => undefined, // le comportement testé est l'effet de bord (toast/log), pas la propagation
  });
}

function combinedError(messages: Array<{ message: string; code?: string }>): CombinedGraphQLErrors {
  return new CombinedGraphQLErrors({
    errors: messages.map((m) => ({ message: m.message, extensions: m.code ? { code: m.code } : undefined })),
  } as never);
}

describe('createGlobalErrorLink', () => {
  it('ignore une erreur qui n’est pas une CombinedGraphQLErrors (erreur réseau)', () => {
    const { injector, toast } = setup();
    declencher(injector, new Error('Failed to fetch'));
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('n’affiche rien quand l’opération est marquée silentError, même sur un code transverse', () => {
    const { injector, toast } = setup();
    declencher(injector, combinedError([{ message: 'x', code: 'PERMISSION_DENIED' }]), {
      context: { silentError: true },
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('n’affiche rien pour une subscription (synchro de fond, gérée par le composant)', () => {
    const { injector, toast } = setup();
    declencher(injector, combinedError([{ message: 'x', code: 'PERMISSION_DENIED' }]), {
      query: SUBSCRIPTION,
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it.each(['UNAUTHENTICATED', 'NOT_FOUND', 'INVALID_ARGUMENT', 'ALREADY_EXISTS'])(
    'ne montre pas de toast pour %s — déjà pris en charge par le composant',
    (code) => {
      const { injector, toast } = setup();
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      declencher(injector, combinedError([{ message: 'x', code }]));
      expect(toast.error).not.toHaveBeenCalled();
      expect(toast.warning).not.toHaveBeenCalled();
      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    },
  );

  it('PERMISSION_DENIED affiche un toast d’erreur traduit', () => {
    const { injector, toast } = setup();
    declencher(injector, combinedError([{ message: 'x', code: 'PERMISSION_DENIED' }]));
    expect(toast.error).toHaveBeenCalledWith('ERRORS.PERMISSION_DENIED');
  });

  it('SERVICE_UNAVAILABLE affiche un toast d’avertissement traduit', () => {
    const { injector, toast } = setup();
    declencher(injector, combinedError([{ message: 'x', code: 'SERVICE_UNAVAILABLE' }]));
    expect(toast.warning).toHaveBeenCalledWith('ERRORS.SERVICE_UNAVAILABLE');
  });

  it('un code inconnu (ni composant ni transverse) est journalisé, sans toast', () => {
    const { injector, toast } = setup();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    declencher(injector, combinedError([{ message: 'Erreur inattendue', code: 'INTERNAL_ERROR' }]));
    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });

  it('une erreur sans code d’extension retombe sur UNKNOWN et est journalisée', () => {
    const { injector, toast } = setup();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    declencher(injector, combinedError([{ message: 'x' }]));
    expect(toast.error).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });

  it('traite chaque erreur de la réponse indépendamment', () => {
    const { injector, toast } = setup();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    declencher(injector, combinedError([
      { message: 'géré par le composant', code: 'NOT_FOUND' },
      { message: 'accès refusé', code: 'PERMISSION_DENIED' },
    ]));
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith('ERRORS.PERMISSION_DENIED');
    expect(consoleSpy).not.toHaveBeenCalled(); // NOT_FOUND est silencieux, pas journalisé
    consoleSpy.mockRestore();
  });
});
