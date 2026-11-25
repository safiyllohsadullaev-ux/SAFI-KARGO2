import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#FAF8F6",
        ink: "#18181B",
        mute: "#71717A",
        line: "#E7E5E4",
        brand: "#E53935",
        brandDark: "#B71C1C",
        mist: "#F4F4F5",
      },
      boxShadow: {
        card: "0 10px 30px rgba(24, 24, 27, 0.06)",
        nav: "0 10px 40px rgba(24, 24, 27, 0.12)",
      },
      borderRadius: {
        card: "22px",
      },
    },
  },
  plugins: [],
};

export default config;
