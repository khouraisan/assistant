export function validateChatId(req: any, res: any, next: any) {
	const fail = () => res.status(400).json({error: "Malformed chat id"});

	if (!req.params.chatId) {
		return fail();
	}
	if (!req.params.chatId.startsWith("chat_")) {
		return fail();
	}

	const num = parseInt(req.params.chatId.slice(5));

	if (isNaN(num)) {
		return fail();
	}

	next();
}

export function validateMessageId(req: any, res: any, next: any) {
	const fail = () => res.status(400).json({error: "Malformed message id"});

	if (!req.params.id) {
		return fail();
	}
	if (!/^[0-9a-z]+$/g.test(req.params.id)) {
		return fail();
	}

	next();
}

export function validateCharacterId(req: any, res: any, next: any) {
	const fail = () => res.status(400).json({error: "Malformed character id"});

	if (!req.params.id) {
		return fail();
	}
	if (!req.params.id.startsWith("character_")) {
		return fail();
	}

	next();
}
