import { parserCsvCoordonnees } from './import-csv.util';

describe('parserCsvCoordonnees', () => {
  it('renvoie [] pour un contenu vide', () => {
    expect(parserCsvCoordonnees('')).toEqual([]);
    expect(parserCsvCoordonnees('   \n  \n')).toEqual([]);
  });

  it('détecte l’en-tête (ordre standard) et saute la ligne 1', () => {
    const csv = 'numero_compteur,latitude,longitude\n1234,4.05,9.70\n5678,4.06,9.71';
    const lignes = parserCsvCoordonnees(csv);
    expect(lignes).toHaveLength(2);
    expect(lignes[0]).toMatchObject({ ligne: 2, numeroCompteurBrut: '1234', statut: 'A_IMPORTER' });
    expect(lignes[1]).toMatchObject({ ligne: 3, numeroCompteurBrut: '5678', statut: 'A_IMPORTER' });
  });

  it('tolère un en-tête dans le désordre et une casse différente', () => {
    const csv = 'Longitude,Numero_Compteur,Latitude\n9.70,1234,4.05';
    const [ligne] = parserCsvCoordonnees(csv);
    expect(ligne).toMatchObject({
      numeroCompteurBrut: '1234',
      latitudeBrut: '4.05',
      longitudeBrut: '9.70',
      statut: 'A_IMPORTER',
    });
  });

  it('sans en-tête reconnaissable, traite la première ligne comme une donnée (ordre par défaut)', () => {
    const csv = '1234,4.05,9.70\n5678,4.06,9.71';
    const lignes = parserCsvCoordonnees(csv);
    expect(lignes).toHaveLength(2);
    expect(lignes[0]).toMatchObject({ ligne: 1, numeroCompteurBrut: '1234' });
  });

  it('marque FORMAT_INVALIDE un numéro de compteur non entier (ex. décimal ou texte)', () => {
    const csv = 'numero_compteur,latitude,longitude\n12.5,4.05,9.70\nABC,4.05,9.70';
    const lignes = parserCsvCoordonnees(csv);
    expect(lignes[0].statut).toBe('FORMAT_INVALIDE');
    expect(lignes[0].erreur).toContain('entier');
    expect(lignes[1].statut).toBe('FORMAT_INVALIDE');
  });

  it('marque FORMAT_INVALIDE une latitude ou longitude hors bornes', () => {
    const csv = 'numero_compteur,latitude,longitude\n1234,95,9.70\n5678,4.05,200';
    const lignes = parserCsvCoordonnees(csv);
    expect(lignes[0].statut).toBe('FORMAT_INVALIDE');
    expect(lignes[0].erreur).toContain('latitude');
    expect(lignes[1].statut).toBe('FORMAT_INVALIDE');
    expect(lignes[1].erreur).toContain('longitude');
  });

  it('marque FORMAT_INVALIDE une cellule vide ou non numérique', () => {
    const csv = 'numero_compteur,latitude,longitude\n1234,,9.70';
    const [ligne] = parserCsvCoordonnees(csv);
    expect(ligne.statut).toBe('FORMAT_INVALIDE');
  });

  it('accepte des coordonnées négatives valides', () => {
    const csv = 'numero_compteur,latitude,longitude\n1234,-4.05,-9.70';
    const [ligne] = parserCsvCoordonnees(csv);
    expect(ligne.statut).toBe('A_IMPORTER');
  });
});
