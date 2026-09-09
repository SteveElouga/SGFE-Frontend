import { TestBed } from '@angular/core/testing';
import { Apollo } from 'apollo-angular';
import { of } from 'rxjs';
import { UsersService } from './users.service';
import { User } from '../../shared/models/user.model';

const mockUser: User = {
  id: '1',
  username: 'admin',
  email: 'admin@aquabill.test',
  phoneNumber: '+237690000000',
  role: 'ADMIN',
  isActive: true,
  createdAt: '2026-06-28T00:00:00Z',
};

function setup() {
  const querySpy = vi.fn();
  const mutateSpy = vi.fn();

  TestBed.configureTestingModule({
    providers: [{ provide: Apollo, useValue: { query: querySpy, mutate: mutateSpy } }],
  });

  return { service: TestBed.inject(UsersService), querySpy, mutateSpy };
}

describe('UsersService', () => {
  it('returns the users list from the query', async () => {
    const { service, querySpy } = setup();
    querySpy.mockReturnValue(of({ data: { users: [mockUser] } }));

    await expect(service.getUsers()).resolves.toEqual([mockUser]);
  });

  it('returns an empty array when the query has no data', async () => {
    const { service, querySpy } = setup();
    querySpy.mockReturnValue(of({ data: null }));

    await expect(service.getUsers()).resolves.toEqual([]);
  });

  it('creates a user and returns it', async () => {
    const { service, mutateSpy } = setup();
    mutateSpy.mockReturnValue(of({ data: { createUser: mockUser } }));

    const created = await service.createUser({
      username: 'admin',
      phoneNumber: '+237690000000',
      role: 'ADMIN',
    });

    expect(created).toEqual(mockUser);
    expect(mutateSpy).toHaveBeenCalledOnce();
  });

  it('throws when the create mutation returns no data', async () => {
    const { service, mutateSpy } = setup();
    mutateSpy.mockReturnValue(of({ data: null }));

    await expect(
      service.createUser({ username: 'x', phoneNumber: '+237690000000', role: 'AGENT' }),
    ).rejects.toThrow();
  });

  it('updates a user and returns it', async () => {
    const { service, mutateSpy } = setup();
    const updated = { ...mockUser, email: 'new@aquabill.test' };
    mutateSpy.mockReturnValue(of({ data: { updateUser: updated } }));

    const result = await service.updateUser('1', { email: 'new@aquabill.test' });

    expect(result).toEqual(updated);
    expect(mutateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ variables: { id: '1', email: 'new@aquabill.test' } }),
    );
  });

  it('throws when the update mutation returns no data', async () => {
    const { service, mutateSpy } = setup();
    mutateSpy.mockReturnValue(of({ data: null }));

    await expect(service.updateUser('1', { email: 'x@x.com' })).rejects.toThrow(
      'Réponse invalide du serveur',
    );
  });

  it('deactivates a user and returns it', async () => {
    const { service, mutateSpy } = setup();
    const deactivated = { ...mockUser, isActive: false };
    mutateSpy.mockReturnValue(of({ data: { deactivateUser: deactivated } }));

    const result = await service.deactivateUser('1');

    expect(result).toEqual(deactivated);
    expect(mutateSpy).toHaveBeenCalledWith(expect.objectContaining({ variables: { id: '1' } }));
  });

  it('throws when the deactivate mutation returns no data', async () => {
    const { service, mutateSpy } = setup();
    mutateSpy.mockReturnValue(of({ data: null }));

    await expect(service.deactivateUser('1')).rejects.toThrow('Réponse invalide du serveur');
  });

  it('reactivates a user and returns it', async () => {
    const { service, mutateSpy } = setup();
    const reactivated = { ...mockUser, isActive: true };
    mutateSpy.mockReturnValue(of({ data: { reactivateUser: reactivated } }));

    const result = await service.reactivateUser('1');

    expect(result).toEqual(reactivated);
    expect(mutateSpy).toHaveBeenCalledWith(expect.objectContaining({ variables: { id: '1' } }));
  });

  it('throws when the reactivate mutation returns no data', async () => {
    const { service, mutateSpy } = setup();
    mutateSpy.mockReturnValue(of({ data: null }));

    await expect(service.reactivateUser('1')).rejects.toThrow('Réponse invalide du serveur');
  });

  it('resets a user password and returns it', async () => {
    const { service, mutateSpy } = setup();
    mutateSpy.mockReturnValue(of({ data: { resetUserPassword: mockUser } }));

    const result = await service.resetUserPassword('1');

    expect(result).toEqual(mockUser);
    expect(mutateSpy).toHaveBeenCalledWith(expect.objectContaining({ variables: { id: '1' } }));
  });

  it('throws when the reset-password mutation returns no data', async () => {
    const { service, mutateSpy } = setup();
    mutateSpy.mockReturnValue(of({ data: null }));

    await expect(service.resetUserPassword('1')).rejects.toThrow('Réponse invalide du serveur');
  });
});
