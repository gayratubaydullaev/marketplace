/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        night: "#0b1f24",
        teal: {
          DEFAULT: "#0d7377",
          50: "#e8f4f4",
          100: "#cfe8e9",
          600: "#0f8589",
          700: "#0d7377",
          800: "#0a5c5f",
          900: "#084548",
        },
        saffron: "#e8a838",
      },
      fontFamily: {
        display: ['"Source Serif 4"', "Georgia", "serif"],
        sans: ['"DM Sans"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
