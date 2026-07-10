import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { AuthService } from '../auth/auth.service';

// Le JWT ne doit partir QUE vers notre propre origine (Gateway). Toutes les
// requêtes applicatives sont des chemins relatifs (`/graphql`, `/i18n/…`). On
// exclut donc les URL absolues (`http://…`, `https://…`) et protocol-relative
// (`//host`) : sans cette allowlist, une future requête vers un hôte tiers
// (CDN, avatar distant) exfiltrerait l'access token.
function estSameOrigin(url: string): boolean {
  return url.startsWith('/') && !url.startsWith('//');
}

export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.accessToken();

  if (!token || !estSameOrigin(req.url)) {
    return next(req);
  }

  return next(
    req.clone({
      setHeaders: { Authorization: `Bearer ${token}` },
    }),
  );
};
