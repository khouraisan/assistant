import * as eventsource from "eventsource-parser";
import type {ReadableStream} from "node:stream/web";
import type {Chat} from "../chat";

export type MessageChunk = {
	type: "message";
	content: string;
};

export type ErrorChunk = {
	type: "error";
	content: Record<string, unknown>;
};

export type ToolChunk = {
	type: "tool";
	id: string;
	index: number;
	content: string;
};

export type ChunkEvent = MessageChunk | ErrorChunk | ToolChunk;

export type ProviderResponse = {
	status: number;
	stream: AsyncIterable<ChunkEvent>;
};

export type LLMProvider = {
	streamResponse(chat: Chat, abort: AbortController): Promise<ProviderResponse>;
};

/**
 * Converts a Server-Sent Events (SSE) Response stream into an AsyncIterable of ChunkEvents.
 *
 * This function handles the parsing of SSE messages from the response body and yields them
 * as ChunkEvents. It also handles error responses and the "[DONE]" termination message.
 *
 * @param response - The Response object containing the SSE stream
 * @returns An AsyncIterable that yields ChunkEvents containing either message content or error information
 * @throws May throw an error if parsing fails or if the stream is interrupted
 *
 * @example
 * ```
 * const response = await fetch('https://api.example.com/stream');
 * for await (const chunk of intoSSEConsumer(response)) {
 *     if (chunk.type === 'message') {
 *         console.log('Message:', chunk.content);
 *     } else {
 *         console.error('Error:', chunk.content);
 *     }
 * }
 * ```
 */
export async function* intoSSEConsumer(response: Response): AsyncIterable<ChunkEvent> {
	if (response.status !== 200) {
		// out of credits or maybe no token or something
		const text = await response.text();
		console.log("sse error", response.status, text);

		let error;
		try {
			error = JSON.parse(text);
		} catch (_) {
			error = {message: text};
		}
		yield {type: "error", content: error} as const;
	}

	// index -> tool call id
	const toolsUsed: Array<string> = [];

	const events: eventsource.EventSourceMessage[] = [];
	const parser = eventsource.createParser({onEvent: (x) => events.push(x)});
	const dec = new TextDecoder();

	for await (const chunk of response.body! as any as ReadableStream<Uint8Array>) {
		parser.feed(dec.decode(chunk));

		for (const e of events) {
			// some models sometimes send this instead of a proper object.
			if (e.data === "[DONE]") {
				// console.log("pesky done");
				yield {type: "message", content: ""} as const;
				return;
			}

			const event = JSON.parse(e.data);
			// todo: update for eventsource-parser 3.0
			if ("error" in event) {
				yield {type: "error", content: event.error} as const;
				return;
			}
			const choice = event.choices[0];

			const content = choice.delta.content as string | null;
			const message = {type: "message", content} as const;

			if (choice.finish_reason !== null) {
				if (message.content) {
					yield message as {type: "message"; content: string};
				}
				return;
			} else {
				if (message.content) {
					yield message as {type: "message"; content: string};
				}

				if ("tool_calls" in choice.delta) {
					for (const call of choice.delta.tool_calls) {
						if (call.type !== "function") {
							throw new Error("Unknown tool call type: " + call.type);
						}

						if (call.id) {
							toolsUsed[call.index] = call.id;
						}
						const id = toolsUsed[call.index];

						yield {type: "tool", id, index: call.index, content: call.function.arguments} as const;
					}
				}
			}
		}

		events.length = 0;
	}
}
