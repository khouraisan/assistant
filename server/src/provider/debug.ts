import type {LLMProvider} from "./provider";

type DebugProviderConfig = {
	text: string;
};

/**
 * Creates a debug provider for testing purposes.
 *
 * @param options - Configuration options for the debug provider
 * @returns An LLMProvider object with a streamResponse method that returns a debug stream
 */
export function DebugProvider(options: DebugProviderConfig): LLMProvider {
	return {
		async streamResponse() {
			return {
				status: 200,
				stream: debugStream(options),
			};
		},
	};
}

async function* debugStream(options: DebugProviderConfig) {
	for (const content of chunk(options.text, 100)) {
		yield {type: "message", content} as const;
	}
}

function chunk(input: string, len: number): string[] {
	const chunks: string[] = [];
	for (let i = 0; i < input.length; i += len) {
		chunks.push(input.slice(i, i + len));
	}
	return chunks;
}
