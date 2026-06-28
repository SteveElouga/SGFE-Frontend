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
  },
});
