import type { Config } from "tailwindcss";

export default {
  content: ["./client/index.html", "./client/src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      colors: {
        canvas: "var(--color-canvas)",
        surface: "var(--color-surface)",
        elevated: "var(--color-elevated)",
        ink: {
          DEFAULT: "var(--color-ink)",
          soft: "var(--color-ink-soft)",
        },
        muted: "var(--color-muted)",
        faint: "var(--color-faint)",
        line: {
          DEFAULT: "var(--color-border)",
          strong: "var(--color-border-strong)",
        },
        brand: {
          50: "#f0f4fa",
          100: "#dce6f4",
          200: "#b7cbe6",
          300: "#86a6d3",
          400: "#547ebc",
          500: "#2f5fa0",
          600: "#1d4285",
          700: "#16356c",
          800: "#122c59",
          900: "#0e2348",
        },
        mist: {
          50: "#f6f8fb",
          100: "#e8edf4",
          200: "#d5dde8",
        },
        gilt: {
          DEFAULT: "#9c7a45",
          hover: "#7e6136",
          soft: "#f4eee3",
        },
      },
      boxShadow: {
        soft: "var(--shadow-lift)",
        card: "var(--shadow-hair)",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fadeIn 0.45s var(--ease-out) forwards",
        "fade-up": "fadeUp 0.5s var(--ease-out) both",
      },
    },
  },
  plugins: [],
} satisfies Config;
