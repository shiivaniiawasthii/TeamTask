import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: "1rem", screens: { "2xl": "1400px" } },
    extend: {
      colors: {
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        // WorkHive bees — pure CSS, no JS runtime.
        // bee-float: gentle vertical bob the body rides on.
        "bee-float": {
          "0%,100%": { transform: "translateY(0) rotate(-4deg)" },
          "50%": { transform: "translateY(-6px) rotate(4deg)" },
        },
        // wing-flap: fast wing scale so it reads as flapping at 60fps without
        // GPU thrash (single transform property).
        "wing-flap": {
          "0%,100%": { transform: "scaleY(1)" },
          "50%": { transform: "scaleY(0.25)" },
        },
        // bee-drift: a longer horizontal sway for decorative corner bees, so
        // multiple bees stay desynced.
        "bee-drift": {
          "0%,100%": { transform: "translate(0,0)" },
          "25%": { transform: "translate(8px,-4px)" },
          "50%": { transform: "translate(0,-8px)" },
          "75%": { transform: "translate(-8px,-4px)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "bee-float": "bee-float 2.8s ease-in-out infinite",
        "wing-flap": "wing-flap 110ms ease-in-out infinite",
        "bee-drift": "bee-drift 9s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
