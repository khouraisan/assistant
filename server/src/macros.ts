export function parseMacros(input: string): string {
	input = input.replaceAll("{{time}}", time12());
	input = input.replaceAll("{{time12}}", time12());
	input = input.replaceAll("{{time24}}", time24());
	input = input.replaceAll("{{date}}", date());
	input = input.replaceAll("{{weekday}}", weekday());
	input = input.replaceAll(/{{\/\/.*?}}/gs, ""); // comments

	return input;
}

function date() {
	return new Date().toLocaleDateString("en-US", {
		year: "numeric",
		month: "long",
		day: "numeric",
	});
}

function weekday() {
	return new Date().toLocaleDateString("en-US", {
		weekday: "long",
	});
}


function time12() {
	return new Date().toLocaleTimeString("en-US", {
		hour: "numeric",
		minute: "2-digit",
		hour12: true,
	});
}

function time24() {
	return new Date().toLocaleTimeString("en-US", {
		hour: "numeric",
		minute: "2-digit",
		hour12: false,
	});
}
