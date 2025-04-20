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

	private macroName: Resoluble;
	private argsResolubles: Resoluble[];
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

		return new ResolubleMacro(args[0], args.slice(1), context);
	}

	constructor(macroName: Resoluble, args: Resoluble[], context: MacroContext) {
		this.macroName = macroName;
		this.argsResolubles = args;
		this.context = context;
	}

	public poll(): boolean {
		if (this.resultResoluble) {
			return this.resultResoluble.poll();
		}

		if (this.macroName.poll()) {
			this.resultResoluble = this.context.evalMacro(
				this.macroName.resolve(),
				this.argsResolubles,
			);
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

		return new ResolubleMacro(
			this.macroName.flatten(),
			this.argsResolubles.map((r) => r.flatten()),
			this.context,
		);
	}
}

export class ResolubleSetLocalVar implements Resoluble {
	private readonly varName: Resoluble;
	private readonly varValue: Resoluble;
	private readonly context: MacroContext;

	private resolvedOnce: boolean;

	constructor(varName: Resoluble, varValue: Resoluble, context: MacroContext) {
		this.varName = varName;
		this.varValue = varValue;
		this.context = context;

		this.resolvedOnce = false;
	}

	public poll() {
		if (this.resolvedOnce) {
			return true;
		}

		if (!this.varName.poll()) {
			return false;
		}

		this.context.setVar(this.varName.resolve(), this.varValue);
		this.resolvedOnce = true;
		return true;
	}

	public resolve(): string {
		return this.resolvedOnce
			? ""
			: "[FAILED TO RESOLVE SETVAR:" +
					this.varName.resolve() +
					":" +
					this.varValue.resolve() +
					"]";
	}

	public flatten(): Resoluble {
		if (this.poll()) {
			return new ResolubleText("");
		}

		return this;
	}
}

export class ResolubleGetLocalVar implements Resoluble {
	private readonly varName: Resoluble;
	private readonly context: MacroContext;

	constructor(varName: Resoluble, context: MacroContext) {
		this.varName = varName;
		this.context = context;
	}

	public poll() {
		if (!this.varName.poll()) {
			return false;
		}

		if (!this.context.hasVar(this.varName.resolve())) {
			return false;
		}

		return this.context.getVar(this.varName.resolve()).poll();
	}

	public resolve(): string {
		if (!this.varName.poll()) {
			return "[UNRESOLVED VARNAME]";
		}

		if (!this.context.hasVar(this.varName.resolve())) {
			return "[UNRESOLVED VAR " + this.varName.resolve() + "]";
		}

		return this.context.getVar(this.varName.resolve()).resolve();
	}

	public flatten(): Resoluble {
		if (this.poll()) {
			return new ResolubleText(this.resolve());
		}

		return this;
	}
}
