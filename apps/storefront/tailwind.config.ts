import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        night: "#0b1f24",
        teal: {
          DEFAULT: "#0d7377",
          50: "#e8f4f4",
          800: "#0a5c5f",
          900: "#084548",
        },
        saffron: {
          DEFAULT: "#e8a838",
          50: "#fdf6e8",
          600: "#d4942a",
          700: "#b87d1f",
        },
        mist: "#eef5f4",
        paper: "#f8fbfa",
        accent: {
          DEFAULT: "#e8a838",
          hover: "#d4942a",
          muted: "rgba(232, 168, 56, 0.12)",
        },
        danger: {
          DEFAULT: "#c23b3b",
          muted: "rgba(194, 59, 59, 0.1)",
        },
        surface: {
          DEFAULT: "#ffffff",
          muted: "#f3f7f6",
        },
        muted: "#5a6f74",
      },
      fontFamily: {
        // System UI everywhere — no webfont downloads / preload warnings
        display: [
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "Noto Sans",
          "Noto Sans Arabic",
          "sans-serif",
        ],
        sans: [
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "Noto Sans",
          "Noto Sans Arabic",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
