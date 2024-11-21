import { defineConfig } from "vitest/config";

export default defineConfig({
	define: {
		"import.meta.vitest": "undefined",
	},
	test: {
		environment: "node",
		include: ["test/**/*.test.ts"],
		includeSource: ["src/**/*.ts"],
		coverage: {
			provider: "istanbul",
			reporter: ["text"],
		},
		passWithNoTests: true,
	},
});
