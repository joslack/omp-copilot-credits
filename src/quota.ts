/**
 * GitHub Copilot credit snapshots.
 *
 * Copilot reports account-wide quota in two places:
 * - `x-quota-snapshot-<bucket>` headers on every CAPI response
 *   (`crUsed=0&ent=200&ov=0.0&ovPerm=false&rem=100.0&rst=2026-10-01T00%3A00%3A00Z&totRem=200.0`)
 * - `GET https://api.github.com/copilot_internal/user` → `quota_snapshots` (free; no quota consumed)
 *
 * Both are normalised to {@link QuotaSnapshot}. Values are account-wide, so they
 * already include every agent and client spending from the same subscription.
 */

export type BucketId = "premium_interactions" | "chat" | "completions";

export interface BucketSnapshot {
	bucket: BucketId;
	/** Monthly entitlement (e.g. 125000 AI credits). */
	entitlement: number;
	/** Credits left, including any overage allowance. */
	remaining: number;
	unlimited: boolean;
}

export interface QuotaSnapshot {
	/** Epoch ms when this snapshot was observed. */
	observedAt: number;
	/** Epoch ms of the next quota reset, when known. */
	resetAt?: number;
	buckets: Partial<Record<BucketId, BucketSnapshot>>;
}

const HEADER_PREFIX = "x-quota-snapshot-";
const BUCKETS: readonly BucketId[] = ["premium_interactions", "chat", "completions"];

function isBucketId(value: string): value is BucketId {
	return (BUCKETS as readonly string[]).includes(value);
}

function finiteNumber(value: unknown): number | undefined {
	const n = typeof value === "string" ? Number(value) : value;
	return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

function parseDate(value: unknown): number | undefined {
	if (typeof value !== "string" || value.length === 0) return undefined;
	const ms = Date.parse(value);
	return Number.isFinite(ms) ? ms : undefined;
}

/** Parse `x-quota-snapshot-*` response headers. Returns undefined when none are present. */
export function parseQuotaHeaders(headers: Record<string, string>, observedAt: number): QuotaSnapshot | undefined {
	const buckets: QuotaSnapshot["buckets"] = {};
	let resetAt: number | undefined;
	for (const [rawName, value] of Object.entries(headers)) {
		const name = rawName.toLowerCase();
		if (!name.startsWith(HEADER_PREFIX)) continue;
		const bucket = name.slice(HEADER_PREFIX.length);
		if (!isBucketId(bucket)) continue;
		const fields = new URLSearchParams(value);
		const entitlement = finiteNumber(fields.get("ent"));
		const remaining = finiteNumber(fields.get("totRem"));
		if (entitlement === undefined || remaining === undefined) continue;
		buckets[bucket] = { bucket, entitlement, remaining, unlimited: entitlement < 0 };
		resetAt ??= parseDate(fields.get("rst"));
	}
	return Object.keys(buckets).length > 0 ? { observedAt, resetAt, buckets } : undefined;
}

/** Parse the `copilot_internal/user` response body. */
export function parseCopilotUser(body: unknown, observedAt: number): QuotaSnapshot | undefined {
	if (typeof body !== "object" || body === null) return undefined;
	const record = body as Record<string, unknown>;
	const snapshots = record.quota_snapshots;
	if (typeof snapshots !== "object" || snapshots === null) return undefined;
	const buckets: QuotaSnapshot["buckets"] = {};
	for (const bucket of BUCKETS) {
		const detail = (snapshots as Record<string, unknown>)[bucket];
		if (typeof detail !== "object" || detail === null) continue;
		const d = detail as Record<string, unknown>;
		const entitlement = finiteNumber(d.entitlement);
		const remaining = finiteNumber(d.quota_remaining ?? d.remaining);
		if (entitlement === undefined || remaining === undefined) continue;
		buckets[bucket] = { bucket, entitlement, remaining, unlimited: d.unlimited === true };
	}
	if (Object.keys(buckets).length === 0) return undefined;
	return { observedAt, resetAt: parseDate(record.quota_reset_date_utc ?? record.quota_reset_date), buckets };
}

/**
 * The bucket that represents the subscription's AI credits: premium interactions
 * when the plan has any, otherwise chat (Copilot Free). Completions (editor
 * autocomplete) never counts. Override with `COPILOT_CREDITS_BUCKET`.
 */
export function selectBucket(snapshot: QuotaSnapshot, override?: string): BucketSnapshot | undefined {
	if (override && isBucketId(override)) {
		const chosen = snapshot.buckets[override];
		return chosen && !chosen.unlimited ? chosen : undefined;
	}
	const premium = snapshot.buckets.premium_interactions;
	if (premium && !premium.unlimited && premium.entitlement > 0) return premium;
	const chat = snapshot.buckets.chat;
	if (chat && !chat.unlimited && chat.entitlement > 0) return chat;
	return undefined;
}
