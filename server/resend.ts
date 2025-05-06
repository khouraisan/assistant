const file = await Bun.file("./latest-request.json").json();

const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
	method: "POST",
	headers: {
		"Content-Type": "application/json",
		Authorization: `Bearer ${Bun.env.OPENROUTER_TOKEN}`,
	},
	body: JSON.stringify({...file, stream: false}),
});

console.log("Response", response.status);
console.dir(await response.json(), {depth: null});
