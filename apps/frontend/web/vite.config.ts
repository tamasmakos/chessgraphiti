import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import topLevelAwait from "vite-plugin-top-level-await";
import { tanstackRouter } from '@tanstack/router-plugin/vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const port = env.PORT ? Number(env.PORT) : 80;
  return {
    build: {
      outDir: "dist",
    },
    plugins: [tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }), react(), tailwindcss(), tsconfigPaths(), topLevelAwait()],
    server: {
      port,
      host: "0.0.0.0",
    },
  };
});
