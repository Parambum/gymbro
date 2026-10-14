/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Base surfaces — near-black zinc, tuned so stacked cards stay readable.
        ink: {
          950: '#08080A',
          900: '#0E0E11',
          850: '#141418',
          800: '#1B1B20',
          750: '#232329',
          700: '#2C2C34',
          600: '#3F3F49',
          500: '#5A5A66',
          400: '#8A8A99',
          300: '#B4B4C0',
          200: '#D8D8E0',
        },
        // Accent — bold orange for actions and active states.
        flame: {
          300: '#FDBA74',
          400: '#FB923C',
          500: '#F97316',
          600: '#EA580C',
          700: '#C2410C',
        },
        // Reserved for personal records / celebratory highlights.
        volt: '#FACC15',
      },
    },
  },
  plugins: [],
};
