import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: "hsl(168,60%,26%)",
        "brand-light": "hsl(168,50%,40%)",
        surface: "#1a1d27",
        card: "#21253a",
        border: "#2e3450",
      },
    },
  },
  plugins: [],
};

export default config;
