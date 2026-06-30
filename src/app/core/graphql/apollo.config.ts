import { inject, Injector } from '@angular/core';
import { ApolloClient, InMemoryCache } from '@apollo/client/core';
import { ApolloLink } from '@apollo/client/link';
import { provideApollo } from 'apollo-angular';
import { HttpLink } from 'apollo-angular/http';
import { environment } from '../../../environments/environment';
import { createAuthErrorLink } from './auth-error.link';

function apolloOptionsFactory(): ApolloClient.Options {
  const httpLink = inject(HttpLink);
  // Injector, not AuthService directly: AuthService depends on Apollo,
  // which is itself constructed from this factory's result — injecting
  // AuthService eagerly here would be a circular dependency. The error
  // link resolves it lazily, only once an actual auth error occurs.
  const injector = inject(Injector);

  return {
    link: ApolloLink.from([
      createAuthErrorLink(injector),
      httpLink.create({ uri: environment.graphqlUrl, withCredentials: true }),
    ]),
    cache: new InMemoryCache(),
  };
}

export const apolloProviders = [provideApollo(apolloOptionsFactory)];
