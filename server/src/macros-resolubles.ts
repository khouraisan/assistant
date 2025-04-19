import type { AstElMacro } from "./macros-ast.ts";
import type { MacroContext } from "./macros.ts";

export interface Resoluble {
	//indicates whether the macro has already been resolved
	poll(): boolean;

	//resolves the macro into a string, undefined if it fails to resolve
	resolve(): string;

	//flattens the current resoluble into a simpler resoluble
	flatten(): Resoluble;
}

export class ResolubleText implements Resoluble {
	private readonly s: string;

	constructor(s: string) {
		this.s = s;
	}

	public poll() {
		return true;
	}

	public resolve(): string {
		return this.s;
	}

	public flatten(): Resoluble {
		return this;
	}
}

export class ResolubleArray implements Resoluble {
	private readonly rs: Resoluble[];

	public constructor(rs: Resoluble[]) {
		this.rs = rs;
	}

	public poll(): boolean {
		//Reminder this is supposed to .map and .poll all array els,
		//this should not be replaced with a for loop
		return !this.rs.map((r) => r.poll()).some((p) => !p);
	}

	public resolve(): string {
		return this.rs.map((r) => r.resolve()).join("");
	}

	public resolveToArray(): string[] {
		return this.rs.map((r) => r.resolve());
	}

	public flatten(): ResolubleArray {
		const ret: Resoluble[] = [];
		let cur: string[] = [];

		for (const r of this.rs) {
			if (r.poll()) {
				cur.push(r.resolve());
			} else {
				ret.push(new ResolubleText(cur.join("")));
				ret.push(r.flatten());
				cur = [];
			}
		}

		if (cur.length > 0) {
			ret.push(new ResolubleText(cur.join("")));
		}

		return new ResolubleArray(ret);
	}
}

export class ResolubleMacro implements Resoluble {
	private readonly context: MacroContext;

	private argsResoluble: ResolubleArray;
	private resultResoluble: Resoluble | undefined;

	public static fromAstEl(
		el: AstElMacro,
		context: MacroContext,
	): ResolubleMacro {
		const args = [];

		let cur: Resoluble[] = [];
		for (const e of el.content) {
			if (e.type === "sep") {
				if (cur.length > 0) {
					args.push(new ResolubleArray(cur));
				}

				cur = [];
				continue;
			}

			if (e.type === "macro") {
				cur.push(ResolubleMacro.fromAstEl(e, context));
				continue;
			}

			cur.push(new ResolubleText(e.content));
		}

		if (cur.length > 0) {
			args.push(new ResolubleArray(cur));
		}

		return new ResolubleMacro(new ResolubleArray(args), context);
	}

	constructor(args: ResolubleArray, context: MacroContext) {
		this.argsResoluble = args;
		this.context = context;
	}

	public poll(): boolean {
		if (this.resultResoluble) {
			return this.resultResoluble.poll();
		}

		if (this.argsResoluble.poll()) {
			const args = this.argsResoluble.resolveToArray();
			this.resultResoluble = this.context.evalMacro(args);
			return this.resultResoluble.poll();
		}

		return false;
	}

	public resolve(): string {
		if (this.resultResoluble) {
			return this.resultResoluble.resolve();
		} else return "[MACRO UNRESOLVED]";
	}

	public flatten(): ResolubleMacro {
		if (this.resultResoluble) {
			return this;
		}

		return new ResolubleMacro(this.argsResoluble.flatten(), this.context);
	}
}

export class ResolubleLocalVar implements Resoluble {
	private readonly varName: string;
	private readonly context: MacroContext;

	constructor(varName: string, context: MacroContext) {
		this.varName = varName;
		this.context = context;
	}

	public poll() {
		return this.context.hasVar(this.varName);
	}

	public resolve(): string {
		return (
			this.context.getVar(this.varName) ||
			"[UNRESOLVED VAR " + this.varName + "]"
		);
	}

	public flatten(): Resoluble {
		if (this.poll()) {
			return new ResolubleText(this.resolve());
		}

		return this;
	}
}
