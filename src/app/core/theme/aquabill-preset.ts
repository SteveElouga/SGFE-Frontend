import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

// Palette alignée sur l'identité AquaBill (bleu #1a56db — voir maquettes Claude Design)
export const AquaBillPreset = definePreset(Aura, {
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
          placeholderColor: '#cbd5e1',
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
