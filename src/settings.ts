/**
 * User settings, declared in package.json `omp.settings` (editable from OMP's
 * plugin settings screen or `omp plugin config omp-copilot-credits --set key=value`).
 * OMP stores only values the user changed, so defaults live here.
 */

export type Visibility = "copilot" | "always";
export type NumberStyle = "exact" | "compact";

export interface CreditsSettings {
	/** `112,660/125,000` */
	showRemaining: boolean;
	/** `420/h` — last hour, all agents */
	showHourly: boolean;
	/** `561/d` — daily average since reset */
	showDaily: boolean;
	/** `~201d` — linear estimate until credits run out */
	showRunway: boolean;
	/** `↻ Oct 1` */
	showReset: boolean;
	/** `exact` → 112,660/125,000; `compact` → 112.7k/125k */
	numberStyle: NumberStyle;
	/** Show only while a Copilot model is active, or whenever the store has data. */
	visibility: Visibility;
	/** `auto`, `premium_interactions`, or `chat`. */
	bucket: string;
}

export const DEFAULT_SETTINGS: CreditsSettings = {
	showRemaining: true,
	showHourly: true,
	showDaily: true,
	showRunway: true,
	showReset: false,
	numberStyle: "exact",
	visibility: "copilot",
	bucket: "auto",
};

function bool(value: unknown, fallback: boolean): boolean {
	if (typeof value === "boolean") return value;
	if (value === "true") return true;
	if (value === "false") return false;
	return fallback;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
	return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Merge stored values over defaults, ignoring anything malformed. Env vars win for `bucket`. */
export function resolveSettings(stored: Record<string, unknown>, env: Record<string, string | undefined> = process.env): CreditsSettings {
	const d = DEFAULT_SETTINGS;
	return {
		showRemaining: bool(stored.showRemaining, d.showRemaining),
		showHourly: bool(stored.showHourly, d.showHourly),
		showDaily: bool(stored.showDaily, d.showDaily),
		showRunway: bool(stored.showRunway, d.showRunway),
		showReset: bool(stored.showReset, d.showReset),
		numberStyle: oneOf(stored.numberStyle, ["exact", "compact"] as const, d.numberStyle),
		visibility: oneOf(stored.visibility, ["copilot", "always"] as const, d.visibility),
		bucket: env.COPILOT_CREDITS_BUCKET ?? oneOf(stored.bucket, ["auto", "premium_interactions", "chat"] as const, "auto"),
	};
}
