import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    path.join(here, 'index.html'),
    path.join(here, 'src/**/*.{js,jsx}'),
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#EEF3F9',
          100: '#D3DFEE',
          500: '#3B6EA8',
          700: '#1F4A7D',
          900: '#153D56',
        },
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
