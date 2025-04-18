import {createRenderEffect, createSignal, onCleanup} from "solid-js";
import {useToast} from "solid-notifications";
import {ChatId} from "../../server";

const WS_ROOT = import.meta.env.PROD ? window.location.origin : "ws://localhost:3000";

type GenerateMessageData =
	| {
			type: "start";
			messageId: string;
			model: string;
	  }
	| {
			type: "text";
			text: string;
	  }
	| {
			type: "error";
			error: string;
	  }
	| {
			type: "end";
	  };

export type GenerateMessage = GenerateMessageData & {chatId?: string};

type NotifyMessageData =
	| {
			type: "notify_messageInserted" | "notify_messageSet";
			messageId: string;
	  }
	| {
			type: "notify_messageDeleted";
			messageId: string;
			below: boolean;
	  }
	| {
			type: "notify_chatRenamed";
			chatId: ChatId;
	  }
	| {
			type: "notify_chatCreated" | "notify_chatDeleted" | "notify_chatModified";
			chatId: ChatId;
	  }
	| {
			type: "notify_charactersUpdated";
	  };

export type NotifyMessage = NotifyMessageData & {chatId?: string};

// global because multiple widgets can be open at the same time
const shorthands = new Map<string, Record<string, any>>();

export function useChatWebsocket() {
	const [socket, setSocket] = createSignal<WebSocket | null>(null);
	const [isConnected, setIsConnected] = createSignal<boolean>(false);

	const {notify, update} = useToast();

	const handlerCancels = new Map<(msg: GenerateMessage) => void, () => void>();
	const notifyHandlerCancels = new Map<(msg: NotifyMessage) => void, () => void>();

	const reconnHandlrs = new Set<() => void>();

	const registerHandler = (fn: (msg: GenerateMessage) => void) => {
		const sock = socket();
		if (!sock) throw new Error("debug: Socket not connected");

		const removeListeners = () => {
			sock.removeEventListener("error", onError);
			sock.removeEventListener("message", onMessage);
			sock.removeEventListener("close", onClose);
			// handlerCancels.delete(fn);

			console.log("Removed listeners from socket");
		};

		handlerCancels.set(fn, removeListeners);

		const onError = () => {
			fn({type: "error", error: "WebSocket error"});
			// removeListeners();
		};

		const onMessage = async (event: MessageEvent) => {
			event = await decompressWsEvent(event);

			let data = JSON.parse(event.data);
			console.debug("ws", data);

			// We hit a dynamic shorthand message
			if ("_sh" in data) {
				const sh = shorthands.get(data._sh);
				if (!sh) {
					throw new Error("Shorthand not found: " + data._sh);
				}

				console.debug("Shorthand", data._sh, "for", {...sh, ...data});

				delete data._sh;

				data = {
					...data,
					...sh,
				};
			}

			switch (data.type) {
				case "generationStart":
					fn({type: "start", chatId: data.chatId, messageId: data.messageId, model: data.model});
					break;

				case "generationChunk":
					fn({type: "text", text: data.message, chatId: data.chatId});
					break;

				case "generationComplete":
					fn({type: "end", chatId: data.chatId});
					// removeListeners();
					break;

				case "generationError":
					fn({type: "error", error: data.message, chatId: data.chatId});
					// removeListeners();
					break;

				case "error":
					fn({type: "error", error: data.message, chatId: data.chatId});
					// removeListeners();
					break;

				case "setShorthand":
					console.log("Set shorthand", data.id, "for", data.data);
					shorthands.set(data.id, data.data);
					break;

				case "unsetShorthand":
					console.log("Unset shorthand", data.id, "for", data.data);
					shorthands.delete(data.id);
					break;
			}
		};

		const ping = () => {
			if (sock.readyState === WebSocket.OPEN) {
				sock.send(JSON.stringify({type: "ping"}));
			}
		};

		const pingHandler = setInterval(ping, 30000);

		const onClose = () => {
			clearInterval(pingHandler);
			removeListeners();
		};

		sock.addEventListener("error", onError);
		sock.addEventListener("close", onClose);
		sock.addEventListener("message", onMessage);
	};

	const registerNotifyHandler = (fn: (msg: NotifyMessage) => void) => {
		const sock = socket();
		if (!sock) throw new Error("debug: Socket not connected");

		const removeListeners = () => {
			sock.removeEventListener("error", onError);
			sock.removeEventListener("message", onMessage);
			sock.removeEventListener("close", onClose);
			// TODO: test if this is sound
			// notifyHandlerCancels.delete(fn);

			console.log("Removed notify listeners from socket");
		};

		notifyHandlerCancels.set(fn, removeListeners);

		const onError = () => {
			console.error("WebSocket error in notify");
		};

		const onMessage = async (event: MessageEvent) => {
			event = await decompressWsEvent(event);

			const data: NotifyMessage = JSON.parse(event.data);

			if ("_sh" in data) {
				// TODO: handle shorthands
				return;
			}

			if (!data.type.startsWith("notify_")) {
				return;
			}

			console.debug("notify event", data);

			fn(data);
		};

		const onClose = () => removeListeners();

		sock.addEventListener("error", onError);
		sock.addEventListener("close", onClose);
		sock.addEventListener("message", onMessage);
	};

	const generate = async (chatId: `chat_${number}`) => {
		const ws = socket();

		if (ws && ws.readyState === WebSocket.OPEN) {
			// Use WebSocket for streaming

			// registerHandler(ws, onMessage);

			ws.send(
				JSON.stringify({
					type: "generate",
					chatId,
				})
			);
		} else {
			// todo
		}
	};

	const regenerate = (chatId: `chat_${number}`, messageId: string) => {
		const ws = socket();

		if (ws && ws.readyState === WebSocket.OPEN) {
			ws.send(
				JSON.stringify({
					type: "regenerate",
					chatId,
					messageId,
				})
			);
		}
	};

	const abort = async (chatId: string) => {
		console.log("Aborting generation");
		socket()?.send(JSON.stringify({type: "stop", chatId}));
	};

	const removeMessageCallback = (callback: (msg: GenerateMessage) => void) => {
		handlerCancels.get(callback)?.();
		handlerCancels.delete(callback);
	};

	const removeNotifyCallback = (callback: (msg: NotifyMessage) => void) => {
		notifyHandlerCancels.get(callback)?.();
		notifyHandlerCancels.delete(callback);
	};

	const reconnectHandlers = () => {
		for (const [fn, cancel] of handlerCancels) {
			cancel();
			registerHandler(fn);
		}

		for (const [fn, cancel] of [...notifyHandlerCancels]) {
			cancel();
			registerNotifyHandler(fn);
		}
		console.log("Reconnected handlers", handlerCancels.size, notifyHandlerCancels.size);
	};

	const registerReconnectHandler = (fn: () => void) => {
		const remove = () => {
			reconnHandlrs.delete(fn);
		};

		reconnHandlrs.add(fn);

		return remove;
	};

	const removeReconnectHandler = (fn: () => void) => {
		reconnHandlrs.delete(fn);
	};

	// WebSocket connection
	const startConnection = (reconnect: boolean) => {
		disconnect();

		const {id: connectingToastId} = notify("Connecting", {type: "loading", duration: 0});

		const newSocket = new WebSocket(WS_ROOT);
		console.log("new socket");
		// reconnectHandlers() is called at the end of this function scroll down

		newSocket.onopen = () => {
			console.log("WebSocket connected", newSocket.extensions);
			setIsConnected(true);
			for (const fn of reconnHandlrs) {
				fn();
			}
			update({id: connectingToastId, duration: 1500, content: "Connected", type: "success"});
		};

		newSocket.onclose = (ev) => {
			console.log("WebSocket closed", ev.code, ev.reason);
			setIsConnected(false);
			if (reconnect) {
				setTimeout(() => queueUntilVisible(() => startConnection(true)), 2000);
			}
		};

		newSocket.onmessage = async (event) => {
			event = await decompressWsEvent(event);

			const data = JSON.parse(event.data);

			if ("_sh" in data) {
				// TODO: handle shorthands
				return;
			}

			switch (data.type) {
				case "generationError":
					console.error("Generation error:", data.message);
					notify("Generation error", {type: "error"});
					break;

				case "error":
					console.error("Error:", data.message);
					notify(
						<div>
							Error
							<pre>{data.message}</pre>
						</div>,
						{type: "error"}
					);
					break;
			}
		};

		newSocket.onerror = (error) => {
			console.error("WebSocket error:", error);
			const connectingToastActive = update({id: connectingToastId}) !== undefined;
			if (connectingToastActive) {
				update({id: connectingToastId, duration: 1000, content: "Failed to connect", type: "error"});
			} else {
				notify("WebSocket error", {type: "error"});
			}

			// newSocket.close();
			disconnect();
		};

		setSocket(newSocket);
		reconnectHandlers();
	};

	const connect = () => {
		if (isConnected()) {
			return;
		}
		if (socket() !== null) {
			reconnectHandlers();
			return;
		}
		startConnection(true);
	};

	const disconnect = () => {
		socket()?.close();
		setSocket(null);
	};

	onCleanup(() => {
		disconnect();
	});

	return {
		// todo: abort generation
		abort,
		isConnected,
		connect,
		disconnect,
		generate,
		regenerate,
		registerHandler,
		registerNotifyHandler,
		registerReconnectHandler,
		removeMessageCallback,
		removeNotifyCallback,
		removeReconnectHandler,
	};
}

let transferred = 0;
let decompressed = 0;
let shorthanded = 0;

export function getStats() {
	return {
		transferred: (transferred / 1024).toFixed(2) + " KiB",
		decompressed: (decompressed / 1024).toFixed(2) + " KiB",
		shorthanded: (shorthanded / 1024).toFixed(2) + " KiB",
	};
}

async function decompressWsEvent(event: MessageEvent): Promise<MessageEvent<any>> {
	if (event.data instanceof Blob) {
		const ds = new DecompressionStream("deflate-raw");
		const decompressedStream = event.data.stream().pipeThrough(ds);
		const decompressedBlob = await new Response(decompressedStream).blob();

		const data = await decompressedBlob.text();

		// console.debug(
		// 	"decompressed",
		// 	(event.data.size / 1024).toFixed(2) + " KiB",
		// 	"→",
		// 	(decompressedBlob.size / 1024).toFixed(2) + " KiB"
		// );

		transferred += event.data.size;
		decompressed += decompressedBlob.size;

		// Also track shorthand expansion why not
		try {
			const dataJson = JSON.parse(data);
			if ("_sh" in dataJson) {
				const sh = shorthands.get(dataJson._sh);
				if (!sh) {
					throw new Error("Shorthand not found: " + dataJson._sh);
				}

				delete dataJson._sh;

				shorthanded += JSON.stringify({
					...dataJson,
					...sh,
				}).length;
			}
		} catch (_) {}

		event = {
			...event,
			data,
		};
	} else if (event.data instanceof ArrayBuffer) {
		throw new Error("ArrayBuffer not supported yet");
	}

	return event;
}

function queueUntilVisible(fn: () => void) {
	if (!document.hidden) {
		fn();
		return;
	}

	console.log("waiting until document visible to run fn", fn);
	document.addEventListener(
		"visibilitychange",
		() => {
			if (!document.hidden) fn();
		},
		{once: true}
	);
}
