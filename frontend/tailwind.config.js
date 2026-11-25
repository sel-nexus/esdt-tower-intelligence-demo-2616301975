/** Share restrained communication-blue and cool neutral roles across views. */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        background: '#f4f7fa', surface: '#ffffff', 'surface-raised': '#eaf0f5',
        foreground: '#162636', 'foreground-muted': '#4b6074', border: '#cbd5df', ring: '#286295',
        primary: { 50: '#eef5fb', 100: '#deecf7', 200: '#c4dff2', 300: '#9dc5e1', 400: '#72a6cd', 500: '#4d89b5', 600: '#286295', 700: '#214f79', 800: '#1d4264', 900: '#1a3650', 950: '#122638' },
        error: { DEFAULT: '#912c36', subtle: '#fceff0' },
      },
      fontFamily: { sans: ['"Segoe UI"', '"Helvetica Neue"', 'Arial', 'sans-serif'] },
    },
  },
  plugins: [],
};
