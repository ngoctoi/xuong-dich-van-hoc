import fs from 'fs';
import path from 'path';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { createRequestId, KeyAttemptTrace, logger } from './logger';
import {
  DEFAULT_THINKING_LEVEL,
  THINKING_LEVEL_OPTIONS,
  ThinkingLevelMeta,
  ThinkingLevelOption,
} from './types';

export interface KeyPoolSlot {
  index: number;
  sourceEnv: string;
  apiKey: string;
  maskedKey: string;
  cooldownUntil: number;
  modelCooldowns: Record<string, number>;
  invalidKey: boolean;
  activeRequests: number; // Number of concurrent chapters/requests actively using this key right now
  totalRequests: number;
  rateLimitHits: number;
  lastUsedAt: number;
  lastLatencyMs?: number;
  lastCheckedAt?: number;
  lastError?: string;
}

export interface KeySlotSummary {
  index: number;
  sourceEnv: string;
  maskedKey: string;
  status: 'ready' | 'in_use' | 'cooldown' | 'invalid';
  activeRequests: number;
  cooldownRemainingSec: number;
  totalRequests: number;
  rateLimitHits: number;
  lastLatencyMs?: number;
  lastCheckedAt?: number;
  lastError?: string;
}

export interface ApiEndpointCheckResult {
  endpoint: string;
  method: 'GET' | 'POST';
  name: string;
  description: string;
  status: 'ok' | 'warning' | 'error';
  latencyMs: number;
  detail: string;
}

export interface KeyHealthCheckResult {
  index: number;
  sourceEnv: string;
  maskedKey: string;
  status: 'ready' | 'cooldown' | 'invalid';
  latencyMs: number;
  modelTested: string;
  flashLiteReady?: boolean;
  message: string;
}

const MAX_KEYS = 50;
const DEFAULT_COOLDOWN_MS = 60_000;
const LEGACY_PROJECT_KEY_STORE_FILE = path.join(
  process.cwd(),
  'data',
  'project-key-pool.json'
);

// Strictly prevent @google/genai SDK from ever implicitly falling back to any container-injected environment key
try {
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  delete process.env.GEMINI_API_KEYS;
} catch {
  // Ignore if process.env is immutable in current runtime
}

// Clean up any legacy server-side key file if one ever existed
try {
  if (fs.existsSync(LEGACY_PROJECT_KEY_STORE_FILE)) {
    fs.unlinkSync(LEGACY_PROJECT_KEY_STORE_FILE);
  }
} catch {
  // Ignore filesystem cleanup errors
}

function maskApiKey(key: string): string {
  const clean = key.trim();
  if (clean.length <= 10) return '********';
  return `${clean.slice(0, 6)}...${clean.slice(-4)}`;
}

export function decodeClientKeysHeader(encodedHeader?: string | null): string {
  if (!encodedHeader || !encodedHeader.trim()) return '';
  try {
    const decoded = Buffer.from(encodedHeader.trim(), 'base64').toString('utf-8');
    return decodeURIComponent(decoded).trim();
  } catch {
    return '';
  }
}

function parseRetryAfterMs(errorMessage: string): number {
  // Parse patterns like "retry in 4h3m49s", "retry in 45s", "retry in 12m30s"
  const hmsMatch = errorMessage.match(
    /retry in\s*(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+(?:\.\d+)?)s)?/i
  );
  if (hmsMatch && (hmsMatch[1] || hmsMatch[2] || hmsMatch[3])) {
    const hours = parseInt(hmsMatch[1] || '0', 10);
    const mins = parseInt(hmsMatch[2] || '0', 10);
    const secs = parseFloat(hmsMatch[3] || '0');
    const totalMs = (hours * 3600 + mins * 60 + secs) * 1000;
    if (totalMs > 0) {
      // Cap automatic lock at 30 minutes so user can still retry if quota resets
      return Math.min(totalMs, 30 * 60_000);
    }
  }
  return DEFAULT_COOLDOWN_MS;
}

function normalizeModelBucket(model?: string): string {
  const m = (model || 'gemini-flash-latest').trim().toLowerCase();
  if (m === 'gemini-flash-latest' || m === 'gemini-3.8-flash') {
    return 'gemini-3.8-flash';
  }
  return m;
}

class ServerGeminiKeyPool {
  private slots: KeyPoolSlot[] = [];
  private slotRegistry = new Map<string, KeyPoolSlot>();
  private roundRobinCursor = 0;
  private initialized = true;
  private savedProjectRawKeys = '';

  public getSavedProjectKeysRaw(): string {
    return this.savedProjectRawKeys;
  }

  /**
   * Synchronizes the active key pool strictly from the keys provided by the current user's browser
   * (`X-MHC-User-Keys` header or explicit `overrideRawKeys` payload).
   * Never reads from `process.env` or server disk, ensuring zero built-in keys and zero cross-user leakage.
   */
  public syncFromRequest(
    req?: { headers?: { get(name: string): string | null } },
    overrideRawKeys?: string
  ): { savedCount: number; totalPoolKeys: number } {
    const headerEncoded = req?.headers?.get('x-mhc-user-keys');
    const rawToUse =
      overrideRawKeys !== undefined
        ? overrideRawKeys
        : headerEncoded !== null && headerEncoded !== undefined
          ? decodeClientKeysHeader(headerEncoded)
          : '';
    return this.saveProjectKeysToDisk(rawToUse);
  }

  public saveProjectKeysToDisk(rawKeysText: string): {
    savedCount: number;
    totalPoolKeys: number;
  } {
    const cleanedLines = (rawKeysText || '')
      .split(/[\r\n,;]+/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));

    const normalizedRaw = cleanedLines.join('\n');
    this.savedProjectRawKeys = normalizedRaw;

    this.refreshFromEnv();
    return {
      savedCount: this.slots.length,
      totalPoolKeys: this.slots.length,
    };
  }

  /**
   * Parse multi-line or comma-separated lists of keys or KEY=VALUE lines.
   * Allows pasting up to 50 lines (1 variable or 1 key per line).
   */
  private extractKeysFromRawString(
    raw: string,
    labelPrefix: string,
    seen: Set<string>,
    out: KeyPoolSlot[]
  ) {
    if (!raw || !raw.trim()) return;
    const lines = raw
      .split(/[\r\n,;]+/)
      .map((l) => l.trim())
      .filter(Boolean);

    let localCounter = 0;
    for (const line of lines) {
      if (out.length >= MAX_KEYS) break;
      if (line.startsWith('#')) continue;

      let candidate = line;
      const eqIdx = line.indexOf('=');
      if (eqIdx !== -1) {
        candidate = line.slice(eqIdx + 1).trim();
      }
      candidate = candidate.replace(/^["']|["']$/g, '').trim();

      if (
        candidate &&
        candidate.length >= 16 &&
        candidate !== 'MY_GEMINI_API_KEY' &&
        !seen.has(candidate)
      ) {
        seen.add(candidate);
        localCounter += 1;
        out.push({
          index: out.length + 1,
          sourceEnv: `${labelPrefix}#${localCounter}`,
          apiKey: candidate,
          maskedKey: maskApiKey(candidate),
          cooldownUntil: 0,
          modelCooldowns: {},
          invalidKey: false,
          activeRequests: 0,
          totalRequests: 0,
          rateLimitHits: 0,
          lastUsedAt: 0,
        });
      }
    }
  }

  public refreshFromEnv(): void {
    const seen = new Set<string>();
    const nextSlots: KeyPoolSlot[] = [];

    // ONLY load keys explicitly provided by the user in their browser session.
    // Built-in environment variables (process.env.GEMINI_API_KEY, GEMINI_API_KEYS, GEMINI_API_KEY_1..50)
    // and server disk files are intentionally NEVER loaded so every user must add their own keys.
    if (this.savedProjectRawKeys) {
      this.extractKeysFromRawString(
        this.savedProjectRawKeys,
        'USER_KEY',
        seen,
        nextSlots
      );
    }

    // Preserve in-flight activeRequests, stats, and cooldowns in slotRegistry for keys that already existed
    this.slots = nextSlots.slice(0, MAX_KEYS).map((slot, idx) => {
      const existing = this.slotRegistry.get(slot.apiKey);
      if (existing) {
        existing.index = idx + 1;
        existing.sourceEnv = slot.sourceEnv;
        existing.maskedKey = slot.maskedKey;
        return existing;
      }
      const created = { ...slot, index: idx + 1 };
      this.slotRegistry.set(slot.apiKey, created);
      return created;
    });

    this.initialized = true;
  }

  public resetAllCooldowns(): void {
    if (!this.initialized) this.refreshFromEnv();
    for (const slot of this.slots) {
      slot.cooldownUntil = 0;
      slot.modelCooldowns = {};
      slot.invalidKey = false;
      slot.lastError = undefined;
    }
  }

  private getSlotCooldownUntil(slot: KeyPoolSlot, model?: string): number {
    if (!model) return slot.cooldownUntil;
    const bucket = normalizeModelBucket(model);
    return slot.modelCooldowns[bucket] || 0;
  }

  private setSlotCooldown(
    slot: KeyPoolSlot,
    durationMs: number,
    model?: string,
    errorMsg?: string
  ): void {
    const until = Date.now() + durationMs;
    slot.cooldownUntil = Math.max(slot.cooldownUntil, until);
    if (model) {
      const bucket = normalizeModelBucket(model);
      slot.modelCooldowns[bucket] = until;
    }
    if (errorMsg) {
      slot.lastError = errorMsg;
    }
  }

  public getPoolStatus(activeModel?: string) {
    if (!this.initialized) this.refreshFromEnv();
    const now = Date.now();
    const total = this.slots.length;

    const slotsSummary: KeySlotSummary[] = this.slots.map((s) => {
      const cdUntil = activeModel
        ? this.getSlotCooldownUntil(s, activeModel)
        : s.cooldownUntil;
      const isCooling = cdUntil > now;
      const status: KeySlotSummary['status'] = s.invalidKey
        ? 'invalid'
        : isCooling
          ? 'cooldown'
          : s.activeRequests > 0
            ? 'in_use'
            : 'ready';
      return {
        index: s.index,
        sourceEnv: s.sourceEnv,
        maskedKey: s.maskedKey,
        status,
        activeRequests: s.activeRequests,
        cooldownRemainingSec: isCooling ? Math.ceil((cdUntil - now) / 1000) : 0,
        totalRequests: s.totalRequests,
        rateLimitHits: s.rateLimitHits,
        lastLatencyMs: s.lastLatencyMs,
        lastCheckedAt: s.lastCheckedAt,
        lastError: s.lastError,
      };
    });

    const invalidCount = slotsSummary.filter((s) => s.status === 'invalid').length;
    const coolingDown = slotsSummary.filter((s) => s.status === 'cooldown').length;
    const inUse = slotsSummary.filter((s) => s.status === 'in_use').length;
    const idleReady = slotsSummary.filter((s) => s.status === 'ready').length;
    const ready = idleReady + inUse;

    return {
      maxSupportedKeys: MAX_KEYS,
      maxConcurrency: 10,
      totalConfiguredKeys: total,
      readyKeys: ready,
      idleReadyKeys: idleReady,
      inUseKeys: inUse,
      coolingDownKeys: coolingDown,
      invalidKeys: invalidCount,
      hasProjectSavedKeys: Boolean(this.savedProjectRawKeys.trim()),
      projectSavedKeyCount: this.savedProjectRawKeys
        ? this.savedProjectRawKeys.split(/\r?\n/).filter(Boolean).length
        : 0,
      slotsSummary,
    };
  }

  /**
   * Acquires and locks a key slot for a single chapter/request attempt:
   * - Priority 1 (Dedicated 1-key-per-thread + Idle Rotation):
   *   Finds the next key in round-robin order that is IDLE (`activeRequests === 0`),
   *   VALID (`!invalidKey`), NOT cooling down for `model`, and NOT yet tried by this request.
   * - Priority 2 (Idle & Ready even if previously tried in this call)
   * - Priority 3 (When total configured keys < active threads):
   *   Picks a non-cooldown key with the lowest `activeRequests` count (preferring untried).
   * - Priority 4 (When all keys are in 429 cooldown):
   *   Prefers an IDLE (`activeRequests === 0`) slot whose cooldown for `model` expires soonest.
   */
  private acquireSlot(triedIndices: Set<number>, model?: string): KeyPoolSlot {
    if (!this.initialized || this.slots.length === 0) {
      this.refreshFromEnv();
    }
    if (this.slots.length === 0) {
      throw new Error(
        'Chưa có API Key nào trong Bể Key! Vui lòng mở mục [Preset & Model → Bể 50 Key & Kiểm Tra API] để dán danh sách Gemini API Key của bạn vào rồi bấm Lưu trước khi dịch.'
      );
    }

    const now = Date.now();
    const count = this.slots.length;

    const isSlotReadyForModel = (slot: KeyPoolSlot) =>
      !slot.invalidKey && this.getSlotCooldownUntil(slot, model) <= now;

    // Pass 1: Strictly IDLE (activeRequests === 0), READY (not in cooldown), and UNTRIED in this request
    for (let offset = 0; offset < count; offset++) {
      const idx = (this.roundRobinCursor + offset) % count;
      const slot = this.slots[idx];
      if (
        slot.activeRequests === 0 &&
        isSlotReadyForModel(slot) &&
        !triedIndices.has(slot.index)
      ) {
        this.roundRobinCursor = (idx + 1) % count;
        slot.activeRequests += 1;
        slot.totalRequests += 1;
        slot.lastUsedAt = now;
        return slot;
      }
    }

    // Pass 2: Strictly IDLE (activeRequests === 0) and READY (not in cooldown), even if tried earlier
    for (let offset = 0; offset < count; offset++) {
      const idx = (this.roundRobinCursor + offset) % count;
      const slot = this.slots[idx];
      if (slot.activeRequests === 0 && isSlotReadyForModel(slot)) {
        this.roundRobinCursor = (idx + 1) % count;
        slot.activeRequests += 1;
        slot.totalRequests += 1;
        slot.lastUsedAt = now;
        return slot;
      }
    }

    // Pass 3: Fallback only if user configured fewer keys than concurrent threads.
    // Pick a READY (not in cooldown) slot with the lowest activeRequests, preferring untried slots.
    let bestReadySlot: KeyPoolSlot | null = null;
    for (let offset = 0; offset < count; offset++) {
      const idx = (this.roundRobinCursor + offset) % count;
      const slot = this.slots[idx];
      if (isSlotReadyForModel(slot)) {
        if (!bestReadySlot) {
          bestReadySlot = slot;
        } else {
          const slotUntried = !triedIndices.has(slot.index);
          const bestUntried = !triedIndices.has(bestReadySlot.index);
          if (slotUntried && !bestUntried) {
            bestReadySlot = slot;
          } else if (
            slotUntried === bestUntried &&
            slot.activeRequests < bestReadySlot.activeRequests
          ) {
            bestReadySlot = slot;
          }
        }
      }
    }

    if (bestReadySlot) {
      this.roundRobinCursor = bestReadySlot.index % count;
      bestReadySlot.activeRequests += 1;
      bestReadySlot.totalRequests += 1;
      bestReadySlot.lastUsedAt = now;
      return bestReadySlot;
    }

    // Pass 4: All keys are in cooldown — pick the non-invalid IDLE key whose cooldown for `model` expires soonest
    const candidates = this.slots.filter((s) => !s.invalidKey);
    const poolToSearch = candidates.length > 0 ? candidates : this.slots;
    let earliestSlot = poolToSearch[0];
    for (const s of poolToSearch) {
      const sIdle = s.activeRequests === 0;
      const earliestIdle = earliestSlot.activeRequests === 0;
      const sCd = this.getSlotCooldownUntil(s, model);
      const earliestCd = this.getSlotCooldownUntil(earliestSlot, model);
      if (sIdle && !earliestIdle) {
        earliestSlot = s;
      } else if (sIdle === earliestIdle && sCd < earliestCd) {
        earliestSlot = s;
      }
    }
    this.roundRobinCursor = earliestSlot.index % count;
    earliestSlot.activeRequests += 1;
    earliestSlot.totalRequests += 1;
    earliestSlot.lastUsedAt = now;
    return earliestSlot;
  }

  private releaseSlot(slot: KeyPoolSlot): void {
    slot.activeRequests = Math.max(0, slot.activeRequests - 1);
  }

  /**
   * Checks whether there is at least one non-invalid key whose cooldown for `model`
   * has expired (or expires within `graceMs`) and hasn't been tried yet in `triedIndices`.
   */
  private hasUntriedReadyKey(
    triedIndices: Set<number>,
    model?: string,
    graceMs = 2000
  ): boolean {
    const now = Date.now();
    return this.slots.some(
      (s) =>
        !s.invalidKey &&
        !triedIndices.has(s.index) &&
        this.getSlotCooldownUntil(s, model) <= now + graceMs
    );
  }

  /**
   * Execute a Gemini operation with:
   * 1. Dedicated 1-key-per-concurrent-thread locking (`activeRequests` tracking so 10 threads use 10 distinct keys).
   * 2. Failover rotation across ALL idle (non-in-flight, non-cooldown) keys in the 50-key pool.
   * 3. Per-attempt timeout (`200s`) so a hung Google socket never blocks until the 300s gateway cutoff.
   * 4. Smart "Sợi dây 1" Time Budget (`FRESH_PIPE_THRESHOLD_MS = 35s`): if an attempt fails after >= 35s and another key is available, signals `[CLIENT_RETRY_FRESH_PIPE]` so the browser opens a fresh HTTP request (resetting the 300s proxy clock to 0s).
   * 5. Client `AbortSignal` propagation (`traceContext?.signal`) to prevent ghost requests holding onto key slots.
   */
  public async executeWithKeyRotation<T>(
    operation: (
      ai: GoogleGenAI,
      slotInfo: { keyIndex: number; totalKeys: number; activeModel: string }
    ) => Promise<T>,
    model?: string,
    fallbackModel?: string,
    traceContext?: {
      reqId?: string;
      endpoint?: string;
      label?: string;
      signal?: AbortSignal;
    }
  ): Promise<{
    result: T;
    keyIndexUsed: number;
    totalKeys: number;
    modelUsed: string;
    didFallback: boolean;
    attempts: KeyAttemptTrace[];
    totalDurationMs: number;
  }> {
    if (!this.initialized) this.refreshFromEnv();
    const reqId = traceContext?.reqId || createRequestId('keypool');
    const clientSignal = traceContext?.signal;
    const opStartMs = Date.now();
    const attempts: KeyAttemptTrace[] = [];

    // Per-attempt timeout (200s) and Fresh-Pipe threshold (35s)
    const PER_ATTEMPT_TIMEOUT_MS = 200_000;
    const FRESH_PIPE_THRESHOLD_MS = 35_000;

    if (this.slots.length === 0) {
      logger.error(
        'KEY_POOL',
        `✖ Từ chối thực thi (${traceContext?.endpoint || 'API'}) vì Bể Key đang trống (0 Key).`,
        { reqId, endpoint: traceContext?.endpoint },
        reqId
      );
      throw new Error(
        'Chưa có API Key nào trong Bể Key! Vui lòng mở mục [Preset & Model → Bể 50 Key & Kiểm Tra API] để dán danh sách Gemini API Key của bạn vào rồi bấm Lưu trước khi dịch.'
      );
    }

    const primaryModel = (model || 'gemini-flash-latest').trim();
    const cleanFallback = (fallbackModel || '').trim();
    const modelsToTry =
      cleanFallback &&
      normalizeModelBucket(cleanFallback) !== normalizeModelBucket(primaryModel)
        ? [primaryModel, cleanFallback]
        : [primaryModel];

    const totalKeys = Math.max(1, this.slots.length);
    let lastError: unknown = null;
    let sawRateLimitOnAllAttempts = false;

    const triggerFreshPipeIfNeeded = (reasonLabel: string, hasMoreKeysOrModels: boolean) => {
      const elapsedTotalMs = Date.now() - opStartMs;
      if (hasMoreKeysOrModels && elapsedTotalMs >= FRESH_PIPE_THRESHOLD_MS) {
        const freshPipeErr = new Error(
          `[CLIENT_RETRY_FRESH_PIPE] Đã dùng ${(elapsedTotalMs / 1000).toFixed(1)}s trên kết nối hiện tại (${reasonLabel}). Tự động làm mới kết nối (Reset đồng hồ 300s về 0s) để xoay sang Key tiếp theo...`
        ) as Error & {
          retryableFreshPipe?: boolean;
          attempts?: KeyAttemptTrace[];
          totalDurationMs?: number;
        };
        freshPipeErr.retryableFreshPipe = true;
        freshPipeErr.attempts = attempts;
        freshPipeErr.totalDurationMs = elapsedTotalMs;
        logger.warn(
          'KEY_POOL',
          `🔄 [Làm mới Sợi dây 1] Đã trôi qua ${(elapsedTotalMs / 1000).toFixed(1)}s (${reasonLabel}) → Đóng Sợi dây 1 cũ để Trình duyệt mở Sợi dây 1 mới (Reset đồng hồ 300s về 0s) cho Key kế tiếp!`,
          {
            reqId,
            elapsedTotalMs,
            attemptsCount: attempts.length,
          },
          reqId,
          elapsedTotalMs
        );
        throw freshPipeErr;
      }
    };

    for (let mIdx = 0; mIdx < modelsToTry.length; mIdx++) {
      const targetModel = modelsToTry[mIdx];
      const isFallbackPass = mIdx > 0;
      const maxAttempts = totalKeys;
      const triedIndices = new Set<number>();
      let rateLimitHitsInPass = 0;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (clientSignal?.aborted) {
          const abortErr = new Error('Đã hủy yêu cầu từ phía trình duyệt (AbortSignal).');
          abortErr.name = 'AbortError';
          throw abortErr;
        }

        // Stop Pass 4 spinning: if we already tried at least 1 key in this pass and NO untried key is ready (all remaining keys are in 429 cooldown > 2s), break immediately!
        if (attempt > 0 && !this.hasUntriedReadyKey(triedIndices, targetModel, 2000)) {
          logger.warn(
            'KEY_POOL',
            `⏸ Dừng xoay vòng trên model=${targetModel} sau ${attempt} lần thử vì tất cả các Key còn lại trong bể đều đang trong thời gian chờ Cooldown 429.`,
            { reqId, targetModel, triedCount: triedIndices.size, totalKeys },
            reqId
          );
          break;
        }

        const slot = this.acquireSlot(triedIndices, targetModel);
        triedIndices.add(slot.index);

        // If even the first acquired slot is still deep in cooldown (> 3s remaining), don't waste a network call on it!
        const cooldownRemainingMs =
          this.getSlotCooldownUntil(slot, targetModel) - Date.now();
        if (cooldownRemainingMs > 3000) {
          this.releaseSlot(slot);
          rateLimitHitsInPass += 1;
          sawRateLimitOnAllAttempts = true;
          attempts.push({
            attempt: attempts.length + 1,
            keyIndex: slot.index,
            sourceEnv: slot.sourceEnv,
            maskedKey: slot.maskedKey,
            targetModel,
            isFallbackModel: isFallbackPass,
            activeRequestsOnSlot: slot.activeRequests,
            latencyMs: 0,
            outcome: 'rate_limit_429',
            errorMessage: `Key đang trong Cooldown 429 (còn ${Math.ceil(cooldownRemainingMs / 1000)}s)`,
            cooldownAppliedMs: cooldownRemainingMs,
          });
          break;
        }

        const startMs = Date.now();
        logger.info(
          'KEY_POOL',
          `🔑 [Attempt #${attempts.length + 1}] Khóa Key #${slot.index}/${totalKeys} (${slot.sourceEnv} • ${slot.maskedKey}) cho model=${targetModel}${isFallbackPass ? ' [FALLBACK]' : ''}`,
          {
            reqId,
            endpoint: traceContext?.endpoint,
            label: traceContext?.label,
            keyIndex: slot.index,
            sourceEnv: slot.sourceEnv,
            maskedKey: slot.maskedKey,
            targetModel,
            activeRequestsOnSlot: slot.activeRequests,
          },
          reqId
        );

        const ai = new GoogleGenAI({
          apiKey: slot.apiKey,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build',
            },
          },
        });

        let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
        let onClientAbort: (() => void) | null = null;

        try {
          const opPromise = operation(ai, {
            keyIndex: slot.index,
            totalKeys,
            activeModel: targetModel,
          });

          const guardPromise = new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => {
              reject(
                new Error(
                  `[PER_ATTEMPT_TIMEOUT] Key #${slot.index} phản hồi quá ${Math.round(PER_ATTEMPT_TIMEOUT_MS / 1000)}s trên ${targetModel} (ngắt sớm để tránh chạm trần 300s)`
                )
              );
            }, PER_ATTEMPT_TIMEOUT_MS);

            if (clientSignal) {
              onClientAbort = () => {
                const abortErr = new Error(
                  'Đã hủy yêu cầu từ phía trình duyệt (AbortSignal).'
                );
                abortErr.name = 'AbortError';
                reject(abortErr);
              };
              if (clientSignal.aborted) {
                onClientAbort();
              } else {
                clientSignal.addEventListener('abort', onClientAbort, {
                  once: true,
                });
              }
            }
          });

          const result = await Promise.race([opPromise, guardPromise]);
          const latencyMs = Date.now() - startMs;
          slot.lastLatencyMs = latencyMs;
          slot.lastCheckedAt = Date.now();
          slot.lastError = undefined;
          slot.invalidKey = false;
          if (targetModel) {
            delete slot.modelCooldowns[normalizeModelBucket(targetModel)];
          }

          attempts.push({
            attempt: attempts.length + 1,
            keyIndex: slot.index,
            sourceEnv: slot.sourceEnv,
            maskedKey: slot.maskedKey,
            targetModel,
            isFallbackModel: isFallbackPass,
            activeRequestsOnSlot: slot.activeRequests,
            latencyMs,
            outcome: 'success',
          });

          const totalDurationMs = Date.now() - opStartMs;
          logger.info(
            'KEY_POOL',
            `✔ Key #${slot.index} (${slot.maskedKey}) hoàn tất thành công trên ${targetModel} sau ${(latencyMs / 1000).toFixed(2)}s`,
            {
              reqId,
              endpoint: traceContext?.endpoint,
              keyIndexUsed: slot.index,
              modelUsed: targetModel,
              didFallback: isFallbackPass,
              latencyMs,
              totalDurationMs,
              totalAttempts: attempts.length,
            },
            reqId,
            latencyMs
          );

          return {
            result,
            keyIndexUsed: slot.index,
            totalKeys,
            modelUsed: targetModel,
            didFallback: isFallbackPass,
            attempts,
            totalDurationMs,
          };
        } catch (err: unknown) {
          lastError = err;
          const latencyMs = Date.now() - startMs;
          const msg = err instanceof Error ? err.message : String(err);
          const lower = msg.toLowerCase();

          // Immediately rethrow client AbortError without rotating keys
          if (
            clientSignal?.aborted ||
            (err instanceof Error && err.name === 'AbortError')
          ) {
            logger.warn(
              'KEY_POOL',
              `⏹ Giải phóng ngay Key #${slot.index} (${slot.maskedKey}) do người dùng / trình duyệt đã hủy kết nối.`,
              { reqId, keyIndex: slot.index, latencyMs },
              reqId,
              latencyMs
            );
            throw err;
          }

          const hasMoreKeysOrModels =
            this.hasUntriedReadyKey(triedIndices, targetModel, 2000) ||
            mIdx < modelsToTry.length - 1;

          const isRateLimit =
            msg.includes('429') ||
            msg.includes('RESOURCE_EXHAUSTED') ||
            lower.includes('quota') ||
            lower.includes('rate limit');

          if (isRateLimit) {
            rateLimitHitsInPass += 1;
            slot.rateLimitHits += 1;
            const retryMs = parseRetryAfterMs(msg);
            this.setSlotCooldown(slot, retryMs, targetModel, msg.slice(0, 180));

            attempts.push({
              attempt: attempts.length + 1,
              keyIndex: slot.index,
              sourceEnv: slot.sourceEnv,
              maskedKey: slot.maskedKey,
              targetModel,
              isFallbackModel: isFallbackPass,
              activeRequestsOnSlot: slot.activeRequests,
              latencyMs,
              outcome: 'rate_limit_429',
              errorMessage: msg.slice(0, 300),
              cooldownAppliedMs: retryMs,
            });

            logger.warn(
              'KEY_POOL',
              `⚠️ Key #${slot.index} (${slot.maskedKey}) chạm 429 Rate Limit trên ${targetModel} sau ${latencyMs}ms → Cooldown ${Math.round(retryMs / 1000)}s, xoay sang Key tiếp theo...`,
              {
                reqId,
                keyIndex: slot.index,
                targetModel,
                cooldownSec: Math.round(retryMs / 1000),
                errorPreview: msg.slice(0, 250),
              },
              reqId,
              latencyMs
            );
            triggerFreshPipeIfNeeded(
              `Key #${slot.index} chạm 429 sau ${(latencyMs / 1000).toFixed(1)}s`,
              hasMoreKeysOrModels
            );
            continue;
          }

          const isInvalidKey =
            msg.includes('API_KEY_INVALID') ||
            lower.includes('api key not valid') ||
            lower.includes('api key expired') ||
            msg.includes('PERMISSION_DENIED') ||
            msg.includes('401') ||
            msg.includes('403');

          if (isInvalidKey) {
            slot.invalidKey = true;
            slot.lastError = msg.slice(0, 180);

            attempts.push({
              attempt: attempts.length + 1,
              keyIndex: slot.index,
              sourceEnv: slot.sourceEnv,
              maskedKey: slot.maskedKey,
              targetModel,
              isFallbackModel: isFallbackPass,
              activeRequestsOnSlot: slot.activeRequests,
              latencyMs,
              outcome: 'invalid_key',
              errorMessage: msg.slice(0, 300),
            });

            logger.error(
              'KEY_POOL',
              `✖ Key #${slot.index} (${slot.maskedKey}) không hợp lệ / bị từ chối (401/403) → Đánh dấu Invalid & xoay Key khác`,
              {
                reqId,
                keyIndex: slot.index,
                errorPreview: msg.slice(0, 250),
              },
              reqId,
              latencyMs
            );
            triggerFreshPipeIfNeeded(
              `Key #${slot.index} lỗi 401/403`,
              hasMoreKeysOrModels
            );
            continue;
          }

          // Transient 503/500/overloaded/network/per-attempt-timeout -> put key on short cooldown & either rotate or trigger fresh pipe
          const isTransientOrTimeout =
            msg.includes('503') ||
            msg.includes('502') ||
            msg.includes('504') ||
            msg.includes('UNAVAILABLE') ||
            msg.includes('DEADLINE_EXCEEDED') ||
            msg.includes('[PER_ATTEMPT_TIMEOUT]') ||
            lower.includes('overloaded') ||
            lower.includes('internal error') ||
            lower.includes('fetch failed') ||
            lower.includes('timeout') ||
            lower.includes('socket') ||
            lower.includes('econnreset');

          if (isTransientOrTimeout) {
            this.setSlotCooldown(slot, 12_000, targetModel, msg.slice(0, 180));

            attempts.push({
              attempt: attempts.length + 1,
              keyIndex: slot.index,
              sourceEnv: slot.sourceEnv,
              maskedKey: slot.maskedKey,
              targetModel,
              isFallbackModel: isFallbackPass,
              activeRequestsOnSlot: slot.activeRequests,
              latencyMs,
              outcome: 'transient_5xx',
              errorMessage: msg.slice(0, 300),
              cooldownAppliedMs: 12_000,
            });

            logger.warn(
              'KEY_POOL',
              `⚠️ Key #${slot.index} gặp lỗi tạm thời / ngắt sớm (503/Timeout/Network) trên ${targetModel} sau ${(latencyMs / 1000).toFixed(1)}s → Cooldown 12s & chuyển Key tiếp theo`,
              {
                reqId,
                keyIndex: slot.index,
                targetModel,
                errorPreview: msg.slice(0, 250),
              },
              reqId,
              latencyMs
            );
            // Always trigger Fresh Pipe if elapsed >= 35s OR if there is at least 1 key in the pool (even with 1 key, a fresh pipe resets the 300s clock after a transient 503/timeout!)
            triggerFreshPipeIfNeeded(
              `Key #${slot.index} lỗi mạng/503 sau ${(latencyMs / 1000).toFixed(1)}s`,
              true
            );
            continue;
          }

          attempts.push({
            attempt: attempts.length + 1,
            keyIndex: slot.index,
            sourceEnv: slot.sourceEnv,
            maskedKey: slot.maskedKey,
            targetModel,
            isFallbackModel: isFallbackPass,
            activeRequestsOnSlot: slot.activeRequests,
            latencyMs,
            outcome: 'fatal_error',
            errorMessage: msg.slice(0, 400),
          });

          logger.error(
            'KEY_POOL',
            `✖ Lỗi nghiêm trọng (Fatal Error) tại Key #${slot.index} trên ${targetModel}: ${msg.slice(0, 200)}`,
            {
              reqId,
              keyIndex: slot.index,
              targetModel,
              errorMessage: msg,
              attempts,
            },
            reqId,
            latencyMs
          );

          const fatalErr = (
            err instanceof Error ? err : new Error(msg)
          ) as Error & {
            attempts?: KeyAttemptTrace[];
            totalDurationMs?: number;
          };
          fatalErr.attempts = attempts;
          fatalErr.totalDurationMs = Date.now() - opStartMs;
          throw fatalErr;
        } finally {
          if (timeoutHandle) clearTimeout(timeoutHandle);
          if (clientSignal && onClientAbort) {
            clientSignal.removeEventListener('abort', onClientAbort);
          }
          this.releaseSlot(slot);
        }
      }

      if (rateLimitHitsInPass > 0) {
        sawRateLimitOnAllAttempts = true;
      }
    }

    const totalDurationMs = Date.now() - opStartMs;
    const rawErrMsg =
      lastError instanceof Error ? lastError.message : String(lastError || '');
    if (
      sawRateLimitOnAllAttempts ||
      rawErrMsg.includes('429') ||
      rawErrMsg.includes('RESOURCE_EXHAUSTED') ||
      rawErrMsg.includes('20 requests per day') ||
      rawErrMsg.includes('gemini-3.8-flash')
    ) {
      const triedModelsLabel = modelsToTry.join(' → ');
      const exhaustedErr = new Error(
        `[POOL_EXHAUSTED_429] Tất cả ${totalKeys} Key trong bể đều đã chạm giới hạn 429 trên model (${triedModelsLabel}). Hãy đổi sang model khác hoặc thêm Key mới rồi bấm Tiếp tục!`
      ) as Error & {
        attempts?: KeyAttemptTrace[];
        totalDurationMs?: number;
      };
      exhaustedErr.attempts = attempts;
      exhaustedErr.totalDurationMs = totalDurationMs;
      logger.error(
        'KEY_POOL',
        `🚨 [POOL_EXHAUSTED_429] Toàn bộ ${totalKeys} Key đã chạm giới hạn 429 trên (${triedModelsLabel}) sau ${attempts.length} lần thử (${(totalDurationMs / 1000).toFixed(2)}s)`,
        {
          reqId,
          triedModels: modelsToTry,
          totalKeys,
          totalDurationMs,
          attempts,
        },
        reqId,
        totalDurationMs
      );
      throw exhaustedErr;
    }

    const fallbackErr = (
      lastError instanceof Error
        ? lastError
        : new Error(
            '[POOL_EXHAUSTED_429] Tất cả khóa rảnh trong bể đều đang chạm giới hạn Rate Limit (429).'
          )
    ) as Error & {
      attempts?: KeyAttemptTrace[];
      totalDurationMs?: number;
    };
    fallbackErr.attempts = attempts;
    fallbackErr.totalDurationMs = totalDurationMs;
    throw fallbackErr;
  }

  public async executeWithFailover<T>(
    operation: (
      ai: GoogleGenAI,
      slotInfo: { keyIndex: number; totalKeys: number; activeModel: string }
    ) => Promise<T>,
    model?: string,
    fallbackModel?: string
  ): Promise<T> {
    const { result } = await this.executeWithKeyRotation(
      operation,
      model,
      fallbackModel
    );
    return result;
  }

  /**
   * Comprehensive Live Health Check for all configured keys in the pool + Studio API routes.
   */
  public async checkAllKeysAndApis(selectedModel = 'gemini-flash-latest'): Promise<{
    testedAt: number;
    modelTested: string;
    keyResults: KeyHealthCheckResult[];
    endpointResults: ApiEndpointCheckResult[];
    poolStatus: ReturnType<ServerGeminiKeyPool['getPoolStatus']>;
  }> {
    this.refreshFromEnv();
    const targetModel = selectedModel.trim() || 'gemini-flash-latest';

    // Test keys with concurrency 8 so checking even 50 keys finishes in ~2-3 seconds
    const keyResults: KeyHealthCheckResult[] = new Array(this.slots.length);
    let cursor = 0;

    const testSingleSlot = async (slot: KeyPoolSlot): Promise<KeyHealthCheckResult> => {
      const startMs = Date.now();
      const ai = new GoogleGenAI({
        apiKey: slot.apiKey,
        httpOptions: {
          headers: { 'User-Agent': 'aistudio-build' },
        },
      });

      try {
        await ai.interactions.create({
          model: targetModel,
          store: false,
          input: 'OK',
          generation_config: {
            max_output_tokens: 16,
          },
        });
        const latencyMs = Date.now() - startMs;
        slot.lastLatencyMs = latencyMs;
        slot.lastCheckedAt = Date.now();
        slot.invalidKey = false;
        slot.lastError = undefined;
        delete slot.modelCooldowns[normalizeModelBucket(targetModel)];
        if (slot.cooldownUntil <= Date.now()) {
          slot.cooldownUntil = 0;
        }
        return {
          index: slot.index,
          sourceEnv: slot.sourceEnv,
          maskedKey: slot.maskedKey,
          status: 'ready',
          latencyMs,
          modelTested: targetModel,
          flashLiteReady: true,
          message: `Hoạt động tốt trên ${targetModel} (${latencyMs}ms)`,
        };
      } catch (err: unknown) {
        const latencyMs = Date.now() - startMs;
        const msg = err instanceof Error ? err.message : String(err);
        const lower = msg.toLowerCase();
        slot.lastLatencyMs = latencyMs;
        slot.lastCheckedAt = Date.now();

        const isRateLimit =
          msg.includes('429') ||
          msg.includes('RESOURCE_EXHAUSTED') ||
          lower.includes('quota') ||
          lower.includes('rate limit');

        if (isRateLimit) {
          slot.rateLimitHits += 1;
          const retryMs = parseRetryAfterMs(msg);
          this.setSlotCooldown(slot, retryMs, targetModel, msg.slice(0, 180));

          // Also check if gemini-3.1-flash-lite is still available on this key when targetModel is flash-latest/3.8-flash
          let flashLiteReady = false;
          if (targetModel !== 'gemini-3.1-flash-lite') {
            try {
              await ai.interactions.create({
                model: 'gemini-3.1-flash-lite',
                store: false,
                input: 'OK',
                generation_config: { max_output_tokens: 16 },
              });
              flashLiteReady = true;
            } catch {
              flashLiteReady = false;
            }
          }

          const retryMatch = msg.match(/retry in\s+([0-9hms.]+)/i);
          const retryHint = retryMatch ? ` (Hồi sau ${retryMatch[1]})` : '';
          return {
            index: slot.index,
            sourceEnv: slot.sourceEnv,
            maskedKey: slot.maskedKey,
            status: 'cooldown',
            latencyMs,
            modelTested: targetModel,
            flashLiteReady,
            message: flashLiteReady
              ? `Chạm hạn mức 429 trên ${targetModel}${retryHint} • Nhưng SẴN SÀNG chạy ngay với gemini-3.1-flash-lite!`
              : `Chạm hạn mức 429 trên ${targetModel}${retryHint}`,
          };
        }

        slot.invalidKey = true;
        slot.lastError = msg.slice(0, 180);
        return {
          index: slot.index,
          sourceEnv: slot.sourceEnv,
          maskedKey: slot.maskedKey,
          status: 'invalid',
          latencyMs,
          modelTested: targetModel,
          flashLiteReady: false,
          message: `Key không hợp lệ hoặc bị từ chối: ${msg.slice(0, 110)}`,
        };
      }
    };

    const workers = Array.from(
      { length: Math.min(8, Math.max(1, this.slots.length)) },
      async () => {
        while (true) {
          const i = cursor++;
          if (i >= this.slots.length) break;
          keyResults[i] = await testSingleSlot(this.slots[i]);
        }
      }
    );
    await Promise.all(workers);

    const anyReadyOnTarget = keyResults.some((k) => k.status === 'ready');
    const anyReadyOnLite = keyResults.some((k) => k.flashLiteReady);
    const avgLatency =
      keyResults.length > 0
        ? Math.round(
            keyResults.reduce((acc, k) => acc + k.latencyMs, 0) / keyResults.length
          )
        : 0;

    const aiStatus: 'ok' | 'warning' | 'error' =
      keyResults.length === 0
        ? 'error'
        : anyReadyOnTarget
          ? 'ok'
          : anyReadyOnLite
            ? 'warning'
            : 'error';

    const aiStatusDetail =
      keyResults.length === 0
        ? 'Bể Key đang trống (0 Key). Hãy dán danh sách Gemini API Key của bạn vào ô bên trên rồi bấm Lưu!'
        : anyReadyOnTarget
          ? `Sẵn sàng (${keyResults.filter((k) => k.status === 'ready').length}/${keyResults.length} Key hoạt động tốt trên ${targetModel})`
          : anyReadyOnLite
            ? `Hết hạn mức ${targetModel}, nhưng SẴN SÀNG chạy trên gemini-3.1-flash-lite (hoặc thêm Key mới)`
            : `Tất cả ${keyResults.length} Key đang chạm giới hạn 429 hoặc lỗi. Hãy dán thêm Key mới!`;

    const endpointResults: ApiEndpointCheckResult[] = [
      {
        endpoint: '/api/translate',
        method: 'POST',
        name: 'API Dịch Chương 1:1 Block-ID (Structured JSON Schema)',
        description:
          'Dịch trọn vẹn 1 chương/request qua SDK @google/genai 2.31.0 (ai.interactions.create) khớp 1:1 TITLE, P0001..Pxxxx.',
        status: aiStatus,
        latencyMs: avgLatency,
        detail: aiStatusDetail,
      },
      {
        endpoint: '/api/editor/assist',
        method: 'POST',
        name: 'API Biên Tập AI & Dọn Lỗi Đích Danh Block ID',
        description:
          'Dọn chữ Hán sót, khử từ tiếng Anh lọt câu, chuốt văn phong & gợi ý 3 phương án diễn đạt.',
        status: aiStatus,
        latencyMs: avgLatency,
        detail: aiStatusDetail,
      },
      {
        endpoint: '/api/glossary/extract',
        method: 'POST',
        name: 'API AI Quét & Trích Xuất Thuật Ngữ Hán-Việt',
        description:
          'Tự động phát hiện tên nhân vật, địa danh, cảnh giới, công pháp kèm phân loại chuẩn.',
        status: aiStatus,
        latencyMs: avgLatency,
        detail: aiStatusDetail,
      },
      {
        endpoint: '/api/models',
        method: 'GET',
        name: 'API Quản Lý Model, Bể 50 Key Cá Nhân & Chẩn Đoán',
        description:
          'Không tích hợp sẵn Key mặc định • Lưu riêng trên trình duyệt người dùng (localStorage) & xoay vòng 1 luồng = 1 Key.',
        status: 'ok',
        latencyMs: 12,
        detail: `Hoạt động tốt • Bạn đang nạp ${this.slots.length} Key cá nhân`,
      },
      {
        endpoint: '/api/fetch-url',
        method: 'POST',
        name: 'API Tải Chương Truyện Nguyên Tác Từ URL',
        description:
          'Tự động giải mã UTF-8 / GB18030 / GBK và lọc sạch thẻ rác HTML từ trang truyện tiếng Trung.',
        status: 'ok',
        latencyMs: 8,
        detail: 'Hoạt động tốt (Bộ giải mã đa bảng mã CJK sẵn sàng)',
      },
    ];

    return {
      testedAt: Date.now(),
      modelTested: targetModel,
      keyResults,
      endpointResults,
      poolStatus: this.getPoolStatus(targetModel),
    };
  }
}

declare global {
  var __MHC_GEMINI_KEY_POOL__: ServerGeminiKeyPool | undefined;
}

export const geminiKeyPool: ServerGeminiKeyPool =
  globalThis.__MHC_GEMINI_KEY_POOL__ ??
  (globalThis.__MHC_GEMINI_KEY_POOL__ = new ServerGeminiKeyPool());

export const MANDATORY_HIGH_THINKING_CONFIG = {
  thinkingConfig: {
    thinkingLevel: ThinkingLevel.HIGH,
  },
  maxOutputTokens: 65536,
};

/**
 * Default generation_config for Gemini Interactions API (`ai.interactions.create`)
 * in @google/genai >= 2.31.0 when user does not override thinkingLevel.
 */
export const MANDATORY_INTERACTION_GENERATION_CONFIG = {
  thinking_level: 'high' as const,
  max_output_tokens: 65536,
};

const VALID_THINKING_LEVELS: readonly ThinkingLevelOption[] = [
  'minimal',
  'low',
  'medium',
  'high',
];

/**
 * Normalizes any incoming thinkingLevel string against @google/genai ThinkingLevel values.
 * Defaults to 'high' if omitted or invalid.
 */
export function normalizeThinkingLevel(
  level?: string | null
): ThinkingLevelOption {
  if (!level || typeof level !== 'string') {
    return DEFAULT_THINKING_LEVEL;
  }
  const clean = level.trim().toLowerCase() as ThinkingLevelOption;
  if (VALID_THINKING_LEVELS.includes(clean)) {
    return clean;
  }
  return DEFAULT_THINKING_LEVEL;
}

/**
 * Dynamically inspects @google/genai SDK's `ThinkingLevel` enum + model capability metadata
 * to return the list of available thinking levels (`minimal`, `low`, `medium`, `high`),
 * with `'high'` marked as default.
 */
export function getAvailableThinkingLevelsFromSdk(
  modelName?: string,
  modelSupportsThinking = true
): ThinkingLevelMeta[] {
  const sdkValues = new Set<string>(
    Object.values(ThinkingLevel || {}).map((v) =>
      String(v).trim().toLowerCase()
    )
  );
  const orderedIds: ThinkingLevelOption[] = [
    'minimal',
    'low',
    'medium',
    'high',
  ];
  const presetMap = new Map<ThinkingLevelOption, ThinkingLevelMeta>(
    THINKING_LEVEL_OPTIONS.map((item) => [item.id, item])
  );

  const sourceTag = modelSupportsThinking
    ? `SDK @google/genai (${modelName || 'gemini-flash-latest'})`
    : `SDK @google/genai`;

  return orderedIds
    .filter((id) => sdkValues.size === 0 || sdkValues.has(id))
    .map((id) => {
      const preset = presetMap.get(id);
      return {
        id,
        label: preset?.label || `${id}`,
        badge: preset?.badge || (id === 'high' ? 'Mặc định' : 'Tùy chọn'),
        description: preset?.description || `Mức suy luận ${id}`,
        isDefault: id === DEFAULT_THINKING_LEVEL,
        source: sourceTag,
      };
    });
}

/**
 * Builds generation_config for `ai.interactions.create` with configurable `thinking_level`
 * ('minimal' | 'low' | 'medium' | 'high', default 'high') and max_output_tokens: 65536.
 */
export function buildInteractionGenerationConfig(
  thinkingLevel?: string | null,
  extra?: Record<string, unknown>
): {
  thinking_level: ThinkingLevelOption;
  max_output_tokens: number;
  [key: string]: unknown;
} {
  return {
    ...(extra || {}),
    thinking_level: normalizeThinkingLevel(thinkingLevel),
    max_output_tokens: 65536,
  };
}

/**
 * Extracts output text from a Gemini Interactions API response (`ai.interactions.create`).
 * Prefers `interaction.output_text` (populated by @google/genai SDK >= 2.31.0)
 * and falls back to concatenating text content from `model_output` steps.
 */
export function extractInteractionText(interaction: {
  output_text?: string | null;
  steps?: Array<{
    type?: string;
    content?:
      | Array<{ type?: string; text?: string }>
      | { type?: string; text?: string };
  }>;
}): string {
  if (
    typeof interaction?.output_text === 'string' &&
    interaction.output_text.trim()
  ) {
    return interaction.output_text;
  }
  if (Array.isArray(interaction?.steps)) {
    const chunks: string[] = [];
    for (const step of interaction.steps) {
      if (step?.type === 'model_output' && step.content) {
        const items = Array.isArray(step.content)
          ? step.content
          : [step.content];
        for (const item of items) {
          if (item?.type === 'text' && typeof item.text === 'string') {
            chunks.push(item.text);
          }
        }
      }
    }
    if (chunks.length > 0) {
      return chunks.join('');
    }
  }
  return '';
}

/**
 * Safely parses JSON from an Interaction output string, stripping markdown code fences if present.
 */
export function safeParseInteractionJson<T>(
  rawText: string,
  contextLabel = 'InteractionOutput'
): T {
  const trimmed = (rawText || '').trim();
  if (!trimmed) {
    logger.error('KEY_POOL', `✖ [${contextLabel}] Model trả về phản hồi rỗng (0 ký tự).`);
    throw new Error('Model trả về phản hồi rỗng.');
  }
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;
  try {
    return JSON.parse(candidate) as T;
  } catch (firstErr) {
    const objMatch = candidate.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[1]) as T;
      } catch (secondErr) {
        logger.error(
          'KEY_POOL',
          `✖ [${contextLabel}] Lỗi JSON.parse trên phản hồi từ AI`,
          {
            contextLabel,
            parseError:
              secondErr instanceof Error ? secondErr.message : String(secondErr),
            rawLength: trimmed.length,
            rawHeadPreview: trimmed.slice(0, 600),
            rawTailPreview: trimmed.slice(-600),
          }
        );
        throw new Error(
          `Phản hồi từ AI không đúng định dạng JSON hợp lệ (${
            secondErr instanceof Error ? secondErr.message : 'Parse error'
          }). Đã ghi nội dung thô vào Console.`
        );
      }
    }
    logger.error(
      'KEY_POOL',
      `✖ [${contextLabel}] Phản hồi từ AI không chứa cấu trúc JSON hợp lệ`,
      {
        contextLabel,
        parseError:
          firstErr instanceof Error ? firstErr.message : String(firstErr),
        rawLength: trimmed.length,
        rawHeadPreview: trimmed.slice(0, 600),
        rawTailPreview: trimmed.slice(-600),
      }
    );
    throw new Error('Phản hồi từ AI không đúng định dạng JSON hợp lệ.');
  }
}

/**
 * Wraps a Next.js API Route handler with HTTP Keep-Alive Heartbeat Streaming ("Cách 2"):
 * - When the client sends `X-MHC-Heartbeat: 1`, immediately opens a ReadableStream (HTTP 200)
 *   and flushes a whitespace byte (`" "`) at 0s and every 8s while `handler()` is running.
 * - Prevents Reverse Proxy / Cloud Run from cutting the connection due to Idle Timeout (60s–120s).
 * - Embeds `__mhcHttpStatus` in the final JSON object so `safeFetchJson` on the client
 *   preserves exact HTTP status semantics (200, 400, 429, 500, 503).
 */
export async function withHeartbeatStream(
  req: Request,
  handler: () => Promise<Response>
): Promise<Response> {
  const wantsHeartbeat = req.headers.get('x-mhc-heartbeat') === '1';
  if (!wantsHeartbeat) {
    return await handler();
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      // Flush initial keep-alive space immediately at 0s so headers + first byte cross the proxy right away
      safeEnqueue(' ');

      const heartbeatTimer = setInterval(() => {
        safeEnqueue(' ');
      }, 8_000);

      try {
        const response = await handler();
        clearInterval(heartbeatTimer);
        const rawBody = await response.text();
        const logicalStatus = response.status || 200;

        let finalJsonString = rawBody.trim();
        try {
          const parsed = JSON.parse(finalJsonString);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            (parsed as Record<string, unknown>).__mhcHttpStatus = logicalStatus;
            finalJsonString = JSON.stringify(parsed);
          }
        } catch {
          finalJsonString = JSON.stringify({
            error: rawBody || `HTTP ${logicalStatus}`,
            __mhcHttpStatus: logicalStatus,
          });
        }

        safeEnqueue(`\n${finalJsonString}`);
      } catch (err) {
        clearInterval(heartbeatTimer);
        const msg = err instanceof Error ? err.message : String(err);
        safeEnqueue(
          `\n${JSON.stringify({
            error: msg,
            __mhcHttpStatus: 500,
          })}`
        );
      } finally {
        clearInterval(heartbeatTimer);
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // Stream already closed
          }
        }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}

