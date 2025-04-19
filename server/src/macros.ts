export function parseMacros(input: string): string {
	console.debug("Invoking parseMacros with arg:", input);

	const m = new MacroManager();
	const output = m.run(input);

	console.debug("parseMacros output: ", output);

	return output;
}

type AstElPlaintext = {
	type: "plaintext"
	content: string
}

type AstElMacro = {
	type: "macro"
	content: Array<AstEl>
}

type AstEl = AstElPlaintext | AstElMacro

class AstBuilder {
	public static buildAst(s: string) {
		const astBuilder = new AstBuilder(s);
		return astBuilder.buildAstRecursively();
	}

	private p: number;
	private readonly s: string[];

	private constructor(s: string) {
		this.p = 0;
		this.s = Array.from(s);
	}

	private buildAstRecursively(inMacro: boolean = false): Array<AstEl> {
		const ret: Array<AstEl> = [];
		let cur: Array<string> = [];

		while (this.p < this.s.length) {
			switch (this.s[this.p]) {
				case "{": {
					if (this.s.length < this.p + 1 || this.s[this.p + 1] !== "{") {
						cur.push("{");
						this.p++;
						continue;
					}

					ret.push({
						type: "plaintext",
						content: cur.join(""),
					});

					cur = [];
					this.p += 2;

					ret.push({
						type: "macro",
						content: this.buildAstRecursively(true),
					});

					break;
				}
				case "}": {
					if (this.s.length < this.p + 1 || this.s[this.p + 1] !== "}" || !inMacro) {
						cur.push("}");
						this.p++;
						continue;
					}

					ret.push({
						type: "plaintext",
						content: cur.join(""),
					})

					this.p += 2;

					return ret;
				}
				case "\\": {
					cur.push(this.s.length > this.p + 1 ? this.s[this.p + 1] : "\\");
					this.p += 2;
					break;
				}
				default: {
					cur.push(this.s[this.p]);
					this.p++;
					break;
				}
			}
		}

		if (cur.length > 0) {
			ret.push({
				type: "plaintext",
				content: cur.join(""),
			});
		}

		return ret;
	}
}

class MacroContext {
	private date: Date;
	private constants: Map<string, string>;
	private localVars: Map<string, string>;

	constructor() {
		this.date = new Date();
		this.constants = new Map();
		this.localVars = new Map();
	}

	public getDate() {
		return this.date.toLocaleDateString("en-US", {
			year: "numeric",
			month: "long",
			day: "numeric",
		});
	}

	public getWeekday() {
		return this.date.toLocaleDateString("en-US", {
			weekday: "long",
		});
	}


	public getTime12() {
		return this.date.toLocaleTimeString("en-US", {
			hour: "numeric",
			minute: "2-digit",
			hour12: true,
		});
	}

	public getTime24() {
		return this.date.toLocaleTimeString("en-US", {
			hour: "numeric",
			minute: "2-digit",
			hour12: false,
		});
	}
}

class MacroManager {
	private context: MacroContext;

	private evalAstEl(el: AstEl): string {
		if (el.type === "plaintext") {
			return el.content;
		}

		const flatContent = el.content.map(el => {
			if (el.type === "plaintext") {
				return el.content;
			} else {
				return this.evalAstEl(el);
			}
		}).join("");

		switch (flatContent.trim()) {
			case "time": {
				return this.context.getTime12();
			}
			case "time12": {
				return this.context.getTime12();
			}
			case "time24": {
				return this.context.getTime24();
			}
			case "date": {
				return this.context.getDate();
			}
			case "weekday": {
				return this.context.getWeekday();
			}
			default: {
				if (flatContent.startsWith("\\")) {
					return "";
				}

				// return plainly what we fail to eval
				return "{{" + flatContent + "}}";
			}
		}
	}

	public constructor() {
		this.context = new MacroContext();
	}

	public run(s: string): string {
		const ast = AstBuilder.buildAst(s);
		return ast.map(el => this.evalAstEl(el)).join("");
	}
}
