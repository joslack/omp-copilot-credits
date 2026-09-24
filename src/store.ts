/**
 * Cross-process snapshot store.
 *
 * Every OMP process that sees a Copilot response writes the snapshot here, and
 * every process renders from it, so concurrent agents share one view of the
 * account and one burn-rate history.
 */
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { QuotaSnapshot } from "./quota";

export interface StoreState {
	version: 1;
	latest?: QuotaSnapshot;
	/** Oldest first; account-wide used credits per observation, for burn rate. */
	history: Array<{ at: number; used: number; resetAt?: number }>;
}

/** Keep enough history to compute the hourly rate, plus slack. */
const HISTORY_WINDOW_MS = 3 * 60 * 60 * 1000;
const HISTORY_MAX_ENTRIES = 2000;

export function defaultStorePath(): string {
	const agentDir = process.env.PI_CODING_AGENT_DIR ?? path.join(os.homedir(), ".omp", "agent");
	return path.join(agentDir, "copilot-credits.json");
}

function emptyState(): StoreState {
	return { version: 1, history: [] };
}

export async function readStore(file: string): Promise<StoreState> {
	try {
		const parsed = (await Bun.file(file).json()) as StoreState;
		if (parsed?.version !== 1 || !Array.isArray(parsed.history)) return emptyState();
		return parsed;
	} catch {
		return emptyState();
	}
}

/**
 * Merge a snapshot into the store. Older-than-latest snapshots are ignored for
 * `latest` (another process may already have written a newer one) but still
 * land in history, so no process clobbers another's observation.
 */
export function mergeSnapshot(state: StoreState, snapshot: QuotaSnapshot, used: number | undefined): StoreState {
	const latest =
		state.latest === undefined || snapshot.observedAt >= state.latest.observedAt ? snapshot : state.latest;
	let history = state.history;
	if (used !== undefined) {
		history = [...history, { at: snapshot.observedAt, used, resetAt: snapshot.resetAt }].sort((a, b) => a.at - b.at);
	}
	const cutoff = latest.observedAt - HISTORY_WINDOW_MS;
	history = history.filter(entry => entry.at >= cutoff).slice(-HISTORY_MAX_ENTRIES);
	return { version: 1, latest, history };
}

/**
 * Read-merge-write with an atomic rename, so concurrent writers never leave a
 * torn file. Two processes racing can drop one history point; the next
 * response from either restores `latest`, and the rate tolerates gaps.
 */
export async function recordSnapshot(file: string, snapshot: QuotaSnapshot, used: number | undefined): Promise<StoreState> {
	const next = mergeSnapshot(await readStore(file), snapshot, used);
	const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
	await Bun.write(tmp, JSON.stringify(next));
	await fs.rename(tmp, file);
	return next;
}
