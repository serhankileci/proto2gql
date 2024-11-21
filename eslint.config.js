export default [
	{
		extends: ["plugin:@typescript-eslint/recommended"],
		plugins: ["@typescript-eslint"],
		rules: {
			"no-unused-vars": "error",
			"no-undef": "error",
			"@typescript-eslint/no-var-requires": "error",
		},
	},
];
