import type { Config } from "tailwindcss";

export default {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      container: {
        center: true,
        padding: "1rem"
      }
    },
  },
  plugins: [],
} satisfies Config;
