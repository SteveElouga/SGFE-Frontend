import { LANDING_ROUTE_BY_ROLE, landingRouteFor } from './landing';

describe('landingRouteFor', () => {
  it('ADMIN atterrit sur le dashboard', () => {
    expect(landingRouteFor('ADMIN')).toBe('/dashboard');
  });

  it('COMPTABLE atterrit sur le dashboard', () => {
    expect(landingRouteFor('COMPTABLE')).toBe('/dashboard');
  });

  it('AGENT atterrit sur terrain', () => {
    expect(landingRouteFor('AGENT')).toBe('/terrain');
  });

  it('SUPERVISEUR atterrit sur campagnes (pas de dashboard pour ce rôle)', () => {
    expect(landingRouteFor('SUPERVISEUR')).toBe('/campagnes');
  });

  it('un rôle null (non identifié) atterrit sur /login', () => {
    expect(landingRouteFor(null)).toBe('/login');
  });

  it('la table exposée couvre exactement les 4 rôles du domaine', () => {
    expect(Object.keys(LANDING_ROUTE_BY_ROLE).sort()).toEqual(
      ['ADMIN', 'AGENT', 'COMPTABLE', 'SUPERVISEUR'].sort(),
    );
  });
});
