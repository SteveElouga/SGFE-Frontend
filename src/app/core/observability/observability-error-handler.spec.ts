import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ObservabilityErrorHandler } from './observability-error-handler';
import { environment } from '../../../environments/environment';

const pushError = vi.fn();
const captureException = vi.fn();

vi.mock('@grafana/faro-web-sdk', () => ({
  faro: { api: { pushError } },
}));

vi.mock('@sentry/angular', () => ({
  captureException,
}));

/** Laisse les imports dynamiques (microtâches + résolution de module) se résoudre. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('ObservabilityErrorHandler', () => {
  let handler: ObservabilityErrorHandler;

  beforeEach(() => {
    handler = new ObservabilityErrorHandler();
    pushError.mockClear();
    captureException.mockClear();
    environment.glitchtipDsn = '';
  });

  it('remonte toujours l’erreur à Faro', async () => {
    const err = new Error('boom');
    handler.handleError(err);
    await flush();

    expect(pushError).toHaveBeenCalledWith(err);
  });

  it('convertit une valeur non-Error en Error avant de la remonter', async () => {
    handler.handleError('chaîne brute');
    await flush();

    expect(pushError).toHaveBeenCalledWith(expect.objectContaining({ message: 'chaîne brute' }));
  });

  it('ne remonte JAMAIS à GlitchTip sans DSN configuré', async () => {
    environment.glitchtipDsn = '';
    handler.handleError(new Error('sans DSN'));
    await flush();

    expect(captureException).not.toHaveBeenCalled();
  });

  it('remonte à GlitchTip quand un DSN est configuré', async () => {
    environment.glitchtipDsn = 'https://exemple@glitchtip.local/1';
    const err = new Error('avec DSN');
    handler.handleError(err);
    await flush();

    expect(captureException).toHaveBeenCalledWith(err);
  });
});
