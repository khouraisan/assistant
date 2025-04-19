import { utils } from "sortablejs";
import { chunkByLevel } from "./utils.ts";

export function parseMacros(input: string): string {
	console.debug("Invoking parseMacros with arg:", input);

	const m = new MacroManager();
	const output = m.run(input);

	console.debug("parseMacros output: ", output);

	return output;
}

type AstElPlaintext = {
	type: "plaintext";
	content: string;
};

type AstElMacro = {
	type: "macro";
	content: Array<AstEl>;
};

interface Resoluble {
	//indicates whether the macro has already been resolved
	poll(): "READY" | "SOME_PROGRESS" | "NO_PROGRESS";
	//resolves the macro into a string, undefined if it fails to resolve
	resolve(): string;
}

class ResolubleText implements Resoluble {
	private output: string;

	constructor(s: string) {
		this.output = s;
	}

	public poll(): "READY" | "SOME_PROGRESS" | "NO_PROGRESS" {
		return "READY";
	}

	public resolve(): string {
		return this.output;
	}
}

class ResolubleLocalVar implements Resoluble {
	private varName: string;
	private context: MacroContext;

	constructor(varName: string, context: MacroContext) {
		this.varName = varName;
		this.context = context;
	}

	public poll() {
		return this.context.hasVar(this.varName) ? "READY" : "NO_PROGRESS";
	}

	public resolve(): string {
		return (
			this.context.getVar(this.varName) ||
			"[UNRESOLVED VAR " + this.varName + "]"
		);
	}
}

class ResolubleWrap implements Resoluble {
	private astEls: (AstElPlaintext | AstElResoluble)[];

	public constructor(astEls: (AstElPlaintext | AstElResoluble)[]) {
		this.astEls = astEls;
	}

	public poll(): "READY" | "SOME_PROGRESS" | "NO_PROGRESS" {
		let res: "SOME_PROGRESS" | "NO_PROGRESS" = "NO_PROGRESS";

		for (;;) {
			let resolvedCount = 0;
			let unresolvedCount = 0;

			this.astEls = this.astEls.map((el) => {
				if (el.type === "plaintext") {
					return el;
				}

				if (el.content.poll() !== "NO_PROGRESS") {
					res = "SOME_PROGRESS";
				}

				if (el.content.poll() === "READY") {
					resolvedCount++;
					return {
						type: "plaintext",
						content: el.content.resolve(),
					};
				}

				unresolvedCount++;
				return el;
			});

			if (unresolvedCount === 0) {
				return "READY";
			}

			if (resolvedCount === 0) {
				return res;
			}
		}
	}

	public resolve(): string {
		return this.astEls
			.map((el) =>
				el.type === "plaintext" ? el.content : el.content.resolve(),
			)
			.join("");
	}
}

class ResolubleMacro implements Resoluble {
	private args: (AstElPlaintext | AstElResoluble)[];
	private context: MacroContext;

	private unwrappedResoluble: Resoluble | undefined;

	constructor(el: AstElMacro, context: MacroContext) {
		this.args = [];
		this.context = context;

		let cur: (AstElPlaintext | AstElResoluble)[] = [];
		for (const e of el.content) {
			if (e.type === "sep") {
				if (cur.length > 0) {
					this.args.push({
						type: "resoluble",
						content: new ResolubleWrap(cur),
					});
				}

				cur = [];
				continue;
			}

			if (e.type === "macro") {
				cur.push({
					type: "resoluble",
					content: new ResolubleMacro(e, context),
				});
				continue;
			}

			cur.push(e);
		}

		if (cur.length > 0) {
			this.args.push({
				type: "resoluble",
				content: new ResolubleWrap(cur),
			});
		}
	}

	public poll(): "READY" | "SOME_PROGRESS" | "NO_PROGRESS" {
		if (this.unwrappedResoluble) {
			return this.unwrappedResoluble.poll();
		}

		let someProgressDone = false;
		let someArgNotReady = false;

		const newArgs = [];

		this.args = this.args.map((el) => {
			if (el.type === "plaintext") {
				return el;
			}

			const pollResult = el.content.poll();

			if (pollResult !== "NO_PROGRESS") {
				someProgressDone = true;
			}

			if (pollResult === "READY") {
				return {
					type: "plaintext",
					content: el.content.resolve(),
				};
			}

			someArgNotReady = true;
			return el;
		});

		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		if (!someArgNotReady) {
			const macroEl = this.context.evalMacro(
				this.args.map((el) =>
					el.type === "plaintext" ? el.content : el.content.resolve(),
				),
			);

			if (macroEl.type === "plaintext") {
				this.unwrappedResoluble = new ResolubleText(macroEl.content);
				return "READY";
			} else {
				this.unwrappedResoluble = macroEl.content;
				return this.unwrappedResoluble.poll();
			}
		}

		// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
		if (someProgressDone) {
			return "SOME_PROGRESS";
		}

		return "NO_PROGRESS";
	}

	public resolve(): string {
		if (this.unwrappedResoluble) {
			return this.unwrappedResoluble.resolve();
		} else return "[MACRO UNRESOLVED]";
	}
}

type AstElResoluble = {
	type: "resoluble";
	content: Resoluble;
};

type AstElSep = {
	type: "sep";
	content: ":";
};

type AstEl = AstElPlaintext | AstElMacro | AstElSep | AstElResoluble;

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
					if (
						this.s.length < this.p + 1 ||
						this.s[this.p + 1] !== "}" ||
						!inMacro
					) {
						cur.push("}");
						this.p++;
						continue;
					}

					ret.push({
						type: "plaintext",
						content: cur.join(""),
					});

					this.p += 2;

					return ret;
				}
				case ":": {
					ret.push({
						type: "plaintext",
						content: cur.join(""),
					});

					cur = [];

					ret.push({
						type: "sep",
						content: ":",
					});

					this.p++;
					break;
				}
				case "\\": {
					if (this.s.length < this.p + 1) {
						cur.push("\\");
						this.p++;
						continue;
					}

					cur.push(this.s[this.p + 1]);
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

	private getDate() {
		return this.date.toLocaleDateString("en-US", {
			year: "numeric",
			month: "long",
			day: "numeric",
		});
	}

	private getWeekday() {
		return this.date.toLocaleDateString("en-US", {
			weekday: "long",
		});
	}

	private getTime12() {
		return this.date.toLocaleTimeString("en-US", {
			hour: "numeric",
			minute: "2-digit",
			hour12: true,
		});
	}

	private getTime24() {
		return this.date.toLocaleTimeString("en-US", {
			hour: "numeric",
			minute: "2-digit",
			hour12: false,
		});
	}

	public hasVar(k: string): boolean {
		return this.localVars.has(k);
	}

	public setVar(k: string, v: string) {
		this.localVars.set(k, v);
	}

	public getVar(k: string): string | undefined {
		return this.localVars.get(k);
	}

	public evalMacro(args: string[]): AstElPlaintext | AstElResoluble {
		switch (args[0].trim()) {
			case "time": {
				return {
					type: "plaintext",
					content: this.getTime12(),
				};
			}
			case "time12": {
				return {
					type: "plaintext",
					content: this.getTime12(),
				};
			}
			case "time24": {
				return {
					type: "plaintext",
					content: this.getTime24(),
				};
			}
			case "date": {
				return {
					type: "plaintext",
					content: this.getDate(),
				};
			}
			case "weekday": {
				return {
					type: "plaintext",
					content: this.getWeekday(),
				};
			}
			case "random": {
				return {
					type: "plaintext",
					content: args[Math.ceil(Math.random() * (args.length - 1))],
				};
			}
			case "setvar": {
				if (args.length < 3) {
					return {
						type: "plaintext",
						content: "{{setvar failed: insufficient args}}",
					};
				}

				this.setVar(args[1], args[2]);
				return { type: "plaintext", content: "" };
			}
			case "getvar": {
				if (args.length < 2) {
					return {
						type: "plaintext",
						content: "{{getvar failed: insufficient args}}",
					};
				}

				if (this.hasVar(args[1])) {
					return {
						type: "plaintext",
						content: this.getVar(args[1]) || "",
					};
				}

				return {
					type: "resoluble",
					content: new ResolubleLocalVar(args[1], this),
				};
			}
			default: {
				if (args[0].startsWith("\\")) {
					return {
						type: "plaintext",
						content: "",
					};
				}

				// return plainly what we fail to eval
				return {
					type: "plaintext",
					content: "{{" + args.join(":") + "}}",
				};
			}
		}
	}
}

class MacroManager {
	private context: MacroContext;

	private evalAstEl(el: AstEl): AstElPlaintext | AstElResoluble {
		if (el.type === "plaintext" || el.type === "sep") {
			return {
				type: "plaintext",
				content: el.content,
			};
		}

		if (el.type === "resoluble") {
			return el;
		}

		return {
			type: "resoluble",
			content: new ResolubleMacro(el, this.context),
		};
	}

	public constructor() {
		this.context = new MacroContext();
	}

	public run(s: string): string {
		const ast = AstBuilder.buildAst(s);
		const resoluble = new ResolubleWrap(ast.map((el) => this.evalAstEl(el)));

		for (let i = 0; i < 5; i++) {
			const p = resoluble.poll();
			if (p !== "SOME_PROGRESS") {
				break;
			}
		}

		return resoluble.resolve();
	}
}
