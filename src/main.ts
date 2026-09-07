import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { environment } from './environments/environment';

// Observabilité, phase 3 (voir artefact "Brancher SGFE sur l'observabilité") :
// import dynamique plutôt qu'un import statique en tête de fichier — Faro +
// OpenTelemetry pèsent ~227 kB, largement au-dessus du budget initial mesuré
// de ce dépôt (680 kB alerte / 800 kB erreur, voir CLAUDE.md) pour une
// fonctionnalité qui n'a aucune raison de bloquer le premier rendu. Ce
// chunk se charge en parallèle du bootstrap, pas avant : les tout premiers
// appels réseau peuvent partir sans trace si Faro n'a pas fini de charger,
// un compromis délibéré plutôt qu'un budget cassé pour de la télémétrie.
async function initTelemetry(): Promise<void> {
  const [{ initializeFaro, getWebInstrumentations }, { TracingInstrumentation }] = await Promise.all([
    import('@grafana/faro-web-sdk'),
    import('@grafana/faro-web-tracing'),
  ]);

  // `url` pointe le récepteur Faro d'Alloy (port 12347, CORS ouvert côté
  // plateforme) — la même plateforme externe que le backend, jamais portée
  // par ce dépôt. Une plateforme éteinte ne bloque rien : les envois
  // échouent en silence, comme tout le reste de l'observabilité du projet.
  initializeFaro({
    url: 'http://localhost:12347/collect',
    app: {
      name: 'sgfe-frontend',
      version: environment.appVersion,
      environment: environment.production ? 'production' : 'dev',
    },
    instrumentations: [
      ...getWebInstrumentations(),
      // `/graphql` est toujours interrogé en chemin relatif, donc
      // same-origin (voir CLAUDE.md § Règle fondamentale) — aucune URL
      // cross-origin à whitelister dans `propagateTraceHeaderCorsUrls`
      // pour que le `traceparent` atteigne la Gateway.
      new TracingInstrumentation(),
    ],
  });
}

void initTelemetry().catch((err) => console.error('Faro indisponible :', err));

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
