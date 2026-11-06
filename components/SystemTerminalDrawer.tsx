'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Terminal,
  X,
  Trash2,
  Copy,
  Check,
  Download,
  ChevronDown,
  ChevronRight,
  Maximize2,
  Minimize2,
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  Info,
  Bug,
  Search,
  ArrowDownCircle,
  Minus,
} from 'lucide-react';
import {
  StructuredLogEntry,
  LogLevel,
  LogScope,
  subscribeToLogs,
  clearClientLogs,
  syncServerLogsFromApi,
  safeJsonStringify,
  ServerDebugTrace,
} from '@/lib/logger';

interface SystemTerminalDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOpen: () => void;
}

const SCOPE_BADGE_CLASSES: Record<LogScope, string> = {
  TRANSLATE: 'bg-[#8C2D19] text-white border-[#A63A22]',
  GLOSSARY_SCAN: 'bg-emerald-700 text-white border-emerald-500',
  AI_EDITOR: 'bg-blue-700 text-white border-blue-500',
  KEY_POOL: 'bg-amber-700 text-white border-amber-500',
  MODELS_API: 'bg-purple-700 text-white border-purple-500',
  FETCH_URL: 'bg-teal-700 text-white border-teal-500',
  HTTP_CLIENT: 'bg-zinc-700 text-zinc-100 border-zinc-500',
  BATCH_QUEUE: 'bg-pink-800 text-white border-pink-500',
  QA_SCAN: 'bg-indigo-700 text-white border-indigo-500',
  STORAGE: 'bg-stone-700 text-stone-200 border-stone-500',
};

const LEVEL_STYLES: Record<
  LogLevel,
  {
    rowBg: string;
    textColor: string;
    badgeBg: string;
    label: string;
  }
> = {
  error: {
    rowBg: 'bg-red-950/45 hover:bg-red-950/70 border-l-2 border-l-red-500',
    textColor: 'text-red-200',
    badgeBg: 'bg-red-600/30 text-red-300 border border-red-500/50',
    label: 'ERROR',
  },
  warn: {
    rowBg: 'bg-amber-950/35 hover:bg-amber-950/55 border-l-2 border-l-amber-400',
    textColor: 'text-amber-100',
    badgeBg: 'bg-amber-500/25 text-amber-300 border border-amber-500/40',
    label: 'WARN',
  },
  info: {
    rowBg: 'hover:bg-zinc-800/70 border-l-2 border-l-transparent',
    textColor: 'text-zinc-200',
    badgeBg: 'bg-sky-500/20 text-sky-300 border border-sky-500/30',
    label: 'INFO',
  },
  debug: {
    rowBg: 'hover:bg-zinc-800/50 border-l-2 border-l-purple-500/40 opacity-90',
    textColor: 'text-zinc-300',
    badgeBg: 'bg-purple-500/20 text-purple-300 border border-purple-500/30',
    label: 'TRACE',
  },
};

export default function SystemTerminalDrawer({
  isOpen,
  onClose,
  onOpen,
}: SystemTerminalDrawerProps) {
  const [allLogs, setAllLogs] = useState<StructuredLogEntry[]>([]);
  const [isSyncingServer, setIsSyncingServer] = useState(false);

  const [levelFilter, setLevelFilter] = useState<'ALL' | LogLevel>('ALL');
  const [scopeFilter, setScopeFilter] = useState<'ALL' | LogScope>('ALL');
  const [envFilter, setEnvFilter] = useState<'ALL' | 'client' | 'server'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMinimizedPill, setIsMinimizedPill] = useState(false);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [copiedState, setCopiedState] = useState<'all' | 'errors' | string | null>(null);

  const logContainerRef = useRef<HTMLDivElement | null>(null);

  // Reset minimized pill state whenever isOpen transitions so clicking the Top Header Terminal button always opens the full drawer
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isMinimizedPill) {
      setIsMinimizedPill(false);
    }
  }

  // Subscribe to unified client + server logs
  useEffect(() => {
    const unsubscribe = subscribeToLogs((entries, latest) => {
      setAllLogs(entries);
      // Automatically expand error entries so user sees full details right away
      if (latest && latest.level === 'error') {
        setExpandedIds((prev) => {
          const next = new Set(prev);
          next.add(latest.id);
          return next;
        });
      }
    });
    return unsubscribe;
  }, []);

  // Filtered logs
  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allLogs.filter((entry) => {
      if (levelFilter !== 'ALL' && entry.level !== levelFilter) return false;
      if (scopeFilter !== 'ALL' && entry.scope !== scopeFilter) return false;
      if (envFilter !== 'ALL' && entry.env !== envFilter) return false;
      if (q) {
        const inMsg = entry.message.toLowerCase().includes(q);
        const inReq = (entry.reqId || '').toLowerCase().includes(q);
        const inScope = entry.scope.toLowerCase().includes(q);
        const inDetails = entry.details
          ? safeJsonStringify(entry.details).toLowerCase().includes(q)
          : false;
        return inMsg || inReq || inScope || inDetails;
      }
      return true;
    });
  }, [allLogs, levelFilter, scopeFilter, envFilter, searchQuery]);

  // Counts
  const counts = useMemo(() => {
    let errors = 0;
    let warns = 0;
    let infos = 0;
    let debugs = 0;
    for (const l of allLogs) {
      if (l.level === 'error') errors++;
      else if (l.level === 'warn') warns++;
      else if (l.level === 'info') infos++;
      else if (l.level === 'debug') debugs++;
    }
    return { total: allLogs.length, errors, warns, infos, debugs };
  }, [allLogs]);

  // Auto-scroll effect
  useEffect(() => {
    if (!isOpen || isMinimizedPill || !autoScroll) return;
    const el = logContainerRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [filteredLogs.length, isOpen, isMinimizedPill, autoScroll]);

  const handleSyncServerLogs = useCallback(async () => {
    setIsSyncingServer(true);
    try {
      await syncServerLogsFromApi();
    } finally {
      setIsSyncingServer(false);
    }
  }, []);

  // Sync server logs automatically when opening the drawer and poll every 4s while open
  useEffect(() => {
    if (!isOpen || isMinimizedPill) return;
    void syncServerLogsFromApi();
    const timer = setInterval(() => {
      void syncServerLogsFromApi();
    }, 4000);
    return () => clearInterval(timer);
  }, [isOpen, isMinimizedPill]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const formatEntryForCopy = (entry: StructuredLogEntry) => {
    const time = entry.timestamp.slice(11, 23);
    const dur =
      typeof entry.durationMs === 'number'
        ? ` (${(entry.durationMs / 1000).toFixed(2)}s / ${entry.durationMs}ms)`
        : '';
    const req = entry.reqId ? ` [${entry.reqId}]` : '';
    const envTag = entry.env === 'server' ? '[SERVER]' : '[CLIENT]';
    const header = `[${time}] ${envTag} [${entry.level.toUpperCase()}] [${entry.scope}]${req}${dur} ${entry.message}`;
    if (!entry.details || Object.keys(entry.details).length === 0) {
      return header;
    }
    return `${header}\n${safeJsonStringify(entry.details, 2)}`;
  };

  const handleCopyLogs = async (mode: 'all' | 'errors') => {
    const targetList =
      mode === 'errors'
        ? allLogs.filter((l) => l.level === 'error' || l.level === 'warn')
        : filteredLogs;
    const text =
      targetList.length === 0
        ? 'Không có dòng log nào.'
        : targetList.map(formatEntryForCopy).join('\n\n' + '-'.repeat(72) + '\n\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedState(mode);
      setTimeout(() => setCopiedState(null), 2000);
    } catch {
      // ignore
    }
  };

  const handleCopySingleEntry = async (entry: StructuredLogEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(formatEntryForCopy(entry));
      setCopiedState(entry.id);
      setTimeout(() => setCopiedState(null), 1800);
    } catch {
      // ignore
    }
  };

  const handleDownloadJson = () => {
    const blob = new Blob([safeJsonStringify(allLogs, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mhc-terminal-logs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClearAll = () => {
    clearClientLogs();
    setExpandedIds(new Set());
  };

  // When closed completely, do not render floating pill (top header already has the unified Terminal button)
  if (!isOpen) {
    return null;
  }

  // Floating pill only when user explicitly clicks Minimize (-) while Terminal is open
  if (isMinimizedPill) {
    return (
      <div className="fixed right-4 bottom-3 z-[95] flex items-center gap-1">
        <button
          onClick={() => {
            setIsMinimizedPill(false);
            onOpen();
          }}
          className={`inline-flex items-center gap-1.5 rounded-l-lg border px-3 py-1.5 text-xs font-semibold shadow-lg transition ${
            counts.errors > 0
              ? 'border-red-300 bg-red-50 text-red-800 hover:bg-red-100'
              : 'border-[#C9B99A] bg-[#FBF8F1] text-[#1C1917] hover:bg-[#E5DEC9]'
          }`}
          title="Phóng to lại bảng Terminal"
        >
          <Terminal className="h-3.5 w-3.5 text-[#8C2D19]" />
          <span>Terminal (Đang thu gọn)</span>
          <span className="rounded bg-[#8C2D19]/12 px-1.5 py-0.2 font-mono text-[10px] font-bold text-[#8C2D19]">
            {counts.total}
          </span>
          {counts.errors > 0 && (
            <span className="rounded bg-red-600 px-1.5 py-0.2 font-mono text-[10px] font-bold text-white">
              {counts.errors} lỗi
            </span>
          )}
        </button>
        <button
          onClick={() => {
            setIsMinimizedPill(false);
            onClose();
          }}
          className="inline-flex items-center justify-center rounded-r-lg border border-l-0 border-[#C9B99A] bg-[#FBF8F1] px-2 py-1.5 text-xs text-[#6B6257] shadow-lg transition hover:bg-red-50 hover:text-red-700"
          title="Đóng hẳn Terminal"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-[95] flex flex-col border-t-2 border-zinc-700 bg-[#0D0F12] text-zinc-100 shadow-[0_-12px_40px_rgba(0,0,0,0.65)] transition-all duration-150 ${
        isMaximized ? 'h-[85vh]' : 'h-[360px]'
      }`}
    >
      {/* Top Terminal Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 bg-[#14171C] px-3 py-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-emerald-400">
            <Terminal className="h-4 w-4" />
            <span>MHC SYSTEM TERMINAL</span>
          </div>

          {/* Live Counters */}
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
            <button
              onClick={() => setLevelFilter('ALL')}
              className={`rounded px-2 py-0.5 transition ${
                levelFilter === 'ALL'
                  ? 'bg-zinc-700 font-bold text-white'
                  : 'bg-zinc-800/80 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Tất cả ({counts.total})
            </button>
            <button
              onClick={() => setLevelFilter(levelFilter === 'error' ? 'ALL' : 'error')}
              className={`flex items-center gap-1 rounded px-2 py-0.5 transition ${
                levelFilter === 'error'
                  ? 'bg-red-600 font-bold text-white'
                  : counts.errors > 0
                  ? 'bg-red-950/80 font-bold text-red-300 border border-red-500/40 hover:bg-red-900/60'
                  : 'bg-zinc-800/80 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <AlertCircle className="h-3 w-3" />
              Lỗi ({counts.errors})
            </button>
            <button
              onClick={() => setLevelFilter(levelFilter === 'warn' ? 'ALL' : 'warn')}
              className={`flex items-center gap-1 rounded px-2 py-0.5 transition ${
                levelFilter === 'warn'
                  ? 'bg-amber-600 font-bold text-white'
                  : counts.warns > 0
                  ? 'bg-amber-950/70 text-amber-300 border border-amber-500/30'
                  : 'bg-zinc-800/80 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <AlertTriangle className="h-3 w-3" />
              Cảnh báo ({counts.warns})
            </button>
            <button
              onClick={() => setLevelFilter(levelFilter === 'info' ? 'ALL' : 'info')}
              className={`flex items-center gap-1 rounded px-2 py-0.5 transition ${
                levelFilter === 'info'
                  ? 'bg-sky-600 font-bold text-white'
                  : 'bg-zinc-800/80 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Info className="h-3 w-3" />
              Info ({counts.infos})
            </button>
            <button
              onClick={() => setLevelFilter(levelFilter === 'debug' ? 'ALL' : 'debug')}
              className={`flex items-center gap-1 rounded px-2 py-0.5 transition ${
                levelFilter === 'debug'
                  ? 'bg-purple-600 font-bold text-white'
                  : 'bg-zinc-800/80 text-zinc-400 hover:text-zinc-200'
              }`}
              title="Xem nhật ký xoay tua từng Key trong Key Pool trên Server"
            >
              <Bug className="h-3 w-3" />
              Key Trace ({counts.debugs})
            </button>
          </div>

          {/* Client / Server Env Filter */}
          <select
            value={envFilter}
            onChange={(e) => setEnvFilter(e.target.value as 'ALL' | 'client' | 'server')}
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-[11px] text-zinc-200 focus:border-emerald-500 focus:outline-hidden"
            title="Lọc theo nguồn phát sinh log (Client / Server)"
          >
            <option value="ALL">Nguồn: CLI + SRV</option>
            <option value="client">Chỉ CLIENT (CLI)</option>
            <option value="server">Chỉ SERVER (SRV)</option>
          </select>

          {/* Scope Filter Dropdown */}
          <select
            value={scopeFilter}
            onChange={(e) => setScopeFilter(e.target.value as 'ALL' | LogScope)}
            className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-mono text-[11px] text-zinc-200 focus:border-emerald-500 focus:outline-hidden"
          >
            <option value="ALL">Phân hệ: Tất cả</option>
            <option value="GLOSSARY_SCAN">GLOSSARY_SCAN (Quét Từ Điển)</option>
            <option value="TRANSLATE">TRANSLATE (Dịch Chương AI)</option>
            <option value="KEY_POOL">KEY_POOL (Xoay Tua Key)</option>
            <option value="AI_EDITOR">AI_EDITOR (Biên Tập AI)</option>
            <option value="BATCH_QUEUE">BATCH_QUEUE (Hàng Đợi Dịch)</option>
            <option value="QA_SCAN">QA_SCAN (Kiểm Định QA)</option>
            <option value="MODELS_API">MODELS_API (Cấu Hình Key)</option>
            <option value="FETCH_URL">FETCH_URL (Tải Chương Web)</option>
            <option value="HTTP_CLIENT">HTTP_CLIENT (Giao Tiếp Mạng)</option>
            <option value="STORAGE">STORAGE (Lưu Trữ Dữ Liệu)</option>
          </select>

          {/* Search Input */}
          <div className="relative w-48 sm:w-60">
            <Search className="absolute top-1.5 left-2 h-3.5 w-3.5 text-zinc-500" />
            <input
              type="text"
              placeholder="Tìm reqId, lỗi, mã chương..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded border border-zinc-700 bg-zinc-900 py-1 pr-6 pl-7 font-mono text-[11px] text-zinc-100 placeholder-zinc-500 focus:border-emerald-500 focus:outline-hidden"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute top-1.5 right-1.5 text-zinc-400 hover:text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Right Action Toolbar */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={handleSyncServerLogs}
            disabled={isSyncingServer}
            className="flex items-center gap-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 font-mono text-[11px] text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
            title="Đồng bộ thêm các dòng log trực tiếp từ bộ nhớ Server"
          >
            <RefreshCw className={`h-3 w-3 ${isSyncingServer ? 'animate-spin text-emerald-400' : ''}`} />
            <span className="hidden md:inline">Đồng bộ Server</span>
          </button>

          <button
            onClick={() => handleCopyLogs('errors')}
            className="flex items-center gap-1 rounded border border-red-500/50 bg-red-950/60 px-2.5 py-1 font-mono text-[11px] font-semibold text-red-200 hover:bg-red-900/70"
            title="Copy toàn bộ các dòng LỖI + CẢNH BÁO kèm chi tiết JSON để gửi kiểm tra"
          >
            {copiedState === 'errors' ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span>Đã copy Lỗi!</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-red-400" />
                <span>Copy Log Lỗi ({counts.errors + counts.warns})</span>
              </>
            )}
          </button>

          <button
            onClick={() => handleCopyLogs('all')}
            className="flex items-center gap-1 rounded border border-zinc-700 bg-zinc-800 px-2.5 py-1 font-mono text-[11px] font-medium text-zinc-200 hover:bg-zinc-700"
            title="Copy toàn bộ nhật ký đang hiển thị"
          >
            {copiedState === 'all' ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span>Đã copy!</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Copy tất cả</span>
              </>
            )}
          </button>

          <button
            onClick={handleDownloadJson}
            className="flex items-center gap-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 font-mono text-[11px] text-zinc-300 hover:bg-zinc-700"
            title="Tải toàn bộ Log về máy dạng file .json"
          >
            <Download className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={handleClearAll}
            className="flex items-center gap-1 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 font-mono text-[11px] text-zinc-300 hover:bg-red-950 hover:text-red-300"
            title="Xóa sạch lịch sử Terminal (cả Client và Server)"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>

          <button
            onClick={() => setAutoScroll(!autoScroll)}
            className={`flex items-center gap-1 rounded border px-2 py-1 font-mono text-[11px] ${
              autoScroll
                ? 'border-emerald-600/60 bg-emerald-950/50 text-emerald-300'
                : 'border-zinc-700 bg-zinc-800 text-zinc-400'
            }`}
            title="Tự động cuộn xuống dòng log mới nhất"
          >
            <ArrowDownCircle className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Auto-scroll</span>
          </button>

          <div className="mx-0.5 h-4 w-px bg-zinc-700" />

          <button
            onClick={() => setIsMaximized(!isMaximized)}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
            title={isMaximized ? 'Thu nhỏ về nửa dưới màn hình' : 'Phóng to toàn màn hình'}
          >
            {isMaximized ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </button>

          <button
            onClick={() => setIsMinimizedPill(true)}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
            title="Thu gọn thành nút nổi ở góc dưới phải"
          >
            <Minus className="h-4 w-4" />
          </button>

          <button
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-red-900/60 hover:text-white"
            title="Đóng Terminal (Ctrl + `)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Log Stream Body */}
      <div
        ref={logContainerRef}
        className="flex-1 overflow-y-auto divide-y divide-zinc-800/60 font-mono text-xs"
      >
        {filteredLogs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center p-6 text-center text-zinc-500">
            <Terminal className="mb-2 h-8 w-8 opacity-40" />
            <p className="text-xs font-semibold text-zinc-400">
              Chưa có dòng nhật ký nào khớp bộ lọc hiện tại.
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">
              Bạn có thể giữ nguyên bảng Terminal này ở dưới đáy màn hình (phím tắt{' '}
              <kbd className="rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-zinc-300">
                Ctrl + `
              </kbd>
              ) và bấm <strong className="text-emerald-400">Quét Dựng Từ Điển</strong> hoặc{' '}
              <strong className="text-emerald-400">Dịch AI</strong> để xem từng bước chạy trực tiếp!
            </p>
          </div>
        ) : (
          filteredLogs.map((entry) => {
            const isExpanded = expandedIds.has(entry.id);
            const lvlStyle = LEVEL_STYLES[entry.level] || LEVEL_STYLES.info;
            const scopeClass =
              SCOPE_BADGE_CLASSES[entry.scope] || SCOPE_BADGE_CLASSES.HTTP_CLIENT;
            const timeStr = entry.timestamp.slice(11, 23);
            const hasDetails =
              Boolean(entry.details) && Object.keys(entry.details || {}).length > 0;

            const detailsObj = (entry.details || {}) as Record<string, unknown>;
            const rawResponseFullText =
              typeof detailsObj.rawResponseFullText === 'string'
                ? detailsObj.rawResponseFullText
                : undefined;
            const diagnosis =
              typeof detailsObj.diagnosis === 'string'
                ? detailsObj.diagnosis
                : undefined;
            const debugTrace = detailsObj.debugTrace as ServerDebugTrace | undefined;

            return (
              <div key={entry.id} className={`transition ${lvlStyle.rowBg}`}>
                {/* Main Log Row */}
                <div
                  onClick={() => hasDetails && toggleExpand(entry.id)}
                  className={`flex items-start gap-2 px-3 py-1.5 ${
                    hasDetails ? 'cursor-pointer' : ''
                  }`}
                >
                  <span className="mt-0.5 shrink-0 text-zinc-500">
                    {hasDetails ? (
                      isExpanded ? (
                        <ChevronDown className="h-3.5 w-3.5 text-zinc-300" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />
                      )
                    ) : (
                      <span className="inline-block w-3.5" />
                    )}
                  </span>

                  {/* Timestamp */}
                  <span className="shrink-0 text-[11px] text-zinc-400 select-all">
                    {timeStr}
                  </span>

                  {/* Client / Server Tag */}
                  <span
                    className={`shrink-0 rounded px-1 py-0.2 text-[9px] font-bold uppercase ${
                      entry.env === 'server'
                        ? 'bg-indigo-950 text-indigo-300 border border-indigo-700/50'
                        : 'bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    {entry.env === 'server' ? 'SRV' : 'CLI'}
                  </span>

                  {/* Level Badge */}
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.2 text-[10px] font-bold ${lvlStyle.badgeBg}`}
                  >
                    {lvlStyle.label}
                  </span>

                  {/* Scope Badge */}
                  <span
                    className={`shrink-0 rounded border px-1.5 py-0.2 text-[10px] font-bold ${scopeClass}`}
                  >
                    {entry.scope}
                  </span>

                  {/* Request ID & Duration */}
                  {entry.reqId && (
                    <span className="shrink-0 rounded bg-zinc-800/90 px-1.5 py-0.2 text-[10px] text-amber-300/90">
                      {entry.reqId}
                    </span>
                  )}

                  {typeof entry.durationMs === 'number' && (
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.2 text-[10px] font-bold ${
                        entry.durationMs >= 45000
                          ? 'bg-red-900/70 text-red-200'
                          : entry.durationMs >= 15000
                          ? 'bg-amber-900/60 text-amber-200'
                          : 'bg-emerald-950/70 text-emerald-300'
                      }`}
                    >
                      {(entry.durationMs / 1000).toFixed(2)}s
                    </span>
                  )}

                  {/* Message */}
                  <span className={`flex-1 break-words ${lvlStyle.textColor}`}>
                    {entry.message}
                  </span>

                  {/* Copy Single Row Button */}
                  <button
                    onClick={(e) => handleCopySingleEntry(entry, e)}
                    className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-zinc-400 hover:bg-zinc-700 hover:text-white"
                    title="Copy riêng dòng log này (kèm toàn bộ chi tiết JSON)"
                  >
                    {copiedState === entry.id ? (
                      <span className="text-emerald-400 font-bold">Đã copy</span>
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </button>
                </div>

                {/* Expanded Details Drawer */}
                {isExpanded && hasDetails && (
                  <div className="border-t border-zinc-800/80 bg-[#08090C] px-8 py-2.5 text-[11px]">
                    {/* Highlighted Diagnosis & Raw Proxy Output for Non-JSON / Upstream Errors */}
                    {(rawResponseFullText || diagnosis) && (
                      <div className="mb-2.5 rounded-lg border border-red-500/60 bg-red-950/40 p-2.5 text-red-200">
                        {diagnosis && (
                          <div className="mb-1.5 flex items-start gap-1.5 font-semibold text-amber-300">
                            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>Chẩn đoán tự động: {diagnosis}</span>
                          </div>
                        )}
                        {rawResponseFullText && (
                          <div>
                            <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-red-300">
                              Nguyên văn phản hồi thô từ Server / Cổng Proxy (rawResponseFullText):
                            </div>
                            <pre className="overflow-x-auto rounded border border-red-800/60 bg-black/70 p-2 font-mono text-xs text-red-300 whitespace-pre-wrap">
                              {rawResponseFullText}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Server Key Pool Attempt Table if present */}
                    {debugTrace &&
                      Array.isArray(debugTrace.attempts) &&
                      debugTrace.attempts.length > 0 && (
                        <div className="mb-2.5 rounded-lg border border-zinc-700 bg-zinc-900/70 p-2">
                          <div className="mb-1.5 flex items-center justify-between text-[10px] font-bold uppercase text-amber-300">
                            <span>
                              Lịch sử Xoay Tua Key trên Server ({debugTrace.attempts.length} lần thử • Tổng Pool: {debugTrace.totalPoolKeys} key)
                            </span>
                            <span>
                              Tổng thời gian Server: {(debugTrace.totalDurationMs / 1000).toFixed(2)}s
                            </span>
                          </div>
                          <div className="space-y-1">
                            {debugTrace.attempts.map((att) => (
                              <div
                                key={att.attempt}
                                className={`flex flex-wrap items-center gap-2 rounded px-2 py-1 text-[11px] ${
                                  att.outcome === 'success'
                                    ? 'bg-emerald-950/40 text-emerald-200'
                                    : 'bg-red-950/50 text-red-200'
                                }`}
                              >
                                <span className="font-bold">#{att.attempt}</span>
                                <span className="rounded bg-zinc-800 px-1.5 py-0.2 text-amber-300">
                                  Key #{att.keyIndex} ({att.maskedKey})
                                </span>
                                <span className="text-sky-300">{att.targetModel}</span>
                                <span className="font-bold">
                                  → {att.outcome.toUpperCase()} ({(att.latencyMs / 1000).toFixed(2)}s)
                                </span>
                                {att.errorMessage && (
                                  <span className="text-red-300 break-all">
                                    • {att.errorMessage}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                    {/* Full JSON Payload */}
                    <div className="flex items-center justify-between pb-1 text-[10px] font-bold uppercase text-zinc-400">
                      <span>Chi tiết dữ liệu (JSON Details):</span>
                      <button
                        onClick={(e) => handleCopySingleEntry(entry, e)}
                        className="text-emerald-400 hover:underline"
                      >
                        Copy toàn bộ mục này
                      </button>
                    </div>
                    <pre className="max-h-64 overflow-y-auto rounded border border-zinc-800 bg-black/80 p-2.5 font-mono text-[11px] leading-relaxed text-emerald-300/90 whitespace-pre-wrap">
                      {safeJsonStringify(entry.details, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
