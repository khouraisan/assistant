import type {WebSocket} from "ws";

//* Compression is one way only for now

export function enableCompression(ws: WebSocket): void {
	const originalSend = ws.send.bind(ws);
	ws.send = (data: string | unknown) => {
		if (typeof data !== "string") {
			throw new Error("need to implement compression for more types: " + typeof data);
		}
		originalSend(Bun.deflateSync(data, {level: 12, library: "libdeflate"}));
	};
}
