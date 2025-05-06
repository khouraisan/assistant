export abstract class Tool {
	protected constructor(public readonly name: string, description: string) {}

	public abstract definition(): Record<string, unknown>;

	public abstract call(input: Record<string, unknown>): Promise<string>;
}
