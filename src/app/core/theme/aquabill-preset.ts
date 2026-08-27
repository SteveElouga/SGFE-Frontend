import { definePreset } from '@primeuix/themes';
import base from '@primeuix/themes/aura/base';
import cssAura from '@primeuix/themes/aura/css';
import button from '@primeuix/themes/aura/button';
import confirmdialog from '@primeuix/themes/aura/confirmdialog';
import datepicker from '@primeuix/themes/aura/datepicker';
import dialog from '@primeuix/themes/aura/dialog';
import iconfield from '@primeuix/themes/aura/iconfield';
import inputtext from '@primeuix/themes/aura/inputtext';
import password from '@primeuix/themes/aura/password';
import popover from '@primeuix/themes/aura/popover';
import ripple from '@primeuix/themes/aura/ripple';
import select from '@primeuix/themes/aura/select';
import toast from '@primeuix/themes/aura/toast';
import tooltip from '@primeuix/themes/aura/tooltip';

/**
 * Préréglage composé à la pièce, et non dérivé de `@primeuix/themes/aura`.
 *
 * L'import par défaut d'Aura est **un seul module de 106 kB** portant les
 * jetons des 88 composants de la bibliothèque. Aucun bundler ne peut l'élaguer :
 * `definePreset` consomme l'objet entier. L'application en monte onze — garder
 * les 77 autres, c'était 74 kB de jetons pour des composants qui ne seront
 * jamais rendus.
 *
 * Aura publiant un module par composant, on ne prend que le nécessaire et
 * l'élagage devient celui du bundler, pas un filtrage à l'exécution (qui,
 * lui, ne retire rien du bundle — vérifié).
 *
 * `ripple` et `tooltip` ne correspondent à aucun import `primeng/*` : ce sont
 * des comportements que les composants PrimeNG activent eux-mêmes.
 *
 * ⚠️ Monter un nouveau composant PrimeNG sans ajouter son import ici le rendrait
 * sans style, silencieusement. `aquabill-preset.spec.ts` compare cette liste
 * aux imports `primeng/*` du code source et échoue si l'une avance sans l'autre.
 */
// Le sous-chemin `aura/css` déclare un export nommé `css` dans ses `.d.ts`
// mais n'expose qu'un export par défaut à l'exécution (`export { t as default }`).
// Le paquet se contredit ; on suit le runtime et on redonne le type que ses
// propres types annoncent.
const css = cssAura as unknown as string;

const AuraMinimal = {
  ...base,
  css,
  components: {
    button,
    confirmdialog,
    datepicker,
    dialog,
    iconfield,
    inputtext,
    password,
    popover,
    ripple,
    select,
    toast,
    tooltip,
  },
};

export const AquaBillPreset = definePreset(AuraMinimal, {
  semantic: {
    primary: {
      50: '#eff6ff',
      100: '#dbeafe',
      200: '#bfdbfe',
      300: '#93c5fd',
      400: '#60a5fa',
      500: '#3b82f6',
      600: '#1a56db',
      700: '#1d4ed8',
      800: '#1e40af',
      900: '#1e3a8a',
      950: '#172554',
    },
    formField: {
      paddingX: '14px',
      paddingY: '13px',
      borderRadius: '8px',
    },
    colorScheme: {
      light: {
        primary: {
          color: '{primary.600}',
          hoverColor: '{primary.700}',
          activeColor: '{primary.800}',
        },
        formField: {
          background: '#f8fafc',
          borderColor: '#e2e8f0',
          hoverBorderColor: '#cbd5e1',
          invalidBorderColor: '#ef4444',
          placeholderColor: '#5f6e85',   // 4,7:1 — était #cbd5e1 (1,42:1), illisible
        },
      },
    },
  },
  components: {
    button: {
      root: {
        raisedShadow: '0 4px 14px rgba(26, 86, 219, .4)',
      },
      colorScheme: {
        light: {
          root: {
            primary: {
              background: 'linear-gradient(135deg, #1a56db, #1d4ed8)',
              hoverBackground: 'linear-gradient(135deg, #1d4ed8, #1a56db)',
              borderColor: '#1a56db',
              hoverBorderColor: '#1d4ed8',
            },
          },
        },
      },
    },
  },
});
