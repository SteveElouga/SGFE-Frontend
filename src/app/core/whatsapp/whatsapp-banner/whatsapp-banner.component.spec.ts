import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { provideTranslateService } from '@ngx-translate/core';
import { WhatsappBannerComponent } from './whatsapp-banner.component';
import { WhatsappSurveillanceService } from '../whatsapp-surveillance.service';

function monter(rompu: boolean, depuis = '') {
  TestBed.configureTestingModule({
    imports: [WhatsappBannerComponent],
    providers: [
      provideRouter([]),
      provideTranslateService({}),
      { provide: WhatsappSurveillanceService, useValue: { rompu: signal(rompu), depuis: signal(depuis) } },
    ],
  });
  const fixture = TestBed.createComponent(WhatsappBannerComponent);
  fixture.detectChanges();
  return fixture;
}

describe('WhatsappBannerComponent', () => {
  it('ne rend rien tant que la liaison n’est pas rompue', () => {
    const fixture = monter(false);
    expect(fixture.nativeElement.querySelector('.wa-banniere')).toBeNull();
  });

  it('affiche le bandeau, avec la durée quand elle est connue', () => {
    const fixture = monter(true, '25 min');
    const el = fixture.nativeElement.querySelector('.wa-banniere');
    expect(el).not.toBeNull();
    expect(el.querySelector('.wa-banniere__depuis')).not.toBeNull();
  });

  it('n’affiche pas la durée tant qu’elle est inconnue', () => {
    const fixture = monter(true, '');
    const el = fixture.nativeElement.querySelector('.wa-banniere');
    expect(el.querySelector('.wa-banniere__depuis')).toBeNull();
  });

  it('propose un lien vers Configuration pour reconnecter', () => {
    const fixture = monter(true);
    const lien = fixture.nativeElement.querySelector('.wa-banniere__action');
    expect(lien.getAttribute('href')).toBe('/configuration');
  });
});
