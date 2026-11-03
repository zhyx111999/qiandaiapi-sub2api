import defaultColors from 'tailwindcss/colors'
import plugin from 'tailwindcss/plugin'

/** Warm neutrals: the ivory gray. */
const warmGray = {
  50: '#f6f2ea',
  100: '#f0ede5',
  200: '#e3dfd4',
  300: '#cbc5b8',
  400: '#a49e91',
  500: '#7b756a',
  600: '#605b52',
  700: '#49443d',
  800: '#35312c',
  900: '#1f1d1a',
  950: '#171613'
}

/*
 * The other Tailwind grays the original pages use (platform and group badges, a few chips and
 * cards). In the light theme they follow the warm gray; in the dark theme they keep Tailwind's own
 * cool values, so the dark console looks as before. Each shade reads a CSS variable that the plugin
 * below sets per theme, so utilities with opacity (bg-slate-500/10) and gradients still work.
 */
const THEMED_GRAYS = ['slate', 'zinc', 'neutral']
const SHADES = Object.keys(warmGray)
const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ')
const themedGray = (name) =>
  Object.fromEntries(SHADES.map((shade) => [shade, `rgb(var(--${name}-${shade}) / <alpha-value>)`]))
const grayVariables = (paletteOf) =>
  Object.fromEntries(
    THEMED_GRAYS.flatMap((name) => SHADES.map((shade) => [`--${name}-${shade}`, channels(paletteOf(name)[shade])]))
  )

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Ivory card surface: every original bg-white panel, table, dialog and input follows the cover.
        white: '#fbf8f2',
        // Botanical green, shared by the existing controls and the ivory landing page.
        primary: {
          50: '#f1f8f3',
          100: '#e1f0e7',
          200: '#c1e0cf',
          300: '#94c9ae',
          400: '#65b394',
          500: '#3b9271',
          600: '#2f785b',
          700: '#295f4a',
          800: '#254c3d',
          900: '#213f34',
          950: '#11261e'
        },
        // Warm neutrals retheme existing gray utilities without replacing business components.
        gray: warmGray,
        ...Object.fromEntries(THEMED_GRAYS.map((name) => [name, themedGray(name)])),
        // 深色模式背景
        dark: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617'
        }
      },
      fontFamily: {
        sans: [
          'Manrope Variable',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'PingFang SC',
          'Hiragino Sans GB',
          'Microsoft YaHei',
          'sans-serif'
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace']
      },
      boxShadow: {
        glass: '0 12px 36px -20px rgba(71, 64, 53, 0.24)',
        'glass-sm': '0 5px 18px -10px rgba(71, 64, 53, 0.2)',
        glow: '0 4px 16px rgba(59, 146, 113, 0.1)',
        'glow-lg': '0 8px 28px rgba(59, 146, 113, 0.15)',
        card: '0 2px 4px rgba(71, 64, 53, 0.025), 0 12px 28px -20px rgba(71, 64, 53, 0.18)',
        'card-hover': '0 16px 36px -20px rgba(71, 64, 53, 0.26)',
        'inner-glow': 'inset 0 1px 0 rgba(255, 255, 255, 0.1)'
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-primary': 'linear-gradient(135deg, #3b9271 0%, #2f785b 100%)',
        'gradient-dark': 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
        'gradient-glass':
          'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
        'mesh-gradient':
          'radial-gradient(at 86% 80%, rgba(59, 146, 113, 0.07) 0px, transparent 60%), radial-gradient(130% 95% at 50% 42%, transparent 58%, rgba(31, 29, 26, 0.05) 100%)'
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'scale-in': 'scaleIn 0.2s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        shimmer: 'shimmer 2s linear infinite',
        glow: 'glow 2s ease-in-out infinite alternate'
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' }
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' }
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' }
        },
        glow: {
          '0%': { boxShadow: '0 0 18px rgba(59, 146, 113, 0.12)' },
          '100%': { boxShadow: '0 0 26px rgba(59, 146, 113, 0.2)' }
        }
      },
      backdropBlur: {
        xs: '2px'
      },
      borderRadius: {
        '4xl': '2rem'
      }
    }
  },
  plugins: [
    // Light theme: the warm gray; dark theme: Tailwind's original values of each gray.
    plugin(({ addBase }) => {
      addBase({
        ':root': grayVariables(() => warmGray),
        '.dark': grayVariables((name) => defaultColors[name])
      })
    })
  ]
}
