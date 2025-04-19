import { AstBuilder, type AstEl } from "./macros-ast.ts";
import {
	type Resoluble,
	ResolubleArray,
	ResolubleLocalVar,
	ResolubleMacro,
	ResolubleText,
} from "./macros-resolubles.ts";

export function parseMacros(input: string): string {
	console.debug("Invoking parseMacros with arg:", input);

	const m = new MacroManager();
	const output = m.run(input);

	console.debug("parseMacros output: ", output);

	return output;
}

export class MacroContext {
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

	public evalMacro(args: string[]): Resoluble {
		switch (args[0].trim()) {
			case "time": {
				return new ResolubleText(this.getTime12());
			}
			case "time12": {
				return new ResolubleText(this.getTime12());
			}
			case "time24": {
				return new ResolubleText(this.getTime24());
			}
			case "date": {
				return new ResolubleText(this.getDate());
			}
			case "weekday": {
				return new ResolubleText(this.getWeekday());
			}
			case "random": {
				return new ResolubleText(
					args[Math.ceil(Math.random() * (args.length - 1))],
				);
			}
			case "setvar": {
				if (args.length < 3) {
					return new ResolubleText("{{setvar failed: insufficient args}}");
				}

				this.setVar(args[1], args[2]);
				return new ResolubleText("");
			}
			case "getvar": {
				if (args.length < 2) {
					return new ResolubleText("{{getvar failed: insufficient args}}");
				}

				if (this.hasVar(args[1])) {
					// typescript doesn't know the getVar tautologically succeeds
					return new ResolubleText(this.getVar(args[1]) || "");
				}

				return new ResolubleLocalVar(args[1], this);
			}
			default: {
				if (args[0].startsWith("\\")) {
					return new ResolubleText("");
				}

				return new ResolubleText("{{" + args.join(":") + "}}");
			}
		}
	}
}

class MacroManager {
	private readonly context: MacroContext;

	private evalAstEl(el: AstEl): Resoluble {
		if (el.type === "plaintext" || el.type === "sep") {
			return new ResolubleText(el.content);
		}

		return ResolubleMacro.fromAstEl(el, this.context);
	}

	public constructor() {
		this.context = new MacroContext();
	}

	public run(s: string): string {
		const ast = AstBuilder.buildAst(s);
		const resoluble = (new ResolubleArray(ast.map((el) => this.evalAstEl(el)))).flatten();

		for (let i = 0; i < 10; i++) {
			const p = resoluble.poll();
			if (p) {
				break;
			}
		}

		return resoluble.resolve();
	}
}
