/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: 'rgb(var(--paper-rgb) / <alpha-value>)',
          surface: 'rgb(var(--surface-rgb) / <alpha-value>)',
          border: 'rgb(var(--line-rgb) / <alpha-value>)',
          text: {
            primary: 'rgb(var(--ink-rgb) / <alpha-value>)',
            secondary: 'rgb(var(--secondary-rgb) / <alpha-value>)',
            muted: 'rgb(var(--muted-rgb) / <alpha-value>)',
          }
        }
      }
    },
  },
  plugins: [],
}
