import {defineConfig} from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
	plugins: [solid()],
	// https://github.com/andi23rosca/solid-markdown/issues/33
	optimizeDeps: {
		include: ["solid-markdown > micromark", "solid-markdown > unified"],
	},
});
