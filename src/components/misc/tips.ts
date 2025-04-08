export type TipName = "chat" | "add-chat" | "add-temporary-chat";

declare module "solid-js" {
	namespace JSX {
		interface HTMLAttributes<T> {
			"data-tip"?: TipName | undefined;
		}
	}
}

// This is a map of tip titles to their corresponding documents and highlights in those documents
// If the value is null, it means that the tip is the document itself and there is no highlight
// If the value is a string, it means that the tip is a highlight in the document with that name
const tipMap = {
	chat: null,
	"add-chat": "chat",
	"add-temporary-chat": "chat",
} satisfies Record<TipName, string | null>;

export function tipToDocumentPath(tip: TipName): {document: string; highlight: null | string} {
	if (tip in tipMap === false) {
		throw new Error(`Tip "${tip}" not found`);
	}

	if (tipMap[tip] === null) {
		return {document: tip, highlight: null};
	} else {
		return {document: tipMap[tip], highlight: tip};
	}
}
