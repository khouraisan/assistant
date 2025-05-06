export type MessageId = string;

export class Message {
	public readonly id: MessageId;
	public role: "user" | "assistant" | "tool";
	public text: string;
	public date: Date;
	// attachments are only for user messages
	public attachments?: Array<string>; // image ids
	// model is undefined if role is user
	public model?: string;
	// Only for tool messages
	public toolCallId?: string;
	public toolCalls?: any[];

	constructor({role, text, date, model}: {role: Message["role"]; text: string; date?: Date; model?: string}) {
		this.id = Math.random().toString(36).substring(2, 15);
		this.role = role;
		this.text = text;
		this.date = date || new Date();
		if (role === "assistant") {
			if (!model) {
				throw new Error("Model is required for assistant messages");
			}
			this.model = model;
		}
		if (role === "user" && model !== undefined) {
			throw new Error("Model should not be defined for user messages");
		}
		if (role === "user") {
			this.attachments = [];
		}
	}

	static tool({callId, content}: {callId: string; content: string}) {
		const v = new Message({
			role: "tool",
			text: content,
			date: new Date(),
		});
		v.toolCallId = callId;
		return v;
	}

	updateDate(date: Date | "now") {
		if (date === "now") {
			this.date = new Date();
		} else {
			this.date = date;
		}
	}

	static fromJSON(data: any) {
		const v = new Message({
			role: data.role,
			text: data.text,
			date: new Date(data.date),
			model: data.model,
		});
		(v.id as MessageId) = data.id;
		v.attachments = v.role === "user" ? data.attachments : undefined;
		v.toolCallId = v.role === "tool" ? data.toolCallId : undefined;
		v.toolCalls = v.role === "assistant" ? data.toolCalls : undefined;
		return v;
	}
}
