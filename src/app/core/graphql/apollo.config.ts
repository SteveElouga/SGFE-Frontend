import { ApolloClient, InMemoryCache } from '@apollo/client/core';
import { APOLLO_OPTIONS } from 'apollo-angular';
import { HttpLink } from 'apollo-angular/http';
import { environment } from '../../../environments/environment';

export function apolloFactory(httpLink: HttpLink): ApolloClient.Options {
  return {
    link: httpLink.create({ uri: environment.graphqlUrl, withCredentials: true }),
    cache: new InMemoryCache(),
  };
}

export const apolloProviders = [
  {
    provide: APOLLO_OPTIONS,
    useFactory: apolloFactory,
    deps: [HttpLink],
  },
];
