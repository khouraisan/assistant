import type { AstElMacro } from "./macros-ast.ts";
import type { MacroContext } from "./macros.ts";

/**
 * A Resoluble is anything that can eventually resolve into a string.
 * The obvious example is something like {{varName}}. The variable may not
 * yet exist, but it might eventually, so it's a Resoluble.
 */
export interface Resoluble {
	/**
	 * Indicates whether the Resoluble has already been resolved.
	 * MAY do work on resolving the resoluble, so SHOULD be called N times.
	 */
	poll(): boolean;

	/**
	 * Resolves the Resoluble, coerces it into a string if it hasn't been resolved yet.
	 */
	resolve(): string;

	/**
	 * Flattens the Resoluble into a simpler Resoluble.
	 */
	flatten(): Resoluble;
}

/**
 * Trivial Resoluble, just wraps a string and resolves to it.
 */
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

/**
 * ResolubleArray wraps an array of resolubles to expose a common
 * polling method and a common resolve method (concatenates every
 * individual resolve output).
 */
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
		//resolve and concatenate what we can resolve,
		//flatten what we can't
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

/**
 * A Resoluble wrapper around a macro.
 *
 * The macro may or may not have already been executed and unwrapped
 * into a resoluble, hence "resultResoluble" being nullable.
 *
 * If it has been unwrapped, this object just polls and resolves the
 * resultResoluble. Otherwise, it tries to evaluate the macro until it can
 * unwrap it.
 */
export class ResolubleMacro implements Resoluble {
	private readonly context: MacroContext;

	private macroName: Resoluble;
	private argsResolubles: Resoluble[];
	private resultResoluble: Resoluble | undefined;

	/**
	 * Creates a Resoluble from an AstEl. Intended public way
	 * to create ResolubleMacros.
	 */
	public static fromAstEl(el: AstElMacro, context: MacroContext): Resoluble {
		const args = [];

		let cur: Resoluble[] = [];
		for (const e of el.content) {
			if (e.type === "sep") {
				args.push(new ResolubleArray(cur));
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

		if (args.length === 0) {
			return new ResolubleText("");
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

/**
 * Resoluble around a parsed {{setvar}} macro.
 *
 * Resolves once the variable name has been found. May set the variable name
 * to an impossible to resolve resoluble value, if it's what was supplied.
 *
 * That's not a bug, that's just...yeah.
 */
export class ResolubleSetLocalVar implements Resoluble {
	private readonly varName: Resoluble;
	private readonly varValue: Resoluble;
	private readonly context: MacroContext;

	//avoid setting the var multiple times, just in case
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

/**
 * Resoluble around a parsed {{getvar}} macro.
 *
 * Resolves into the variable once it exists. The value it resolves to
 * may not exist.
 */
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

	//Ensure vars are always resolved as late as possible, to make
	//sure they all have the same value.
	public flatten(): Resoluble {
		return this;
	}
}
