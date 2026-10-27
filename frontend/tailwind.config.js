/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
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
        gray: {
          50: '#f8f5ee',
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
        },
        accent: {
          50: '#f5f5ef',
          100: '#eaece3',
          200: '#d5dbcd',
          300: '#b8c3ad',
          400: '#97a88b',
          500: '#7c8f70',
          600: '#617258',
          700: '#4c5a45',
          800: '#3f4939',
          900: '#343d30',
          950: '#1d231b'
        },
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
          'radial-gradient(at 85% 45%, rgba(59, 146, 113, 0.07) 0px, transparent 55%), radial-gradient(at 0% 0%, rgba(255, 255, 255, 0.55) 0px, transparent 60%)'
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
  plugins: []
}
