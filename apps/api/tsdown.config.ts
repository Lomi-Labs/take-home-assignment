import { defineConfig } from "tsdown";

export default defineConfig({
    entry: ["src/main.ts"],
    platform: "node",
    target: "node22",
    format: "esm",
    dts: false,
    // Workspace packages ship TypeScript source, so they go into the bundle; npm deps stay external.
    deps: { alwaysBundle: [/^@app\//] },
});
