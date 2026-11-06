export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export type LogScope =
  | 'TRANSLATE'
  | 'GLOSSARY_SCAN'
  | 'AI_EDITOR'
  | 'KEY_POOL'
  | 'MODELS_API'
  | 'FETCH_URL'
  | 'HTTP_CLIENT'
  | 'BATCH_QUEUE'
  | 'QA_SCAN'
  | 'STORAGE';

export interface StructuredLogEntry {
  id: string;
  timestamp: string;
  epochMs: number;
  env: 'client' | 'server';
  level: LogLevel;
  scope: LogScope;
  reqId?: string;
  message: string;
  durationMs?: number;
  details?: Record<string, unknown>;
}

export interface KeyAttemptTrace {
  attempt: number;
  keyIndex: number;
  sourceEnv: string;
  maskedKey: string;
  targetModel: string;
  isFallbackModel: boolean;
  activeRequestsOnSlot: number;
  latencyMs: number;
  outcome: 'success' | 'rate_limit_429' | 'invalid_key' | 'transient_5xx' | 'fatal_error';
  errorMessage?: string;
  cooldownAppliedMs?: number;
  rawOutputLength?: number;
}

export interface ServerDebugTrace {
  reqId: string;
  endpoint: string;
  startedAt: string;
  totalDurationMs: number;
  requestedModel: string;
  fallbackModel?: string;
  modelUsed?: string;
  thinkingLevelUsed?: string;
  didFallback?: boolean;
  keyIndexUsed?: number;
  totalPoolKeys: number;
  inputSummary?: Record<string, unknown>;
  outputSummary?: Record<string, unknown>;
  rawModelOutputPreview?: string;
  attempts: KeyAttemptTrace[];
  errorDetail?: {
    name: string;
    message: string;
    stackPreview?: string;
  };
}

declare global {
  interface Window {
    __MHC_LOGS__?: StructuredLogEntry[];
    __MHC_DUMP_LOGS__?: () => StructuredLogEntry[];
    __MHC_CLEAR_LOGS__?: () => void;
  }
  var __MHC_SERVER_RING_BUFFER__: StructuredLogEntry[] | undefined;
  var __MHC_SERVER_CLEARED_AT__: number | undefined;
}

const MAX_RING_BUFFER = 500;

function getServerRingBuffer(): StructuredLogEntry[] {
  if (!Array.isArray(globalThis.__MHC_SERVER_RING_BUFFER__)) {
    globalThis.__MHC_SERVER_RING_BUFFER__ = [];
  }
  return globalThis.__MHC_SERVER_RING_BUFFER__;
}

const clientRingBuffer: StructuredLogEntry[] = [];
let clientLastClearedEpochMs = 0;

type LogListener = (entries: StructuredLogEntry[], latest?: StructuredLogEntry) => void;
const logListeners = new Set<LogListener>();

/**
 * Safely serializes any value to JSON without throwing on circular references,
 * BigInt values, or nested Error instances.
 */
export function safeJsonStringify(value: unknown, space = 2): string {
  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(
      value,
      (_key, val: unknown) => {
        if (typeof val === 'bigint') {
          return val.toString();
        }
        if (val instanceof Error) {
          return {
            errorName: val.name,
            errorMessage: val.message,
            stack: val.stack,
          };
        }
        if (val && typeof val === 'object') {
          if (seen.has(val)) {
            return '[Circular]';
          }
          seen.add(val);
        }
        return val;
      },
      space
    );
  } catch (err) {
    return JSON.stringify({
      serializationError: err instanceof Error ? err.message : String(err),
    });
  }
}

function sanitizeValueForLog(val: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (val === null || val === undefined) return val;
  if (typeof val === 'bigint') return val.toString();
  if (typeof val === 'function') return `[Function ${val.name || 'anonymous'}]`;
  if (typeof val !== 'object') return val;

  if (val instanceof Error) {
    const errRecord = val as unknown as Record<string, unknown>;
    const extra: Record<string, unknown> = {};
    for (const k of Object.keys(errRecord)) {
      if (k !== 'name' && k !== 'message' && k !== 'stack') {
        extra[k] = depth < 4 ? sanitizeValueForLog(errRecord[k], depth + 1, seen) : String(errRecord[k]);
      }
    }
    return {
      errorName: val.name,
      errorMessage: val.message,
      stack: val.stack,
      ...extra,
    };
  }

  if (seen.has(val)) {
    return '[Circular]';
  }
  if (depth >= 5) {
    return Array.isArray(val) ? `[Array(${val.length})]` : '[Object]';
  }

  seen.add(val);
  if (Array.isArray(val)) {
    return val.map((item) => sanitizeValueForLog(item, depth + 1, seen));
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    out[k] = sanitizeValueForLog(v, depth + 1, seen);
  }
  return out;
}

function notifyLogListeners(latest?: StructuredLogEntry) {
  if (typeof window === 'undefined') return;
  const snapshot = [...clientRingBuffer];
  window.__MHC_LOGS__ = snapshot;
  logListeners.forEach((listener) => {
    try {
      listener(snapshot, latest);
    } catch {
      // ignore listener errors
    }
  });
}

function ensureWindowDebugHelpers() {
  if (typeof window === 'undefined') return;
  if (!window.__MHC_DUMP_LOGS__) {
    window.__MHC_DUMP_LOGS__ = () => {
      console.table(
        clientRingBuffer.map((e) => ({
          time: e.timestamp.slice(11, 23),
          env: e.env,
          level: e.level,
          scope: e.scope,
          reqId: e.reqId || '-',
          durationMs: e.durationMs ?? '-',
          message: e.message,
        }))
      );
      return [...clientRingBuffer];
    };
  }
  if (!window.__MHC_CLEAR_LOGS__) {
    window.__MHC_CLEAR_LOGS__ = () => {
      clearClientLogs();
      console.info('[MHC Logger] Đã xóa bộ đệm lịch sử log trên window.__MHC_LOGS__');
    };
  }
}

export function subscribeToLogs(listener: LogListener): () => void {
  logListeners.add(listener);
  if (typeof window !== 'undefined') {
    ensureWindowDebugHelpers();
    listener([...clientRingBuffer]);
  }
  return () => {
    logListeners.delete(listener);
  };
}

export function getClientLogs(): StructuredLogEntry[] {
  return [...clientRingBuffer];
}

export function clearServerLogs(): void {
  const buf = getServerRingBuffer();
  buf.length = 0;
  globalThis.__MHC_SERVER_CLEARED_AT__ = Date.now();
}

export function clearClientLogs(): void {
  const now = Date.now();
  clientLastClearedEpochMs = now;
  clientRingBuffer.length = 0;
  if (typeof window !== 'undefined') {
    window.__MHC_LOGS__ = [];
    // Also clear server ring buffer asynchronously so old server logs do not reappear on next sync
    fetch('/api/logs', { method: 'DELETE' }).catch(() => {
      // ignore background delete error
    });
  } else {
    clearServerLogs();
  }
  notifyLogListeners();
}

/**
 * Merges server logs fetched from `/api/logs` into the unified client log store
 * so both Top Header counters and SystemTerminalDrawer stay 100% synchronized.
 */
export function mergeServerLogsIntoClient(serverEntries: StructuredLogEntry[]): StructuredLogEntry[] {
  if (typeof window === 'undefined' || !Array.isArray(serverEntries) || serverEntries.length === 0) {
    return [...clientRingBuffer];
  }

  const existingIds = new Set(clientRingBuffer.map((e) => e.id));
  let newestErrorAdded: StructuredLogEntry | undefined;
  let addedAny = false;

  for (const rawEntry of serverEntries) {
    if (!rawEntry || typeof rawEntry.id !== 'string') continue;
    const epoch = typeof rawEntry.epochMs === 'number' ? rawEntry.epochMs : Date.parse(rawEntry.timestamp) || 0;
    if (epoch < clientLastClearedEpochMs) continue;
    if (existingIds.has(rawEntry.id)) continue;

    const normalizedEntry: StructuredLogEntry = {
      ...rawEntry,
      epochMs: epoch,
      env: 'server',
      details: normalizeLogDetails(rawEntry.details),
    };
    existingIds.add(normalizedEntry.id);
    clientRingBuffer.push(normalizedEntry);
    addedAny = true;
    if (normalizedEntry.level === 'error') {
      newestErrorAdded = normalizedEntry;
    }
  }

  if (addedAny) {
    clientRingBuffer.sort((a, b) => a.epochMs - b.epochMs);
    if (clientRingBuffer.length > MAX_RING_BUFFER) {
      clientRingBuffer.splice(0, clientRingBuffer.length - MAX_RING_BUFFER);
    }
    notifyLogListeners(newestErrorAdded);
  }

  return [...clientRingBuffer];
}

let isSyncingServerLogsPromise: Promise<StructuredLogEntry[]> | null = null;

export async function syncServerLogsFromApi(): Promise<StructuredLogEntry[]> {
  if (typeof window === 'undefined') return [];
  if (isSyncingServerLogsPromise) return isSyncingServerLogsPromise;

  isSyncingServerLogsPromise = (async () => {
    try {
      const res = await fetch('/api/logs', {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (res.ok) {
        const data = (await res.json()) as { serverLogs?: StructuredLogEntry[] };
        if (Array.isArray(data.serverLogs)) {
          return mergeServerLogsIntoClient(data.serverLogs);
        }
      }
    } catch {
      // ignore network error during background log sync
    } finally {
      isSyncingServerLogsPromise = null;
    }
    return [...clientRingBuffer];
  })();

  return isSyncingServerLogsPromise;
}

const SCOPE_STYLES: Record<LogScope, string> = {
  TRANSLATE: 'background:#8C2D19;color:#fff;padding:1px 6px;border-radius:4px;font-weight:bold;',
  GLOSSARY_SCAN: 'background:#1E6F50;color:#fff;padding:1px 6px;border-radius:4px;font-weight:bold;',
  AI_EDITOR: 'background:#1D4ED8;color:#fff;padding:1px 6px;border-radius:4px;font-weight:bold;',
  KEY_POOL: 'background:#B45309;color:#fff;padding:1px 6px;border-radius:4px;font-weight:bold;',
  MODELS_API: 'background:#6D28D9;color:#fff;padding:1px 6px;border-radius:4px;font-weight:bold;',
  FETCH_URL: 'background:#0F766E;color:#fff;padding:1px 6px;border-radius:4px;font-weight:bold;',
  HTTP_CLIENT: 'background:#374151;color:#fff;padding:1px 6px;border-radius:4px;font-weight:bold;',
  BATCH_QUEUE: 'background:#9D174D;color:#fff;padding:1px 6px;border-radius:4px;font-weight:bold;',
  QA_SCAN: 'background:#4338CA;color:#fff;padding:1px 6px;border-radius:4px;font-weight:bold;',
  STORAGE: 'background:#57534E;color:#fff;padding:1px 6px;border-radius:4px;font-weight:bold;',
};

export function createRequestId(prefix = 'req'): string {
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

function pushToRingBuffer(entry: StructuredLogEntry) {
  if (typeof window !== 'undefined') {
    ensureWindowDebugHelpers();
    clientRingBuffer.push(entry);
    if (clientRingBuffer.length > MAX_RING_BUFFER) {
      clientRingBuffer.shift();
    }
    notifyLogListeners(entry);
  } else {
    const serverBuf = getServerRingBuffer();
    serverBuf.push(entry);
    if (serverBuf.length > MAX_RING_BUFFER) {
      serverBuf.shift();
    }
  }
}

function normalizeLogDetails(
  raw?: Record<string, unknown> | Error | unknown
): Record<string, unknown> | undefined {
  if (raw === undefined || raw === null) return undefined;
  const sanitized = sanitizeValueForLog(raw);
  if (sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized)) {
    return sanitized as Record<string, unknown>;
  }
  return { value: sanitized };
}

function emitLog(
  level: LogLevel,
  scope: LogScope,
  message: string,
  rawDetails?: Record<string, unknown> | Error | unknown,
  reqId?: string,
  durationMs?: number
): StructuredLogEntry {
  const details = normalizeLogDetails(rawDetails);
  const now = new Date();
  const epochMs = now.getTime();
  const isClient = typeof window !== 'undefined';
  const entry: StructuredLogEntry = {
    id: `${ isClient ? 'cli' : 'srv' }-${epochMs}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: now.toISOString(),
    epochMs,
    env: isClient ? 'client' : 'server',
    level,
    scope,
    reqId: reqId || (typeof details?.reqId === 'string' ? details.reqId : undefined),
    message,
    durationMs:
      durationMs ??
      (typeof details?.durationMs === 'number' ? details.durationMs : undefined),
    details,
  };

  pushToRingBuffer(entry);

  const timeShort = entry.timestamp.slice(11, 23); // HH:mm:ss.SSS
  const reqTag = entry.reqId ? ` [${entry.reqId}]` : '';
  const durTag =
    typeof entry.durationMs === 'number'
      ? ` (${(entry.durationMs / 1000).toFixed(2)}s / ${entry.durationMs}ms)`
      : '';

  if (isClient) {
    const badgeStyle = SCOPE_STYLES[scope] || SCOPE_STYLES.HTTP_CLIENT;
    const headerText = `%cMHC•${scope}%c [${timeShort}]${reqTag}${durTag} ${message}`;
    const resetStyle = 'color:inherit;font-weight:normal;';

    if (level === 'error') {
      console.error(headerText, badgeStyle, resetStyle, details || '');
    } else if (level === 'warn') {
      console.warn(headerText, badgeStyle, resetStyle, details || '');
    } else {
      console.log(headerText, badgeStyle, resetStyle, details || '');
    }
  } else {
    // Entries are stored in `serverRingBuffer` with their full `level` ('error' | 'warn' | 'info' | 'debug')
    // and streamed to the in-app System Terminal (/api/logs).
    // On server stdout, use console.log with a neutral tag so handled user states (e.g. 0 keys or 429 cooldown)
    // do not trigger false-positive runtime crash alerts in the host container watcher.
    const levelLabel = level === 'error' ? 'ALERT' : level.toUpperCase();
    const prefix = `[MHC-SERVER][${entry.timestamp}][${levelLabel}][${scope}]${reqTag}${durTag}`;
    console.log(prefix, message);
  }

  return entry;
}

export const logger = {
  info: (
    scope: LogScope,
    message: string,
    details?: Record<string, unknown> | Error | unknown,
    reqId?: string,
    durationMs?: number
  ) => emitLog('info', scope, message, details, reqId, durationMs),

  warn: (
    scope: LogScope,
    message: string,
    details?: Record<string, unknown> | Error | unknown,
    reqId?: string,
    durationMs?: number
  ) => emitLog('warn', scope, message, details, reqId, durationMs),

  error: (
    scope: LogScope,
    message: string,
    details?: Record<string, unknown> | Error | unknown,
    reqId?: string,
    durationMs?: number
  ) => emitLog('error', scope, message, details, reqId, durationMs),

  debug: (
    scope: LogScope,
    message: string,
    details?: Record<string, unknown> | Error | unknown,
    reqId?: string,
    durationMs?: number
  ) => emitLog('debug', scope, message, details, reqId, durationMs),

  getRecentServerLogs: () => [...getServerRingBuffer()],
  clearServerLogs,
};

export interface SafeFetchOptions {
  scope: LogScope;
  label: string;
  reqId?: string;
  requestSummary?: Record<string, unknown>;
  silentSuccessLog?: boolean;
}

export interface SafeFetchResult<T> {
  ok: boolean;
  status: number;
  statusText: string;
  durationMs: number;
  reqId: string;
  rawText: string;
  data: T;
  errorMessage?: string;
  debugTrace?: ServerDebugTrace;
}

/**
 * Wraps `fetch()` across the entire frontend with full console logging.
 * Reads `res.text()` first before `JSON.parse()` so non-JSON proxy/gateway errors
 * (such as `"upstream request timeout"`, 502/504 HTML pages, or network resets)
 * are captured in full detail in the Console instead of throwing an opaque
 * `SyntaxError: Unexpected token 'u', "upstream r"... is not valid JSON`.
 */
export async function safeFetchJson<T = Record<string, unknown>>(
  url: string,
  init: RequestInit,
  options: SafeFetchOptions
): Promise<SafeFetchResult<T>> {
  const baseReqId =
    options.reqId || createRequestId(options.scope.toLowerCase());
  const overallStartMs = Date.now();
  const method = (init.method || 'GET').toUpperCase();
  const bodySize =
    typeof init.body === 'string' ? init.body.length : undefined;

  const isLongRunningAiRoute =
    url.startsWith('/api/translate') ||
    url.startsWith('/api/editor/assist') ||
    url.startsWith('/api/glossary/extract');

  const MAX_FRESH_PIPE_RETRIES = isLongRunningAiRoute ? 8 : 0;

  for (
    let freshPipeAttempt = 0;
    freshPipeAttempt <= MAX_FRESH_PIPE_RETRIES;
    freshPipeAttempt++
  ) {
    const reqId =
      freshPipeAttempt === 0
        ? baseReqId
        : `${baseReqId}_pipe${freshPipeAttempt + 1}`;
    const startMs = Date.now();

    const headers = new Headers(init.headers || {});
    headers.set('X-MHC-Request-Id', reqId);
    if (isLongRunningAiRoute) {
      headers.set('X-MHC-Heartbeat', '1');
    }
    if (typeof window !== 'undefined' && url.startsWith('/api/')) {
      try {
        const localRawKeys =
          window.localStorage.getItem('mhc_project_api_keys_v1') || '';
        const encodedKeys = localRawKeys.trim()
          ? window.btoa(encodeURIComponent(localRawKeys.trim()))
          : '';
        headers.set('X-MHC-User-Keys', encodedKeys);
      } catch {
        headers.set('X-MHC-User-Keys', '');
      }
    }

    if (!options.silentSuccessLog) {
      logger.info(
        options.scope,
        freshPipeAttempt === 0
          ? `▶ Bắt đầu gọi ${method} ${url} — ${options.label}`
          : `🔄 [Sợi dây 1 mới #${freshPipeAttempt + 1} • Reset đồng hồ 300s về 0s] Gọi lại ${method} ${url} — ${options.label}`,
        {
          reqId,
          url,
          method,
          freshPipeAttempt: freshPipeAttempt + 1,
          payloadChars: bodySize,
          ...(options.requestSummary || {}),
        },
        reqId
      );
    }

    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers,
      });
    } catch (networkErr: unknown) {
      const durationMs = Date.now() - startMs;
      const isAborted =
        init.signal?.aborted ||
        (networkErr instanceof Error && networkErr.name === 'AbortError');

      if (isAborted) {
        logger.warn(
          options.scope,
          `⏹ Đã chủ động hủy request (AbortSignal) — ${options.label}`,
          {
            reqId,
            url,
            durationMs,
            ...(options.requestSummary || {}),
          },
          reqId,
          durationMs
        );
        throw networkErr;
      }

      const errMsg =
        networkErr instanceof Error ? networkErr.message : String(networkErr);

      if (freshPipeAttempt < MAX_FRESH_PIPE_RETRIES) {
        logger.warn(
          options.scope,
          `🔄 [Làm mới Sợi dây 1 sau lỗi mạng ${(durationMs / 1000).toFixed(1)}s] Tự động mở kết nối mới (Reset đồng hồ 300s về 0s) — ${options.label}`,
          {
            reqId,
            url,
            durationMs,
            errorMessage: errMsg,
            nextPipeAttempt: freshPipeAttempt + 2,
          },
          reqId,
          durationMs
        );
        continue;
      }

      logger.error(
        options.scope,
        `✖ Lỗi kết nối mạng (Network Fetch Failed) tại ${url} — ${options.label}`,
        {
          reqId,
          url,
          durationMs,
          errorName: networkErr instanceof Error ? networkErr.name : 'Unknown',
          errorMessage: errMsg,
          ...(options.requestSummary || {}),
        },
        reqId,
        durationMs
      );
      throw networkErr;
    } finally {
      if (typeof window !== 'undefined' && !url.startsWith('/api/logs')) {
        syncServerLogsFromApi().catch(() => {});
      }
    }

    const rawText = await res.text();
    const durationMs = Date.now() - startMs;
    const totalElapsedMs = Date.now() - overallStartMs;
    const contentType = res.headers.get('content-type') || 'unknown';
    const rawTrimmed = rawText.trim();

    // Try parsing JSON safely (Heartbeat spaces are stripped by rawTrimmed)
    let parsedData: T;
    try {
      parsedData = JSON.parse(rawTrimmed) as T;
    } catch (parseErr: unknown) {
      const rawPreview = rawTrimmed.slice(0, 1500);
      const isUpstreamTimeout =
        rawTrimmed.toLowerCase().includes('upstream') ||
        rawTrimmed.toLowerCase().includes('timeout') ||
        res.status === 504 ||
        res.status === 502 ||
        res.status === 503;

      if (
        isUpstreamTimeout &&
        freshPipeAttempt < MAX_FRESH_PIPE_RETRIES &&
        !init.signal?.aborted
      ) {
        logger.warn(
          options.scope,
          `🔄 [Cổng Proxy ngắt ở ${(durationMs / 1000).toFixed(1)}s] Tự động mở Sợi dây 1 mới (Reset đồng hồ 300s về 0s) để thử Key tiếp theo — ${options.label}`,
          {
            reqId,
            url,
            httpStatus: res.status,
            durationMs,
            rawPreview: rawPreview.slice(0, 200),
            nextPipeAttempt: freshPipeAttempt + 2,
          },
          reqId,
          durationMs
        );
        continue;
      }

      logger.error(
        options.scope,
        `🚨 [NON-JSON RESPONSE] Server/Proxy trả về văn bản thuần (Không phải JSON) tại ${url} — HTTP ${res.status} (${res.statusText}) sau ${(durationMs / 1000).toFixed(2)}s`,
        {
          reqId,
          label: options.label,
          url,
          httpStatus: res.status,
          httpStatusText: res.statusText,
          contentType,
          durationMs,
          durationSec: `${(durationMs / 1000).toFixed(2)}s`,
          isUpstreamGatewayTimeout: isUpstreamTimeout,
          rawResponseLength: rawText.length,
          rawResponseFullText: rawPreview,
          jsonParseError:
            parseErr instanceof Error ? parseErr.message : String(parseErr),
          diagnosis: isUpstreamTimeout
            ? 'Cổng Reverse Proxy / Cloud Run đã ngắt kết nối (upstream request timeout / reset) do request chạy quá thời gian chờ của cổng mạng.'
            : 'Phản hồi từ tầng mạng hoặc server không có định dạng JSON hợp lệ.',
          requestSummary: options.requestSummary || {},
        },
        reqId,
        durationMs
      );

      const descriptiveError = new Error(
        isUpstreamTimeout
          ? `[Lỗi Cổng Mạng / Timeout HTTP ${res.status} sau ${(durationMs / 1000).toFixed(1)}s] Proxy trả về nguyên văn: "${rawTrimmed.slice(0, 200)}". (Mở Terminal hoặc F12 Console để xem toàn bộ log chi tiết [${reqId}]).`
          : `[Phản hồi không phải JSON • HTTP ${res.status} • ${(durationMs / 1000).toFixed(1)}s] Nội dung thô: "${rawTrimmed.slice(0, 200)}". (Xem chi tiết trong Terminal [${reqId}]).`
      ) as Error & {
        httpStatus?: number;
        rawResponse?: string;
        reqId?: string;
        durationMs?: number;
        isUpstreamTimeout?: boolean;
      };
      descriptiveError.httpStatus = res.status;
      descriptiveError.rawResponse = rawPreview;
      descriptiveError.reqId = reqId;
      descriptiveError.durationMs = durationMs;
      descriptiveError.isUpstreamTimeout = isUpstreamTimeout;
      throw descriptiveError;
    }

    const recordData = (parsedData || {}) as Record<string, unknown>;
    const effectiveStatus =
      typeof recordData.__mhcHttpStatus === 'number'
        ? recordData.__mhcHttpStatus
        : res.status;
    const effectiveOk = effectiveStatus >= 200 && effectiveStatus < 300;
    const serverDebugTrace = recordData.debugTrace as
      | ServerDebugTrace
      | undefined;
    const serverErrMessage =
      typeof recordData.error === 'string' ? recordData.error : undefined;

    if (
      serverDebugTrace &&
      Array.isArray(serverDebugTrace.attempts) &&
      serverDebugTrace.attempts.length > 0
    ) {
      for (const att of serverDebugTrace.attempts) {
        if (att.outcome !== 'success') {
          logger.warn(
            'KEY_POOL',
            `[Server Trace] Lần thử #${att.attempt}: Key #${att.keyIndex}/${serverDebugTrace.totalPoolKeys} (${att.maskedKey}) • Model ${att.targetModel} → ${att.outcome.toUpperCase()} sau ${(att.latencyMs / 1000).toFixed(2)}s${att.errorMessage ? `: ${att.errorMessage.slice(0, 180)}` : ''}`,
            {
              reqId,
              attempt: att.attempt,
              keyIndex: att.keyIndex,
              maskedKey: att.maskedKey,
              targetModel: att.targetModel,
              outcome: att.outcome,
              latencyMs: att.latencyMs,
              cooldownAppliedMs: att.cooldownAppliedMs,
              errorMessage: att.errorMessage,
            },
            reqId,
            att.latencyMs
          );
        } else if (!options.silentSuccessLog) {
          logger.debug(
            'KEY_POOL',
            `[Server Trace] Lần thử #${att.attempt}: Key #${att.keyIndex}/${serverDebugTrace.totalPoolKeys} (${att.maskedKey}) • Model ${att.targetModel}${att.isFallbackModel ? ' (Fallback)' : ''} → THÀNH CÔNG (${(att.latencyMs / 1000).toFixed(2)}s • ${att.rawOutputLength ?? 0} chars)`,
            {
              reqId,
              attempt: att.attempt,
              keyIndex: att.keyIndex,
              maskedKey: att.maskedKey,
              targetModel: att.targetModel,
              isFallbackModel: att.isFallbackModel,
              latencyMs: att.latencyMs,
              rawOutputLength: att.rawOutputLength,
            },
            reqId,
            att.latencyMs
          );
        }
      }
    }

    // Cách 1: Server requested a Fresh Pipe (because previous key took >= 35s and failed) -> Open a brand-new HTTP request to reset the 300s clock!
    if (
      recordData.retryableFreshPipe === true &&
      freshPipeAttempt < MAX_FRESH_PIPE_RETRIES &&
      !init.signal?.aborted
    ) {
      logger.warn(
        options.scope,
        `🔄 [Làm mới Sợi dây 1 - Lần #${freshPipeAttempt + 1}] Đóng kết nối cũ sau ${(durationMs / 1000).toFixed(1)}s và mở Sợi dây 1 mới (Reset đồng hồ 300s về 0s) để xoay sang Key tiếp theo — ${options.label}`,
        {
          reqId,
          url,
          durationMs,
          serverReason: serverErrMessage,
          nextPipeAttempt: freshPipeAttempt + 2,
        },
        reqId,
        durationMs
      );
      continue;
    }

    if (!effectiveOk) {
      logger.error(
        options.scope,
        `✖ API trả về lỗi HTTP ${effectiveStatus} tại ${url} — ${options.label}: ${String(recordData.error || res.statusText)}`,
        {
          reqId,
          url,
          httpStatus: effectiveStatus,
          durationMs: totalElapsedMs,
          serverError: recordData.error,
          poolExhausted429: recordData.poolExhausted429,
          debugTrace: serverDebugTrace,
          requestSummary: options.requestSummary || {},
        },
        reqId,
        totalElapsedMs
      );
    } else if (!options.silentSuccessLog) {
      logger.info(
        options.scope,
        `✔ Hoàn tất ${method} ${url} — ${options.label}${freshPipeAttempt > 0 ? ` (sau ${freshPipeAttempt + 1} Sợi dây 1)` : ''}`,
        {
          reqId,
          httpStatus: effectiveStatus,
          durationMs: totalElapsedMs,
          freshPipeCount: freshPipeAttempt + 1,
          modelUsed: recordData.modelUsed,
          keyUsed: recordData.keyUsed,
          didFallback: recordData.didFallback,
          debugTrace: serverDebugTrace,
          requestSummary: options.requestSummary || {},
        },
        reqId,
        totalElapsedMs
      );
    }

    return {
      ok: effectiveOk,
      status: effectiveStatus,
      statusText: res.statusText,
      durationMs: totalElapsedMs,
      reqId,
      rawText: rawTrimmed,
      data: parsedData,
      errorMessage: serverErrMessage,
      debugTrace: serverDebugTrace,
    };
  }

  throw new Error(`Đã thử mở lại kết nối mới ${MAX_FRESH_PIPE_RETRIES} lần nhưng không thành công.`);
}

