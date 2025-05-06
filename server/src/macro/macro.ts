import {AstBuilder, type AstEl} from "./macro-ast.ts";
import {
	type Resoluble,
	ResolubleArray,
	ResolubleGetLocalVar,
	ResolubleMacro,
	ResolubleSetLocalVar,
	ResolubleText,
} from "./macro-resolubles.ts";

/**
 * Current main exported function for compatibility with
 * khouraisan's previous code (also to make the PR easier to read
 * and more focused)
 *
 * Should be replaced later (I don't wanna do the replacing) (trivial, though)
 */
export function parseMacros(input: string): string {
	console.debug("Invoking parseMacros with arg:", input);

	const m = new MacroManager();
	const output = m.run(input);

	console.debug("parseMacros output: ", output);

	return output;
}

/**
 * Context object for serial macro parsing and execution.
 *
 * May be passed around into Resolubles if they rely on the
 * context to resolve.
 *
 * Probably should have some sort of GlobalContext thingy
 * passed into it for global vars.
 */
export class MacroContext {
	private readonly date: Date;
	private readonly locale: Intl.Locale;
	private readonly constants: Map<string, string>;
	private readonly localVars: Map<string, Resoluble>;

	constructor() {
		this.date = new Date();
		this.locale = new Intl.Locale("en-US");
		this.constants = new Map();
		this.localVars = new Map();
	}

	private getDate() {
		return this.date.toLocaleDateString(this.locale, {
			year: "numeric",
			month: "long",
			day: "numeric",
		});
	}

	private getWeekday() {
		return this.date.toLocaleDateString(this.locale, {
			weekday: "long",
		});
	}

	private getTime12() {
		return this.date.toLocaleTimeString(this.locale, {
			hour: "numeric",
			minute: "2-digit",
			hour12: true,
		});
	}

	private getTime24() {
		return this.date.toLocaleTimeString(this.locale, {
			hour: "numeric",
			minute: "2-digit",
			hour12: false,
		});
	}

	public hasVar(k: string): boolean {
		return this.localVars.has(k);
	}

	public setVar(k: string, v: Resoluble) {
		this.localVars.set(k, v);
	}

	public getVar(k: string): Resoluble {
		return this.localVars.get(k) || new ResolubleText("[FAILED TO RESOLVE LOCALVAR " + k + "]");
	}

	/**
	 * Evaluates a macro once its name has been resolved.
	 *
	 * ASSUMES macros CAN be resolved with just the name and its
	 * args as Resolubles. See the getvar and setvar Resoluble
	 * impls for examples on how to add in new stateful
	 * macros.
	 */
	public evalMacro(macroName: string, args: Resoluble[]): Resoluble {
		switch (macroName) {
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
				return args[Math.floor(Math.random() * args.length)];
			}
			case "setvar": {
				if (args.length < 2) {
					return new ResolubleText("[FAILED TO RESOLVE SETVAR: INSUFFICIENT ARGUMENTS]");
				}

				return new ResolubleSetLocalVar(args[0], args[1], this);
			}
			case "getvar": {
				if (args.length < 1) {
					return new ResolubleText("[FAILED TO RESOLVE GETVAR: INSUFFICIENT ARGUMENTS]");
				}

				return new ResolubleGetLocalVar(args[0], this);
			}
			default: {
				if (macroName.startsWith("\\")) {
					return new ResolubleText("");
				}

				return new ResolubleArray([new ResolubleText("{{" + macroName + ":"), ...args, new ResolubleText("}}")]);
			}
		}
	}
}

/**
 * MacroManager object meant to wrap around a context and expose a simpler API
 * for running macros.
 */
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
		const resoluble = new ResolubleArray(ast.map((el) => this.evalAstEl(el)));

		for (let i = 0; i < 10; i++) {
			const p = resoluble.poll();
			if (p) {
				break;
			}
		}

		return resoluble.resolve();
	}

	/*
	// final API should be like

	public toResoluble(s: string): Resoluble {
		const ast = AstBuilder.buildAst(s);
		return new ResolubleArray(ast.map(el => this.evalAstEl(el)));
	}

	public runOnMessageArray(ms: Message[]): Message[] {
		const rs = ms.map(m => {
		  m: m,
		  resoluble: this.toResoluble(m.content),
		});

		for (let i = 0; i < 10; i++) {
			if (!rs.map(r => r.resoluble.poll()).some(p => !p)) {
				break;
			}
		}

		return rs.map(r => {
			const m = r.m;
			m.content = r.resoluble.resolve();
			return m;
		});
	}

	// or something similar to poll/resolve all messages together with the same ctx
	 */
}
