import { Injectable, inject } from '@angular/core';
import { Apollo } from 'apollo-angular';
import { firstValueFrom } from 'rxjs';
import {
  CREATE_USER,
  DEACTIVATE_USER,
  REACTIVATE_USER,
  RESET_USER_PASSWORD,
  UPDATE_USER,
} from '../../graphql/mutations/users.mutations';
import { GET_USERS } from '../../graphql/queries/users.queries';
import { Role, User } from '../../shared/models/user.model';

export interface CreateUserInput {
  username: string;
  phoneNumber: string;
  role: Role;
  email?: string;
}

export interface UpdateUserInput {
  email?: string;
  role?: Role;
  phoneNumber?: string;
}

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly apollo = inject(Apollo);

  async getUsers(): Promise<User[]> {
    const result = await firstValueFrom(
      this.apollo.query<{ users: User[] }>({
        query: GET_USERS,
      }),
    );
    return result.data?.users ?? [];
  }

  async createUser(input: CreateUserInput): Promise<User> {
    const result = await firstValueFrom(
      this.apollo.mutate<{ createUser: User }>({
        mutation: CREATE_USER,
        variables: input,
      }),
    );
    const user = result.data?.createUser;
    if (!user) throw new Error('Réponse invalide du serveur');
    return user;
  }

  async updateUser(id: string, input: UpdateUserInput): Promise<User> {
    const result = await firstValueFrom(
      this.apollo.mutate<{ updateUser: User }>({
        mutation: UPDATE_USER,
        variables: { id, ...input },
      }),
    );
    const user = result.data?.updateUser;
    if (!user) throw new Error('Réponse invalide du serveur');
    return user;
  }

  async deactivateUser(id: string): Promise<User> {
    const result = await firstValueFrom(
      this.apollo.mutate<{ deactivateUser: User }>({
        mutation: DEACTIVATE_USER,
        variables: { id },
      }),
    );
    const user = result.data?.deactivateUser;
    if (!user) throw new Error('Réponse invalide du serveur');
    return user;
  }

  // PENDING BACKEND: cf. docs/BESOINS_API_utilisateurs.md
  async reactivateUser(id: string): Promise<User> {
    const result = await firstValueFrom(
      this.apollo.mutate<{ reactivateUser: User }>({
        mutation: REACTIVATE_USER,
        variables: { id },
      }),
    );
    const user = result.data?.reactivateUser;
    if (!user) throw new Error('Réponse invalide du serveur');
    return user;
  }

  // Réinitialisation de mot de passe / renvoi d'activation (même mutation).
  // Le backend choisit le canal (e-mail ADMIN / OTP WhatsApp sinon).
  async resetUserPassword(id: string): Promise<User> {
    const result = await firstValueFrom(
      this.apollo.mutate<{ resetUserPassword: User }>({
        mutation: RESET_USER_PASSWORD,
        variables: { id },
      }),
    );
    const user = result.data?.resetUserPassword;
    if (!user) throw new Error('Réponse invalide du serveur');
    return user;
  }
}
