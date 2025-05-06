import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";

/** @type {import('eslint').Linter.Config[]} */
export default [
	{files: ["**/*.{js,mjs,cjs,ts}"]},
	{languageOptions: {globals: globals.node}},
	pluginJs.configs.recommended,
	...tseslint.configs.recommended,
	{
		rules: {
			"no-unused-vars": "off",
			"@typescript-eslint/no-unused-vars": "off",
			"@typescript-eslint/no-misused-promises": ["warn", {checksVoidReturn: false}],
			"@typescript-eslint/no-unnecessary-condition": "error",
			"@typescript-eslint/no-explicit-any": "off",
			"no-constant-condition": "warn",
			"@typescript-eslint/ban-ts-comment": "off",
		},
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
];
