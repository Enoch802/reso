import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Monochrome system: black / glassy white / silver greys only.
        base: {
          50: "#f1f1f3",
          100: "#fbfbfc",
          200: "#e7e7eb",
          300: "#d8d8dd",
          400: "#a5a5ad",
          500: "#8a8a94",
          600: "#57575f",
          700: "#3a3a42",
          800: "#26262c",
          850: "#1a1a1f",
          900: "#101013",
          950: "#0a0a0d",
        },
        // "accent" is now ink: near-black in light mode, off-white in dark.
        accent: {
          50: "#f4f4f5",
          100: "#e8e8ec",
          200: "#d8d8dd",
          300: "#a5a5ad",
          400: "#6e6e78",
          500: "#34343c",
          600: "#17171b",
          700: "#0d0d10",
          800: "#0a0a0d",
          900: "#000000",
        },
      },
      fontFamily: {
        serif: [
          "Fraunces",
          "Iowan Old Style",
          "Palatino Linotype",
          "Georgia",
          "serif",
        ],
        sans: [
          "Instrument Sans",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "Segoe UI",
          "sans-serif",
        ],
      },
      borderRadius: {
        xl: "14px",
        "2xl": "18px",
        "3xl": "24px",
      },
      boxShadow: {
        neo:
          "6px 6px 14px rgba(10,10,15,0.10), -5px -5px 12px rgba(255,255,255,0.85)",
        "neo-sm":
          "3px 3px 8px rgba(10,10,15,0.09), -3px -3px 7px rgba(255,255,255,0.8)",
        "neo-in":
          "inset 4px 4px 9px rgba(10,10,15,0.10), inset -4px -4px 9px rgba(255,255,255,0.75)",
        "neo-dark":
          "6px 6px 15px rgba(0,0,0,0.55), -5px -5px 13px rgba(255,255,255,0.035)",
        "neo-in-dark":
          "inset 4px 4px 10px rgba(0,0,0,0.6), inset -4px -4px 9px rgba(255,255,255,0.04)",
        glass: "0 30px 60px -30px rgba(20,20,30,0.22)",
        "glass-dark": "0 40px 80px -36px rgba(0,0,0,0.75)",
      },
      keyframes: {
        draw: {
          from: { strokeDashoffset: "var(--ring-circ)" },
          to: { strokeDashoffset: "var(--ring-offset)" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(14px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "fade-down": {
          from: { opacity: "0", transform: "translateY(-14px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        float: {
          "0%,100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-12px)" },
        },
        drift: {
          "0%,100%": { transform: "translate3d(0,0,0) scale(1)" },
          "50%": { transform: "translate3d(18px,-22px,0) scale(1.06)" },
        },
        "pulse-soft": {
          "0%,100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
        shimmer: {
          from: { backgroundPosition: "200% 0" },
          to: { backgroundPosition: "-200% 0" },
        },
        checkpop: {
          from: { transform: "scale(0.4)", opacity: "0" },
          to: { transform: "scale(1)", opacity: "1" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.55s cubic-bezier(0.22,1,0.36,1) both",
        "fade-in": "fade-in 0.6s ease both",
        "fade-down": "fade-down 0.4s cubic-bezier(0.22,1,0.36,1) both",
        float: "float 7s ease-in-out infinite",
        drift: "drift 16s ease-in-out infinite",
        "pulse-soft": "pulse-soft 2.2s ease-in-out infinite",
        shimmer: "shimmer 2.4s linear infinite",
        checkpop: "checkpop 0.28s cubic-bezier(0.34,1.56,0.64,1) both",
      },
    },
  },
  plugins: [],
};

export default config;
