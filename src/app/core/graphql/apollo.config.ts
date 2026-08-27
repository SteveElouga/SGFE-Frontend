import { inject, Injector } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { ApolloClient, InMemoryCache } from '@apollo/client/core';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { getMainDefinition } from '@apollo/client/utilities';
import { ApolloLink } from '@apollo/client/link';
import { provideApollo } from 'apollo-angular';
import { HttpLink } from 'apollo-angular/http';
import { createClient } from 'graphql-ws';
import { environment } from '../../../environments/environment';
import { createAuthErrorLink } from './auth-error.link';
import { createGlobalErrorLink } from './global-error.link';

// Cache partagé (exporté) — l'initializer de persistance le restaure au démarrage
// et le sauvegarde quand l'utilisateur quitte l'app (offline des données).
export const apolloCache = new InMemoryCache({
  typePolicies: {
    Campagne:     { keyFields: ['campagneId'] },
    Releve:       { keyFields: ['releveId'] },
    Progression:  { keyFields: ['campagneId'] },
    DernierIndex: { keyFields: ['abonneId'] },
    // Objets imbriqués sans identifiant unique — stockés inline, pas normalisés
    CampagneAgent: { keyFields: false },
    ReleveAbonne:  { keyFields: false },
  },
});

function apolloOptionsFactory(): ApolloClient.Options {
  const httpLink = inject(HttpLink);
  // Injector, not AuthService directly: AuthService depends on Apollo,
  // which is itself constructed from this factory's result — injecting
  // AuthService eagerly here would be a circular dependency. The error
  // link resolves it lazily, only once an actual auth error occurs.
  const injector = inject(Injector);

  const http = httpLink.create({ uri: environment.graphqlUrl, withCredentials: true });

  const ws = new GraphQLWsLink(
    createClient({
      url: environment.graphqlWsUrl,
      // Evaluated lazily at each connection attempt — safe to use the injector here
      // because GraphQLWsLink only connects when the first subscription is registered
      // (i.e. after login, from ShellComponent.startCacheSync).
      connectionParams: () => {
        const token = injector.get(AuthService).accessToken();
        return token ? { Authorization: `Bearer ${token}` } : {};
      },
    }),
  );

  const transportLink = ApolloLink.split(
    ({ query }) => {
      const def = getMainDefinition(query);
      return def.kind === 'OperationDefinition' && def.operation === 'subscription';
    },
    ws,
    http,
  );

  return {
    link: ApolloLink.from([
      createAuthErrorLink(injector),
      createGlobalErrorLink(injector),
      transportLink,
    ]),
    cache: apolloCache,
    // ── Politique de cache : le cache peint, le réseau tranche ────────────────
    //
    // `cache-first` n'est juste que pour une donnée qui ne peut pas changer dans
    // notre dos. Rien ici n'entre dans cette catégorie : chaque liste est
    // modifiée par d'autres postes, par la clôture d'une campagne, par un cron
    // de relance. Un abonné créé par un collègue n'apparaissait donc jamais —
    // et comme le cache est aussi persisté dans localStorage, une recharge
    // forcée du navigateur ne le corrigeait pas non plus : elle vide la mémoire,
    // pas le stockage local.
    //
    // Ce qu'on veut du cache, c'est l'affichage instantané, pas la réponse
    // faisant foi. `cache-and-network` dit exactement cela : peindre depuis le
    // cache, puis corriger avec le réseau. `nextFetchPolicy` évite de
    // re-solliciter le réseau à chaque re-souscription d'une même requête déjà
    // revalidée dans la session.
    //
    // Pour `query` — un fetch ponctuel, sans flux à corriger après coup —
    // Apollo n'accepte pas `cache-and-network` : il n'aurait personne à qui
    // livrer la seconde valeur. `network-only` est donc son équivalent.
    defaultOptions: {
      watchQuery: { fetchPolicy: 'cache-and-network', nextFetchPolicy: 'cache-first' },
      query:      { fetchPolicy: 'network-only' },
    },
  };
}

export const apolloProviders = [provideApollo(apolloOptionsFactory)];
