import {Glob} from "bun";

const glob = new Glob("*.json");

for await (const filename of glob.scan("./data/chats")) {
	console.log(filename);
	const file = Bun.file("./data/chats/" + filename);
	const json = await file.json();
	json.messages = json.messages.map((message: any) => {
		message.images = [];
		return message;
	});

	await Bun.write(file, JSON.stringify(json, null, 4));
}
