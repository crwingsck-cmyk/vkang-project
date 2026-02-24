/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', 'monospace'],
      },
      colors: {
        // Design system — Linear/Supabase inspired refined dark palette
        surface: {
          base:    '#16161a',   // Deepest layer (page bg)
          1:       '#1e1e26',   // Cards, panels
          2:       '#252530',   // Elevated, hover states
          3:       '#2d2d3a',   // Modals, dropdowns
        },
        border: {
          DEFAULT: '#27273a',   // Standard borders
          muted:   '#1e1e2e',   // Subtle separators
          strong:  '#3a3a50',   // Emphasized borders
        },
        txt: {
          primary:  '#e4e4e7',  // Main text
          secondary:'#a1a1aa',  // Supporting text
          subtle:   '#71717a',  // Labels, timestamps
          disabled: '#52525b',  // Disabled states
        },
        accent: {
          DEFAULT: '#5E6AD2',   // Linear purple-blue
          hover:   '#6E7AE5',
          text:    '#818cf8',   // Accent text on dark bg
          muted:   '#1e1e3a',   // Subtle accent bg
        },
        // Keep semantic colors
        'success': '#34d399',
        'warning': '#fbbf24',
        'error':   '#f87171',
        'info':    '#60a5fa',
      },
    },
  },
  plugins: [],
};
