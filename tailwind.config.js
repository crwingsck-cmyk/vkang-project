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
      fontSize: {
        xs: ['0.8125rem', { lineHeight: '1.4' }],   // 13px
        sm: ['0.9375rem', { lineHeight: '1.5' }],  // 15px
        base: ['1rem', { lineHeight: '1.6' }],     // 16px
        lg: ['1.125rem', { lineHeight: '1.6' }],   // 18px
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', 'monospace'],
      },
      colors: {
        // 白底黑字主題
        surface: {
          base:    '#ffffff',   // 頁面背景（白）
          1:       '#fafafa',   // 卡片、面板
          2:       '#f5f5f5',   // 懸停、提升
          3:       '#eeeeee',   // 彈窗、下拉
        },
        border: {
          DEFAULT: '#e5e5e5',   // 標準邊框
          muted:   '#e0e0e0',   // 細分隔線
          strong:  '#d4d4d4',   // 強調邊框
        },
        txt: {
          primary:  '#171717',  // 主文字（黑）
          secondary:'#525252',  // 輔助文字
          subtle:   '#737373',  // 標籤、時間
          disabled: '#a3a3a3',  // 禁用
        },
        accent: {
          DEFAULT: '#2563eb',   // 主色（藍）
          hover:   '#1d4ed8',
          text:    '#1d4ed8',   // Accent text
          muted:   '#dbeafe',    // 淡藍背景
        },
        // 圓圈/四方元素：黑底白字、淡色
        'chip-dark': '#1a1a1a',      // 黑底
        'chip-yellow': '#fef9c3',    // 淡黃
        'chip-cyan': '#ccfbf1',      // 淡青
        'chip-blue': '#dbeafe',      // 淡藍
        // 語意色（保留，用於狀態）
        'success': '#22c55e',
        'warning': '#eab308',
        'error':   '#ef4444',
        'info':    '#3b82f6',
      },
    },
  },
  plugins: [],
};
