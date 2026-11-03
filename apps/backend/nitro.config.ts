import { resolve } from "node:path";
import { defineNitroConfig } from "nitropack/config";

export default defineNitroConfig({
  srcDir: "src/api",
  compatibilityDate: "2025-01-01",
  // @libsql/isomorphic-ws imports `ws`, which the file trace misses under bun's isolated node_modules.
  externals: { traceInclude: [resolve("node_modules/ws/index.js"), resolve("node_modules/ws/wrapper.mjs")] },
  alias: {
    env: resolve("./src/env"),
    services: resolve("./src/services"),
    utils: resolve("./src/utils/handler.ts"),
  },
  rollupConfig: {
    plugins: [
      {
        name: "prisma-client-exact-alias",
        resolveId(id: string) {
          if (id === "generated:prisma") return resolve("./generated/prisma/client.ts");
        },
      },
    ],
  },
});
