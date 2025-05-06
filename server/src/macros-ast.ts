/**
 * Plaintext segment in the text.
 */
export type AstElPlaintext = {
	type: "plaintext";
	content: string;
};

/**
 * Macro in the text. May contain multiple or no AstEls in its content.
 */
export type AstElMacro = {
	type: "macro";
	content: Array<AstEl>;
};

/**
 * We use : as the only acceptable separator because the alternative is
 * confusing. Changing the separator per macro is weird.
 * ST is weird.
 */
type AstElSep = {
	type: "sep";
	content: ":";
};

export type AstEl = AstElPlaintext | AstElMacro | AstElSep;

/**
 * Single-Use AST builder. Not intended for reuse or
 * storage.
 */
export class AstBuilder {
	public static buildAst(s: string) {
		const astBuilder = new AstBuilder(s);
		return astBuilder.buildAstRecursively();
	}

	// position the parser is currently at
	// STAYS the same on recursive calls (intentional)
	private p: number;
	// string we're parsing split into codepoints
	// muh funny js utf-16 stuff
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
