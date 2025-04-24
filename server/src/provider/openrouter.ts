import {intoSSEConsumer, type LLMProvider} from "./provider";

export type OpenRouterConfig = {
	model: string;
	temperature?: number;
	top_p?: number;
	max_tokens?: number;
	stop?: string | string[];
	messages: OpenRouterMessage[];
	include_reasoning?: boolean;
	provider?: {
		allow_fallbacks?: boolean | null;
		require_parameters?: boolean | null;
		data_collection?: "deny" | "allow" | null;
		order?: string[] | null;
		ignore?: string[] | null;
		quantizations?: string[] | null;
		sort?: "price" | "throughput" | null;
	};
};

export type OpenRouterMessage = {
	role: string;
	content:
		| string
		| Array<
				| {
						type: "text";
						text: string;
						cache_control?: {type: string};
				  }
				| {type: "image_url"; image_url: {url: string}}
		  >;
};

const openRouterHeaders = {
	"Content-Type": "application/json",
	Authorization: `Bearer ${Bun.env.OPENROUTER_TOKEN}`,
	"X-Title": "Assistant",
	"HTTP-Referer": "https://assistant.vercel.app/",
};

export function OpenRouterProvider(): LLMProvider {
	return {
		async streamResponse(chat, abort) {
			const httpResponse = await callOpenRouter(await chat.toOpenRouterConfig(), abort);
			return {
				status: httpResponse.status,
				stream: intoSSEConsumer(httpResponse),
			};
		},
	};
}

export async function callOpenRouter(config: OpenRouterConfig, abort: AbortController): Promise<Response> {
	config = applyCaching(config);

	console.log(config.messages);

	Bun.write("./latest-request.json", JSON.stringify(config, null, 4));

	const response = fetch("https://openrouter.ai/api/v1/chat/completions", {
		method: "POST",
		headers: openRouterHeaders,
		body: JSON.stringify({...config, max_tokens: 4096, stream: true} satisfies OpenRouterConfig & {stream: true}),
		signal: abort.signal,
	});

	return response;
}

function applyCaching(config: OpenRouterConfig): OpenRouterConfig {
	if (!config.model.includes("claude")) return config;

	if (config.messages.filter((v) => v.role !== "system").length > 0) {
		const last = config.messages.findLast((v) => v.role === "user");
		if (last === undefined) return config;

		if (typeof last.content === "string") {
			last.content = [
				{
					type: "text",
					text: last.content,
					cache_control: {type: "ephemeral"},
				},
			];
		} else if (Array.isArray(last.content)) {
			const lastText = last.content.find((v) => v.type === "text");
			if (lastText === undefined) return config;

			lastText.cache_control = {type: "ephemeral"};
		}
	}

	return config;
}
