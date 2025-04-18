import * as zlib from "zlib";

/** ## rawValue will be base64 encoded!!!!!!!! */
export function addTextChunk(maybePng: ArrayBuffer, keyword: string, rawValue: string): ArrayBuffer {
	// Convert character data to base64 string
	const chara = btoa(rawValue);

	// Create a view into the original PNG
	const view = new Uint8Array(maybePng);

	// Find the IEND chunk (last 12 bytes)
	const iendPosition = view.length - 12;

	// Create the tEXt chunk
	const KEYWORD = "Chara"; // Your chosen keyword
	const NULL = 0;
	const textData = chara;

	// Calculate the data length (keyword + null separator + text)
	const dataLength = KEYWORD.length + 1 + textData.length;

	// Create new array with extra space for our chunk
	const newSize = view.length + 4 + 4 + dataLength + 4; // Length + Type + Data + CRC
	const result = new Uint8Array(newSize);

	// Copy PNG data up to IEND chunk
	result.set(view.slice(0, iendPosition));

	// Write tEXt chunk
	let offset = iendPosition;

	// Length field (4 bytes, big-endian)
	result[offset++] = (dataLength >>> 24) & 0xff;
	result[offset++] = (dataLength >>> 16) & 0xff;
	result[offset++] = (dataLength >>> 8) & 0xff;
	result[offset++] = dataLength & 0xff;

	// Chunk type "tEXt" (4 bytes)
	result[offset++] = 0x74; // t
	result[offset++] = 0x45; // E
	result[offset++] = 0x58; // X
	result[offset++] = 0x74; // t

	// Write keyword
	for (let i = 0; i < KEYWORD.length; i++) {
		result[offset++] = KEYWORD.charCodeAt(i);
	}

	// Null separator
	result[offset++] = NULL;

	// Write text data
	for (let i = 0; i < textData.length; i++) {
		result[offset++] = textData.charCodeAt(i);
	}

	// Calculate and write CRC
	const crcData = result.slice(iendPosition + 4, offset); // Type + Data
	const crc = zlib.crc32(crcData);

	result[offset++] = (crc >>> 24) & 0xff;
	result[offset++] = (crc >>> 16) & 0xff;
	result[offset++] = (crc >>> 8) & 0xff;
	result[offset++] = crc & 0xff;

	// Copy IEND chunk
	result.set(view.slice(iendPosition), offset);

	// Hope this ai generated slop works first try o( ❛ᴗ❛ )o
	return result.buffer;
}
export function removeNonEssentialChunks(pngBuffer: ArrayBuffer): ArrayBuffer {
	// Create a view of the PNG data
	const view = new Uint8Array(pngBuffer);

	// Essential chunks to keep
	const essentialChunks = ["IHDR", "PLTE", "IDAT", "IEND"];

	// Create result array - initially we don't know size, so we'll collect chunks first
	const chunks = [];

	// First, keep the PNG signature (first 8 bytes)
	chunks.push(view.slice(0, 8));

	// Parse and filter chunks
	let offset = 8; // Start after signature
	while (offset < view.length) {
		// Read chunk length
		const length = (view[offset] << 24) | (view[offset + 1] << 16) | (view[offset + 2] << 8) | view[offset + 3];

		// Read chunk type as string
		const typeBytes = view.slice(offset + 4, offset + 8);
		const type = String.fromCharCode(...typeBytes);

		// Total chunk size: length field (4) + type (4) + data (length) + CRC (4)
		const chunkSize = 4 + 4 + length + 4;

		// Keep chunk only if it's essential
		if (essentialChunks.includes(type)) {
			chunks.push(view.slice(offset, offset + chunkSize));
		}

		// Move to next chunk
		offset += chunkSize;
	}

	// Calculate total size of result
	const totalSize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);

	// Create result array and copy chunks into it
	const result = new Uint8Array(totalSize);
	let resultOffset = 0;

	for (const chunk of chunks) {
		result.set(chunk, resultOffset);
		resultOffset += chunk.length;
	}

	return result.buffer;
}
