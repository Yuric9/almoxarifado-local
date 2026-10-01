// Tons de cinza e superfícies vêm de variáveis CSS (app/globals.css),
// o que permite trocar entre tema claro e escuro sem duplicar classes.
const tom = nome => `rgb(var(--${nome}) / <alpha-value>)`
const escala = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        slate: Object.fromEntries(escala.map(n => [n, tom(`slate-${n}`)])),
        superficie: tom('superficie'),
        fundo: tom('fundo')
      }
    }
  },
  plugins: []
}
