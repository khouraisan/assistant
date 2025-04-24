import sharp from "sharp";

const MAX_MP = 1.15 * 1e6;
const MAX_EDGE = 1568;

export async function resizeForClaude(image: Uint8Array): Promise<Uint8Array> {
	let img = sharp(image);

	const metadata = await img.metadata();
	const width = metadata.width;
	const height = metadata.height;

	if (width === undefined || height === undefined) {
		throw new Error("Failed to retrieve image metadata");
	}

	// Calculate scaling factors for each constraint
	const maxPixelsScale = Math.sqrt(MAX_MP / (width * height));
	const maxDimensionScale = MAX_EDGE / Math.max(width, height);

	// Use the smaller scaling factor
	const scaleFactor = Math.min(maxPixelsScale, maxDimensionScale);

	// Only resize if the image exceeds constraints
	if (scaleFactor < 1) {
		// Calculate new dimensions, rounding down
		const newWidth = Math.floor(width * scaleFactor);
		const newHeight = Math.floor(height * scaleFactor);

		// Resize and save
		img = img.resize(newWidth, newHeight);

		console.log(`Image resized to ${newWidth}x${newHeight}`);
	}

	return await img.flatten({background: "white"}).toFormat("jpeg", {quality: 100}).toBuffer();
}

export function asDataUrl(jpegImage: Uint8Array): string {
	const base64 = Buffer.from(jpegImage).toString("base64");
	return `data:image/jpeg;base64,${base64}`;
}

export async function resizeForThumbnail(image: Uint8Array): Promise<Uint8Array> {
	return await sharp(image).resize({width: 96, fit: "inside"}).toFormat("jpeg", {quality: 90}).toBuffer();
}
