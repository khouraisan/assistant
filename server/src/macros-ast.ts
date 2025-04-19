export type AstElPlaintext = {
	type: "plaintext";
	content: string;
};

export type AstElMacro = {
	type: "macro";
	content: Array<AstEl>;
};

type AstElSep = {
	type: "sep";
	content: ":";
};

export type AstEl = AstElPlaintext | AstElMacro | AstElSep;

export class AstBuilder {
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
