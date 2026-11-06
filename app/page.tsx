'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Edit3,
  Columns,
  FolderUp,
  Sliders,
  Palette,
  Download,
  Search,
  CheckSquare,
  Square,
  Play,
  Pause,
  Trash2,
  Sparkles,
  Undo2,
  Redo2,
  Scissors,
  Copy,
  ClipboardPaste,
  Replace,
  Wand2,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldAlert,
  Loader2,
  Plus,
  FileCheck2,
  Filter,
  ArrowUpDown,
  FileUp,
  Bookmark,
  Highlighter,
  StickyNote,
  ToggleLeft,
  ToggleRight,
  Maximize2,
  Minimize2,
  RotateCcw,
  ChevronUp,
  Library,
  Cpu,
  X,
  XCircle,
  Terminal,
  HelpCircle,
} from 'lucide-react';
import {
  Chapter,
  ChapterAlignment,
  ChapterStatus,
  CustomFontRecord,
  EditorHistorySnapshot,
  GlossaryEntry,
  HighlightColor,
  InstructionProfile,
  ModelConfigState,
  NovelLibrarySummary,
  NovelProject,
  ReaderHighlight,
  ReaderSettings,
  ReadingBookmark,
  ThinkingLevelOption,
} from '@/lib/types';
import {
  DEFAULT_EDITORIAL_INSTRUCTION_ID,
  DEFAULT_INSTRUCTION_ID,
  DEFAULT_QA_VALIDATION_RULES,
  DEFAULT_READER_SETTINGS,
  DEFAULT_THINKING_LEVEL,
  THINKING_LEVEL_OPTIONS,
} from '@/lib/seed-data';
import {
  deleteChaptersBulk,
  deleteCustomFont,
  deleteGlossaryEntry,
  deleteGlossaryEntriesBulk,
  deleteHighlight,
  deleteInstructionProfile,
  deleteNovelAndData,
  deleteAllNovelsAndData,
  duplicateNovelProject,
  ensureSeedDataInitialized,
  getAllCustomFonts,
  getAllNovelLibrarySummaries,
  getAllNovels,
  getChaptersByNovel,
  getGlossaryByNovel,
  getHighlightsByNovel,
  loadActiveNovelId,
  loadModelConfig,
  loadReaderSettings,
  loadReadingBookmark,
  normalizeVietnameseText,
  saveActiveNovelId,
  saveChapter,
  saveChaptersBulk,
  saveCustomFont,
  saveGlossaryEntriesBulk,
  saveHighlight,
  saveHighlightsBulk,
  saveInstructionProfile,
  saveModelConfig,
  saveNovel,
  saveReaderSettings,
  saveReadingBookmark,
  syncProjectKeysWithServer,
} from '@/lib/storage';
import { buildEnglishLeakRegex, scanChapterQA } from '@/lib/qa-scanner';
import {
  AlignedBlockPair,
  applyBlockUpdatesToChapter,
  buildChapterBlockPairs,
  extractDirtyBlockTargets,
  serializeBodyBlocksToContent,
} from '@/lib/block-engine';
import { logger, safeFetchJson, subscribeToLogs } from '@/lib/logger';
import ImportModal from '@/components/ImportModal';
import ReaderAppearanceModal from '@/components/ReaderAppearanceModal';
import InstructionsGlossaryModal from '@/components/InstructionsGlossaryModal';
import FullTextSearchReplaceModal from '@/components/FullTextSearchReplaceModal';
import ExportModal from '@/components/ExportModal';
import TranslationImportModal from '@/components/TranslationImportModal';
import NovelLibraryModal from '@/components/NovelLibraryModal';
import SystemTerminalDrawer from '@/components/SystemTerminalDrawer';
import UserGuideModal from '@/components/UserGuideModal';

type WorkspaceMode = 'reader' | 'editor';
type SortOption =
  | 'prefix_asc'
  | 'prefix_desc'
  | 'length_desc'
  | 'length_asc'
  | 'status'
  | 'qa_issues_first';
type FilterOption =
  | 'all'
  | 'raw'
  | 'translating'
  | 'translated'
  | 'edited'
  | 'error'
  | 'qa_any'
  | 'qa_chinese'
  | 'qa_english'
  | 'qa_block_mismatch'
  | 'qa_length_ratio'
  | 'qa_repeated'
  | 'qa_glossary';

const STATUS_LABELS: Record<ChapterStatus, { label: string; colorClass: string }> = {
  raw: {
    label: 'Chưa dịch',
    colorClass: 'bg-[#E5DEC9]/70 text-[#605A52]',
  },
  queued: {
    label: 'Hàng đợi',
    colorClass: 'bg-amber-100 text-amber-800',
  },
  translating: {
    label: 'Đang dịch...',
    colorClass: 'bg-amber-500/20 text-amber-900 animate-pulse',
  },
  translated: {
    label: 'Hoàn thành • Chưa duyệt',
    colorClass: 'bg-[#1E6F50]/15 text-[#1E6F50]',
  },
  edited: {
    label: 'Đã duyệt',
    colorClass: 'bg-[#1D4ED8]/15 text-[#1D4ED8]',
  },
  error: {
    label: 'Lỗi API',
    colorClass: 'bg-red-100 text-red-700',
  },
};

const HIGHLIGHT_COLOR_STYLES: Record<
  HighlightColor,
  { label: string; bgClass: string; badgeClass: string }
> = {
  amber: {
    label: 'Vàng Hổ Phách',
    bgClass: 'bg-amber-300/45 text-inherit rounded px-0.5',
    badgeClass: 'bg-amber-400 text-amber-950',
  },
  jade: {
    label: 'Xanh Ngọc Bích',
    bgClass: 'bg-emerald-300/45 text-inherit rounded px-0.5',
    badgeClass: 'bg-emerald-500 text-white',
  },
  blue: {
    label: 'Xanh Thanh Thiên',
    bgClass: 'bg-sky-300/45 text-inherit rounded px-0.5',
    badgeClass: 'bg-sky-500 text-white',
  },
};

interface AutoResizeBlockTextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  value: string;
  minHeight?: number;
  textareaRefCallback?: (el: HTMLTextAreaElement | null) => void;
}

function AutoResizeBlockTextarea({
  value,
  minHeight = 40,
  textareaRefCallback,
  style,
  className = '',
  onChange,
  ...rest
}: AutoResizeBlockTextareaProps) {
  const localRef = useRef<HTMLTextAreaElement | null>(null);

  const adjustHeight = useCallback(() => {
    const el = localRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(minHeight, el.scrollHeight)}px`;
  }, [minHeight]);

  useEffect(() => {
    adjustHeight();
  }, [value, style?.fontSize, style?.lineHeight, style?.fontFamily, adjustHeight]);

  useEffect(() => {
    const el = localRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let prevWidth = el.clientWidth;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        if (Math.abs(w - prevWidth) > 2) {
          prevWidth = w;
          adjustHeight();
        }
      }
    });
    if (el.parentElement) {
      ro.observe(el.parentElement);
    }
    return () => ro.disconnect();
  }, [adjustHeight]);

  return (
    <textarea
      {...rest}
      ref={(el) => {
        localRef.current = el;
        if (textareaRefCallback) textareaRefCallback(el);
      }}
      rows={1}
      value={value}
      onChange={(e) => {
        adjustHeight();
        if (onChange) onChange(e);
      }}
      style={style}
      className={`resize-none overflow-hidden ${className}`}
    />
  );
}

export default function MacHuongCacStudioPage() {
  // Core Data State
  const [novels, setNovels] = useState<NovelProject[]>([]);
  const [activeNovelId, setActiveNovelId] = useState<string>('');
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);
  const [instructions, setInstructions] = useState<InstructionProfile[]>([]);
  const [glossary, setGlossary] = useState<GlossaryEntry[]>([]);
  const [highlights, setHighlights] = useState<ReaderHighlight[]>([]);
  const [savedBookmark, setSavedBookmark] = useState<ReadingBookmark | null>(null);
  const [customFonts, setCustomFonts] = useState<CustomFontRecord[]>([]);
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(
    DEFAULT_READER_SETTINGS
  );
  const [modelConfig, setModelConfig] = useState<ModelConfigState>({
    selectedModel: 'gemini-flash-latest',
    thinkingLevel: 'high',
    concurrency: 5,
    autoFallbackEnabled: true,
    fallbackModel: 'gemini-3.1-flash-lite',
    customBannedWords: [],
    qaRules: DEFAULT_QA_VALIDATION_RULES,
  });
  const [isInitializing, setIsInitializing] = useState(true);

  // Workspace UI State
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('editor');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Chapter Sidebar Search, Sort, Filter & Tickboxes
  const [chapterSearch, setChapterSearch] = useState('');
  const [quickJumpInput, setQuickJumpInput] = useState('');
  const [sortOption, setSortOption] = useState<SortOption>('prefix_asc');
  const [filterOption, setFilterOption] = useState<FilterOption>('all');
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(new Set());
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
  const [rangeFromInput, setRangeFromInput] = useState('');
  const [rangeToInput, setRangeToInput] = useState('');
  const [showRangeSelector, setShowRangeSelector] = useState(false);

  // Modals State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isTranslationImportModalOpen, setIsTranslationImportModalOpen] = useState(false);
  const [isAppearanceModalOpen, setIsAppearanceModalOpen] = useState(false);
  const [isInstructionsModalOpen, setIsInstructionsModalOpen] = useState(false);
  const [instructionsModalTab, setInstructionsModalTab] = useState<
    'instructions' | 'glossary' | 'model_keys'
  >('instructions');
  const [isSearchReplaceModalOpen, setIsSearchReplaceModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isLibraryModalOpen, setIsLibraryModalOpen] = useState(false);
  const [librarySummaries, setLibrarySummaries] = useState<
    Record<string, NovelLibrarySummary>
  >({});
  const [isNewNovelModalOpen, setIsNewNovelModalOpen] = useState(false);
  const [newNovelTitle, setNewNovelTitle] = useState('');
  const [newNovelOriginal, setNewNovelOriginal] = useState('');
  const [newNovelAuthor, setNewNovelAuthor] = useState('');
  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const [isUserGuideOpen, setIsUserGuideOpen] = useState(false);
  const [terminalCounts, setTerminalCounts] = useState<{ total: number; errors: number }>({
    total: 0,
    errors: 0,
  });

  useEffect(() => {
    return subscribeToLogs((entries) => {
      let errCount = 0;
      for (const e of entries) {
        if (e.level === 'error') errCount++;
      }
      setTerminalCounts({ total: entries.length, errors: errCount });
    });
  }, []);

  // Global keyboard shortcut: Ctrl + ` (or Cmd + `) to toggle System Terminal Drawer
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === '`' || e.code === 'Backquote')) {
        e.preventDefault();
        setIsTerminalOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  // Batch Translation / Editorial Queue State (Supports Pause / Resume / Hard Stop + Auto-Pause on 429)
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchStatus, setBatchStatus] = useState<'idle' | 'running' | 'paused'>('idle');
  const [batchPauseReason, setBatchPauseReason] = useState<string | null>(null);
  const [batchJobLabel, setBatchJobLabel] = useState<'translate' | 'ai_edit'>('translate');
  const [batchProgress, setBatchProgress] = useState<{
    completed: number;
    total: number;
    activeWorkers: number;
    lastModelUsed?: string;
    lastKeyUsed?: number;
  }>({ completed: 0, total: 0, activeWorkers: 0 });
  const stopBatchRef = useRef(false);
  const batchStatusRef = useRef<'idle' | 'running' | 'paused'>('idle');
  const batchQueueRef = useRef<Chapter[]>([]);
  const batchCursorRef = useRef<number>(0);
  const batchCompletedRef = useRef<number>(0);
  const batchRetryIndicesRef = useRef<number[]>([]);
  const batchPriorStatusesRef = useRef<Map<string, ChapterStatus>>(new Map());
  const batchAbortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const aiAssistAbortRef = useRef<AbortController | null>(null);

  // Unified 1:1 Block-ID Studio & AI Editor State
  const [editorTitle, setEditorTitle] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [historyStack, setHistoryStack] = useState<EditorHistorySnapshot[]>([]);
  const [historyPointer, setHistoryPointer] = useState<number>(-1);
  const [inEditorFindQuery, setInEditorFindQuery] = useState('');
  const [inEditorReplaceText, setInEditorReplaceText] = useState('');
  const [inEditorCaseSensitive, setInEditorCaseSensitive] = useState(false);
  const [inEditorWholeWord, setInEditorWholeWord] = useState(false);
  const [inEditorUseRegex, setInEditorUseRegex] = useState(false);
  const [inEditorIncludeTitle, setInEditorIncludeTitle] = useState(true);
  const [activeFindMatchIndex, setActiveFindMatchIndex] = useState(0);
  const [aiAssistLoading, setAiAssistLoading] = useState(false);
  const [aiAlternatives, setAiAlternatives] = useState<string[]>([]);
  const [customAiPrompt, setCustomAiPrompt] = useState('');
  const [showCustomAiInput, setShowCustomAiInput] = useState(false);
  const [editorStatusToast, setEditorStatusToast] = useState<string | null>(null);
  const [isEditorToolbarExpanded, setIsEditorToolbarExpanded] = useState(true);

  // Interactive 1:1 Block-ID Table State
  const [bilingualFilterMode, setBilingualFilterMode] = useState<'all' | 'dirty'>('all');
  const [singleBlockLoadingId, setSingleBlockLoadingId] = useState<string | null>(null);
  const [activeFocusedBlockId, setActiveFocusedBlockId] = useState<string>('TITLE');
  const [isEditingRawBlocks, setIsEditingRawBlocks] = useState(false);
  const blockTextareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  // Clean Reader Highlights & Bookmark State
  const [showHighlightsDrawer, setShowHighlightsDrawer] = useState(false);
  const [pendingHighlightText, setPendingHighlightText] = useState('');
  const [pendingHighlightBlockId, setPendingHighlightBlockId] = useState('P0001');
  const [pendingHighlightNote, setPendingHighlightNote] = useState('');
  const readerScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const editorScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sidebarListContainerRef = useRef<HTMLDivElement | null>(null);

  // Automatically scroll Editor & Reader viewports to top whenever activeChapterId changes
  useEffect(() => {
    if (!activeChapterId) return;
    if (editorScrollContainerRef.current) {
      editorScrollContainerRef.current.scrollTop = 0;
    }
    if (readerScrollContainerRef.current) {
      readerScrollContainerRef.current.scrollTop = 0;
    }
    const rafId = window.requestAnimationFrame(() => {
      setActiveFocusedBlockId('TITLE');
      if (editorScrollContainerRef.current) {
        editorScrollContainerRef.current.scrollTop = 0;
      }
      if (readerScrollContainerRef.current) {
        readerScrollContainerRef.current.scrollTop = 0;
      }
      if (sidebarListContainerRef.current) {
        const activeSidebarItem = sidebarListContainerRef.current.querySelector(
          `[data-sidebar-chapter-id="${activeChapterId}"]`
        );
        if (activeSidebarItem instanceof HTMLElement) {
          activeSidebarItem.scrollIntoView({ block: 'nearest' });
        }
      }
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [activeChapterId]);

  // Header Chapter Switcher Dropdown State
  const [isChapterDropdownOpen, setIsChapterDropdownOpen] = useState(false);
  const [chapterDropdownQuery, setChapterDropdownQuery] = useState('');
  const chapterDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isChapterDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        chapterDropdownRef.current &&
        !chapterDropdownRef.current.contains(e.target as Node)
      ) {
        setIsChapterDropdownOpen(false);
      }
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsChapterDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [isChapterDropdownOpen]);

  const showToast = useCallback((msg: string) => {
    setEditorStatusToast(msg);
    setTimeout(() => {
      setEditorStatusToast((prev) => (prev === msg ? null : prev));
    }, 3200);
  }, []);

  // Load initial seed data and settings
  useEffect(() => {
    let mounted = true;
    async function init() {
      const loadedReader = loadReaderSettings();
      const loadedModel = loadModelConfig();
      if (mounted) {
        setReaderSettings(loadedReader);
        setModelConfig({
          ...loadedModel,
          qaRules: loadedModel.qaRules || DEFAULT_QA_VALIDATION_RULES,
        });
      }

      // Sync saved API Key Pool between Server (/data/project-key-pool.json) and Browser (localStorage)
      syncProjectKeysWithServer(loadedModel.selectedModel).catch(() => {});

      const { novels: seededNovels, instructions: seededInst } =
        await ensureSeedDataInitialized();
      const fonts = await getAllCustomFonts();

      if (!mounted) return;
      setNovels(seededNovels);
      setInstructions(seededInst);
      setCustomFonts(fonts);

      // Register custom fonts in browser FontFace API
      for (const f of fonts) {
        try {
          const fontFace = new FontFace(f.name, `url(${f.dataBase64})`);
          const loaded = await fontFace.load();
          document.fonts.add(loaded);
        } catch {
          // Ignore invalid font
        }
      }

      if (seededNovels.length > 0) {
        const savedActiveId = loadActiveNovelId();
        const initialNovel =
          seededNovels.find((n) => n.id === savedActiveId) || seededNovels[0];
        const firstNovelId = initialNovel.id;
        setActiveNovelId(firstNovelId);
        saveActiveNovelId(firstNovelId);
        const [chList, glList, hlList, allSummaries] = await Promise.all([
          getChaptersByNovel(firstNovelId),
          getGlossaryByNovel(firstNovelId),
          getHighlightsByNovel(firstNovelId),
          getAllNovelLibrarySummaries(seededNovels),
        ]);
        if (!mounted) return;
        setLibrarySummaries(allSummaries);
        const activeGl = initialNovel.includeGlossary
          ? glList.filter((g) => g.enabled !== false)
          : [];
        const scannedList = chList.map((ch) => ({
          ...ch,
          qaReport: scanChapterQA(
            ch,
            loadedModel.customBannedWords,
            loadedModel.qaRules || DEFAULT_QA_VALIDATION_RULES,
            activeGl
          ),
        }));
        setChapters(scannedList);
        setGlossary(glList);
        setHighlights(hlList);
        const bm = loadReadingBookmark(firstNovelId);
        setSavedBookmark(bm);

        if (scannedList.length > 0) {
          const ch1 =
            scannedList.find((c) => c.orderPrefix === '0001') || scannedList[0];
          setActiveChapterId(ch1.id);
        }
      }
      setIsInitializing(false);
    }
    init();
    return () => {
      mounted = false;
    };
  }, []);

  const activeNovel = useMemo(
    () => novels.find((n) => n.id === activeNovelId) || novels[0] || null,
    [novels, activeNovelId]
  );

  // Active Translation Instruction Preset (role === 'translation')
  const activeInstructionProfile = useMemo(() => {
    const id = activeNovel?.instructionProfileId || DEFAULT_INSTRUCTION_ID;
    return (
      instructions.find((i) => i.id === id) ||
      instructions.find((i) => (i.role || 'translation') === 'translation') ||
      instructions[0] || {
        id: 'default',
        name: 'Mặc định',
        description: '',
        genreTag: 'Tiên hiệp',
        role: 'translation',
        pronounRule: 'Ta - Ngươi',
        systemInstruction: '',
        includeGlossary: false,
        updatedAt: 0,
      }
    );
  }, [activeNovel, instructions]);

  // Active Editorial Instruction Preset (role === 'editorial')
  const activeEditorialProfile = useMemo(() => {
    const id =
      activeNovel?.editorialProfileId || DEFAULT_EDITORIAL_INSTRUCTION_ID;
    return (
      instructions.find((i) => i.id === id) ||
      instructions.find((i) => i.role === 'editorial') ||
      activeInstructionProfile
    );
  }, [activeNovel, instructions, activeInstructionProfile]);

  const activeChapter = useMemo(
    () => chapters.find((c) => c.id === activeChapterId) || null,
    [chapters, activeChapterId]
  );

  const syncedChapterKeyRef = useRef<string>('none');
  const currentChapterSyncKey = activeChapter
    ? `${activeChapter.id}:${activeChapter.updatedAt}:${activeChapter.translatedContent.length}`
    : 'none';

  useEffect(() => {
    if (currentChapterSyncKey === syncedChapterKeyRef.current) return;
    syncedChapterKeyRef.current = currentChapterSyncKey;
    const rafId = window.requestAnimationFrame(() => {
      if (!activeChapter) {
        setEditorTitle('');
        setEditorContent('');
        setHistoryStack([]);
        setHistoryPointer(-1);
        setAiAlternatives([]);
      } else {
        const initTitle = normalizeVietnameseText(
          activeChapter.titleTranslated || ''
        );
        const initContent = normalizeVietnameseText(
          activeChapter.translatedContent || ''
        );
        setEditorTitle(initTitle);
        setEditorContent(initContent);
        const initialSnap: EditorHistorySnapshot = {
          titleTranslated: initTitle,
          translatedContent: initContent,
          timestamp: activeChapter.updatedAt,
          label: 'Khởi tạo chương',
        };
        setHistoryStack([initialSnap]);
        setHistoryPointer(0);
        setAiAlternatives([]);
      }
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [currentChapterSyncKey, activeChapter]);

  const pushEditorSnapshot = useCallback(
    (nextTitle: string, nextContent: string, label: string) => {
      setEditorTitle(nextTitle);
      setEditorContent(nextContent);
      setHistoryStack((prev) => {
        const sliced = prev.slice(0, historyPointer + 1);
        const nextSnap: EditorHistorySnapshot = {
          titleTranslated: nextTitle,
          translatedContent: nextContent,
          timestamp: Date.now(),
          label,
        };
        const updated = [...sliced, nextSnap].slice(-60);
        setHistoryPointer(updated.length - 1);
        return updated;
      });
    },
    [historyPointer]
  );

  const handleUndo = useCallback(() => {
    if (historyPointer > 0) {
      const prevIdx = historyPointer - 1;
      const snap = historyStack[prevIdx];
      if (snap) {
        setEditorTitle(snap.titleTranslated);
        setEditorContent(snap.translatedContent);
        setHistoryPointer(prevIdx);
      }
    }
  }, [historyPointer, historyStack]);

  const handleRedo = useCallback(() => {
    if (historyPointer < historyStack.length - 1) {
      const nextIdx = historyPointer + 1;
      const snap = historyStack[nextIdx];
      if (snap) {
        setEditorTitle(snap.titleTranslated);
        setEditorContent(snap.translatedContent);
        setHistoryPointer(nextIdx);
      }
    }
  }, [historyPointer, historyStack]);

  // Save manual edits to IndexedDB + Rescan QA
  const handleSaveEditorChanges = useCallback(
    async (
      overrideTitle?: string,
      overrideContent?: string,
      silent = false,
      overrideAlignment?: ChapterAlignment,
      overrideModelUsed?: string,
      overrideKeyUsed?: number
    ) => {
      if (!activeChapter) return;
      const finalTitle =
        overrideTitle !== undefined ? overrideTitle : editorTitle;
      const finalContent =
        overrideContent !== undefined ? overrideContent : editorContent;

      const hasTranslation = Boolean(finalContent.trim() || finalTitle.trim());
      const nextStatus: ChapterStatus = hasTranslation
        ? activeChapter.status === 'translated' || activeChapter.status === 'edited'
          ? 'edited'
          : 'translated'
        : 'raw';

      const updatedChapter: Chapter = {
        ...activeChapter,
        titleTranslated: finalTitle,
        translatedContent: finalContent,
        alignment: overrideAlignment || activeChapter.alignment,
        translatedByModel: overrideModelUsed || activeChapter.translatedByModel,
        lastKeyUsed: overrideKeyUsed ?? activeChapter.lastKeyUsed,
        status: nextStatus,
        updatedAt: Date.now(),
      };
      updatedChapter.qaReport = scanChapterQA(
        updatedChapter,
        modelConfig.customBannedWords,
        modelConfig.qaRules || DEFAULT_QA_VALIDATION_RULES,
        glossary.filter((g) => g.enabled !== false)
      );

      await saveChapter(updatedChapter);
      syncedChapterKeyRef.current = `${updatedChapter.id}:${updatedChapter.updatedAt}:${updatedChapter.translatedContent.length}`;
      setChapters((prev) =>
        prev.map((c) => (c.id === updatedChapter.id ? updatedChapter : c))
      );
      if (!silent) {
        showToast('Đã lưu biên tập & cập nhật kiểm định QA!');
      }
    },
    [
      activeChapter,
      editorTitle,
      editorContent,
      modelConfig.customBannedWords,
      modelConfig.qaRules,
      glossary,
      showToast,
    ]
  );

  const refreshLibraryData = useCallback(async () => {
    const allNovels = await getAllNovels();
    setNovels(allNovels);
    const summaries = await getAllNovelLibrarySummaries(allNovels);
    setLibrarySummaries(summaries);
    return allNovels;
  }, []);

  const handleOpenLibraryModal = useCallback(async () => {
    await refreshLibraryData();
    setIsLibraryModalOpen(true);
  }, [refreshLibraryData]);

  // Switch Novel
  const handleSelectNovel = async (novelId: string) => {
    setActiveNovelId(novelId);
    saveActiveNovelId(novelId);
    setSelectedChapterIds(new Set());
    const [chList, glList, hlList] = await Promise.all([
      getChaptersByNovel(novelId),
      getGlossaryByNovel(novelId),
      getHighlightsByNovel(novelId),
    ]);
    const enabledGl = glList.filter((g) => g.enabled !== false);
    const scanned = chList.map((c) => ({
      ...c,
      qaReport: scanChapterQA(
        c,
        modelConfig.customBannedWords,
        modelConfig.qaRules || DEFAULT_QA_VALIDATION_RULES,
        enabledGl
      ),
    }));
    setChapters(scanned);
    setGlossary(glList);
    setHighlights(hlList);
    setSavedBookmark(loadReadingBookmark(novelId));
    setActiveChapterId(scanned[0]?.id || null);
  };

  const handleToggleNovelGlossary = async (enabled: boolean) => {
    if (!activeNovel) return;
    const updatedNovel: NovelProject = {
      ...activeNovel,
      includeGlossary: enabled,
      updatedAt: Date.now(),
    };
    await saveNovel(updatedNovel);
    setNovels((prev) =>
      prev.map((n) => (n.id === updatedNovel.id ? updatedNovel : n))
    );
    showToast(
      enabled
        ? 'Đã BẬT gửi kèm bảng Glossary trong mỗi Request Dịch / Biên tập AI!'
        : 'Đã TẮT gửi bảng Glossary (Chế độ mặc định).'
    );
  };

  const handleCreateNovel = async () => {
    if (!newNovelTitle.trim()) return;
    const newNovel: NovelProject = {
      id: `novel-${Date.now()}`,
      title: newNovelTitle.trim(),
      originalTitle: newNovelOriginal.trim(),
      author: newNovelAuthor.trim() || 'Khuyết danh',
      description: '',
      instructionProfileId: DEFAULT_INSTRUCTION_ID,
      editorialProfileId: DEFAULT_EDITORIAL_INSTRUCTION_ID,
      includeGlossary: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await saveNovel(newNovel);
    setNovels((prev) => [newNovel, ...prev]);
    setIsNewNovelModalOpen(false);
    setNewNovelTitle('');
    setNewNovelOriginal('');
    setNewNovelAuthor('');
    await handleSelectNovel(newNovel.id);
  };

  // Filtered & Sorted Chapters in Sidebar
  const filteredAndSortedChapters = useMemo(() => {
    const q = chapterSearch.trim().toLowerCase();

    const filtered = chapters.filter((ch) => {
      // Status / Multi-criteria QA filter
      if (filterOption === 'raw' && ch.status !== 'raw') return false;
      if (
        filterOption === 'translating' &&
        ch.status !== 'translating' &&
        ch.status !== 'queued'
      )
        return false;
      if (filterOption === 'translated' && ch.status !== 'translated') return false;
      if (filterOption === 'edited' && ch.status !== 'edited') return false;
      if (filterOption === 'error' && ch.status !== 'error') return false;
      if (filterOption === 'qa_any' && !ch.qaReport?.hasIssues) return false;
      if (
        filterOption === 'qa_chinese' &&
        !(ch.qaReport && ch.qaReport.residualChineseCount > 0)
      )
        return false;
      if (
        filterOption === 'qa_english' &&
        !(ch.qaReport && ch.qaReport.leakedEnglishCount > 0)
      )
        return false;
      if (
        filterOption === 'qa_block_mismatch' &&
        !ch.qaReport?.blockMismatch
      )
        return false;
      if (
        filterOption === 'qa_length_ratio' &&
        !ch.qaReport?.issues.some((i) => i.type === 'length_ratio')
      )
        return false;
      if (
        filterOption === 'qa_repeated' &&
        !(ch.qaReport && (ch.qaReport.repeatedParagraphCount || 0) > 0)
      )
        return false;
      if (
        filterOption === 'qa_glossary' &&
        !(ch.qaReport && (ch.qaReport.glossaryViolationCount || 0) > 0)
      )
        return false;

      // Search query on prefix, chapterNumber, titleRaw, titleTranslated
      if (q) {
        const matchPrefix = ch.orderPrefix.toLowerCase().includes(q);
        const matchNum = String(ch.chapterNumber) === q;
        const matchRaw = ch.titleRaw.toLowerCase().includes(q);
        const matchVi = ch.titleTranslated.toLowerCase().includes(q);
        if (!matchPrefix && !matchNum && !matchRaw && !matchVi) return false;
      }

      return true;
    });

    filtered.sort((a, b) => {
      if (sortOption === 'prefix_asc') {
        const cmp = a.orderPrefix.localeCompare(b.orderPrefix, undefined, {
          numeric: true,
        });
        return cmp !== 0 ? cmp : a.chapterNumber - b.chapterNumber;
      }
      if (sortOption === 'prefix_desc') {
        const cmp = b.orderPrefix.localeCompare(a.orderPrefix, undefined, {
          numeric: true,
        });
        return cmp !== 0 ? cmp : b.chapterNumber - a.chapterNumber;
      }
      if (sortOption === 'length_desc') {
        return b.charCount - a.charCount;
      }
      if (sortOption === 'length_asc') {
        return a.charCount - b.charCount;
      }
      if (sortOption === 'qa_issues_first') {
        const aIssues = a.qaReport?.issues.length || 0;
        const bIssues = b.qaReport?.issues.length || 0;
        if (bIssues !== aIssues) return bIssues - aIssues;
        return a.orderPrefix.localeCompare(b.orderPrefix, undefined, { numeric: true });
      }
      if (sortOption === 'status') {
        return a.status.localeCompare(b.status);
      }
      return 0;
    });

    return filtered;
  }, [chapters, chapterSearch, filterOption, sortOption]);

  // Tickbox handlers (Single click + Shift+Click range selection)
  const handleToggleChapterTick = (
    chapterId: string,
    indexInFiltered: number,
    shiftKey: boolean
  ) => {
    setSelectedChapterIds((prev) => {
      const next = new Set(prev);
      if (
        shiftKey &&
        lastClickedIndex !== null &&
        lastClickedIndex !== indexInFiltered
      ) {
        const start = Math.min(lastClickedIndex, indexInFiltered);
        const end = Math.max(lastClickedIndex, indexInFiltered);
        for (let i = start; i <= end; i++) {
          const item = filteredAndSortedChapters[i];
          if (item) next.add(item.id);
        }
      } else {
        if (next.has(chapterId)) {
          next.delete(chapterId);
        } else {
          next.add(chapterId);
        }
      }
      return next;
    });
    setLastClickedIndex(indexInFiltered);
  };

  // Replace current selection with ONLY the filtered results ("Chỉ chọn kết quả lọc")
  const handleSelectOnlyFiltered = () => {
    setSelectedChapterIds(new Set(filteredAndSortedChapters.map((c) => c.id)));
    showToast(
      `Đã chọn duy nhất ${filteredAndSortedChapters.length} chương trong kết quả lọc hiện tại!`
    );
  };

  const handleDeselectAll = () => {
    setSelectedChapterIds(new Set());
  };

  const handleInvertSelection = () => {
    setSelectedChapterIds((prev) => {
      const next = new Set<string>();
      filteredAndSortedChapters.forEach((c) => {
        if (!prev.has(c.id)) next.add(c.id);
      });
      return next;
    });
  };

  const handleSelectByRange = () => {
    const fromNum = parseInt(rangeFromInput, 10);
    const toNum = parseInt(rangeToInput, 10);
    if (Number.isNaN(fromNum) || Number.isNaN(toNum)) return;
    const min = Math.min(fromNum, toNum);
    const max = Math.max(fromNum, toNum);
    setSelectedChapterIds((prev) => {
      const next = new Set(prev);
      chapters.forEach((ch) => {
        const prefixVal = parseInt(ch.orderPrefix, 10);
        if (
          (ch.chapterNumber >= min && ch.chapterNumber <= max) ||
          (!Number.isNaN(prefixVal) && prefixVal >= min && prefixVal <= max)
        ) {
          next.add(ch.id);
        }
      });
      return next;
    });
    setShowRangeSelector(false);
  };

  // Quick Jump handler
  const handleQuickJump = (e: React.FormEvent) => {
    e.preventDefault();
    const target = quickJumpInput.trim();
    if (!target) return;
    const num = parseInt(target, 10);
    const padded = target.padStart(4, '0');
    const found = chapters.find(
      (c) =>
        c.orderPrefix === padded ||
        c.orderPrefix === target ||
        (!Number.isNaN(num) && c.chapterNumber === num)
    );
    if (found) {
      setActiveChapterId(found.id);
      setQuickJumpInput('');
    } else {
      showToast(`Không tìm thấy chương có mã #${target}`);
    }
  };

  const shouldSendGlossary = Boolean(activeNovel?.includeGlossary);
  const enabledGlossaryItems = useMemo(
    () => (shouldSendGlossary ? glossary.filter((g) => g.enabled !== false) : []),
    [shouldSendGlossary, glossary]
  );

  const effectiveFallbackModel = useMemo(() => {
    if (modelConfig.autoFallbackEnabled === false) return undefined;
    const fb = (modelConfig.fallbackModel || 'gemini-3.1-flash-lite').trim();
    return fb && fb !== modelConfig.selectedModel ? fb : undefined;
  }, [
    modelConfig.autoFallbackEnabled,
    modelConfig.fallbackModel,
    modelConfig.selectedModel,
  ]);

  const resolveSafePriorStatus = useCallback((ch: Chapter): ChapterStatus => {
    const savedPrior = batchPriorStatusesRef.current.get(ch.id);
    if (savedPrior && savedPrior !== 'queued' && savedPrior !== 'translating') {
      return savedPrior;
    }
    if (ch.status !== 'queued' && ch.status !== 'translating') {
      return ch.status;
    }
    return ch.translatedContent.trim() ? 'translated' : 'raw';
  }, []);

  // Cancel a single chapter's in-flight translation/edit request
  const handleCancelSingleChapter = useCallback(
    async (chapterId: string) => {
      const controller = batchAbortControllersRef.current.get(chapterId);
      if (controller) {
        controller.abort();
        batchAbortControllersRef.current.delete(chapterId);
      }
      const target = chapters.find((c) => c.id === chapterId);
      if (target) {
        const restoredStatus = resolveSafePriorStatus(target);
        const restored: Chapter = {
          ...target,
          status: restoredStatus,
          lastError: undefined,
          updatedAt: Date.now(),
        };
        await saveChapter(restored);
        setChapters((prev) =>
          prev.map((c) => (c.id === chapterId ? restored : c))
        );
        showToast(
          `Đã hủy dịch Chương #${target.orderPrefix} & khôi phục trạng thái!`
        );
      }
    },
    [chapters, resolveSafePriorStatus, showToast]
  );

  // Single-Chapter Full Translation (1 Request = 1 Full Chapter via Structured Output blocks-v1)
  const translateSingleChapter = useCallback(
    async (
      chapter: Chapter,
      options?: { isBatch?: boolean }
    ): Promise<{
      chapter: Chapter;
      aborted?: boolean;
      poolExhausted429?: boolean;
    }> => {
      const priorStatus = resolveSafePriorStatus(chapter);
      if (!batchPriorStatusesRef.current.has(chapter.id)) {
        batchPriorStatusesRef.current.set(chapter.id, priorStatus);
      }

      const controller = new AbortController();
      batchAbortControllersRef.current.set(chapter.id, controller);

      setChapters((prev) =>
        prev.map((c) =>
          c.id === chapter.id
            ? { ...c, status: 'translating', lastError: undefined }
            : c
        )
      );

      try {
        const res = await safeFetchJson<{
          titleTranslated?: string;
          translatedContent?: string;
          alignment?: ChapterAlignment;
          modelUsed?: string;
          keyUsed?: number;
          didFallback?: boolean;
          poolExhausted429?: boolean;
          error?: string;
        }>(
          '/api/translate',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              titleRaw: chapter.titleRaw,
              rawContent: chapter.rawContent,
              chapterNumber: chapter.chapterNumber,
              model: modelConfig.selectedModel,
              fallbackModel: effectiveFallbackModel,
              thinkingLevel:
                modelConfig.thinkingLevel || DEFAULT_THINKING_LEVEL,
              systemInstruction: activeInstructionProfile.systemInstruction,
              includeGlossary: shouldSendGlossary,
              glossary: enabledGlossaryItems,
            }),
          },
          {
            scope: 'TRANSLATE',
            label: `Dịch Chương #${chapter.orderPrefix} (${chapter.titleRaw.slice(0, 32)} • ${chapter.rawContent.length} chars)`,
          }
        );

        const data = res.data || {};
        if (!res.ok || !res.data) {
          const err = new Error(
            data.error || res.errorMessage || 'Lỗi dịch chương từ Server'
          ) as Error & { poolExhausted429?: boolean };
          if (res.status === 429 || data.poolExhausted429) {
            err.poolExhausted429 = true;
          }
          throw err;
        }

        const actualModelUsed: string =
          data.modelUsed || modelConfig.selectedModel;
        const actualKeyUsed: number | undefined =
          typeof data.keyUsed === 'number' ? data.keyUsed : undefined;

        const updated: Chapter = {
          ...chapter,
          titleTranslated: data.titleTranslated || chapter.titleTranslated,
          translatedContent: data.translatedContent || '',
          alignment: data.alignment || chapter.alignment,
          translatedByModel: actualModelUsed,
          lastKeyUsed: actualKeyUsed,
          status: 'translated',
          lastError: undefined,
          updatedAt: Date.now(),
        };
        updated.qaReport = scanChapterQA(
          updated,
          modelConfig.customBannedWords,
          modelConfig.qaRules || DEFAULT_QA_VALIDATION_RULES,
          enabledGlossaryItems
        );

        await saveChapter(updated);
        setChapters((prev) =>
          prev.map((c) => (c.id === updated.id ? updated : c))
        );
        if (options?.isBatch) {
          setBatchProgress((prev) => ({
            ...prev,
            lastModelUsed: actualModelUsed,
            lastKeyUsed: actualKeyUsed,
          }));
        } else if (data.didFallback) {
          showToast(
            `Đã dịch xong bằng model dự phòng ${actualModelUsed} (do model chính chạm 429)!`
          );
        }
        return { chapter: updated };
      } catch (err) {
        const isAborted =
          controller.signal.aborted ||
          (err instanceof Error && err.name === 'AbortError');

        if (isAborted) {
          logger.warn(
            'TRANSLATE',
            `Đã hủy (Abort) dịch Chương #${chapter.orderPrefix}`
          );
          const restored: Chapter = {
            ...chapter,
            status: priorStatus,
            lastError: undefined,
            updatedAt: Date.now(),
          };
          await saveChapter(restored);
          setChapters((prev) =>
            prev.map((c) => (c.id === restored.id ? restored : c))
          );
          return { chapter: restored, aborted: true };
        }

        const errMsg = (err as Error).message || 'Lỗi không xác định';
        const isPool429 =
          Boolean((err as { poolExhausted429?: boolean }).poolExhausted429) ||
          errMsg.includes('429') ||
          errMsg.includes('RESOURCE_EXHAUSTED') ||
          errMsg.includes('chạm giới hạn');

        if (options?.isBatch && isPool429) {
          // Keep chapter in 'queued' state so Auto-Pause can resume it cleanly without marking as failed
          const requeued: Chapter = {
            ...chapter,
            status: 'queued',
            lastError: undefined,
            updatedAt: Date.now(),
          };
          await saveChapter(requeued);
          setChapters((prev) =>
            prev.map((c) => (c.id === requeued.id ? requeued : c))
          );
          return { chapter: requeued, poolExhausted429: true };
        }

        const failed: Chapter = {
          ...chapter,
          status: 'error',
          lastError: errMsg,
          updatedAt: Date.now(),
        };
        await saveChapter(failed);
        setChapters((prev) =>
          prev.map((c) => (c.id === failed.id ? failed : c))
        );
        return { chapter: failed, poolExhausted429: isPool429 };
      } finally {
        batchAbortControllersRef.current.delete(chapter.id);
      }
    },
    [
      resolveSafePriorStatus,
      modelConfig.selectedModel,
      modelConfig.thinkingLevel,
      modelConfig.customBannedWords,
      modelConfig.qaRules,
      effectiveFallbackModel,
      activeInstructionProfile,
      shouldSendGlossary,
      enabledGlossaryItems,
      showToast,
    ]
  );

  // Single-Chapter Targeted Block-ID AI Cleanup or Full-Chapter Editorial
  const aiEditSingleChapter = useCallback(
    async (
      chapter: Chapter,
      options?: { isBatch?: boolean }
    ): Promise<{
      chapter: Chapter;
      aborted?: boolean;
      poolExhausted429?: boolean;
    }> => {
      if (!chapter.translatedContent.trim()) {
        return translateSingleChapter(chapter, options);
      }

      const priorStatus = resolveSafePriorStatus(chapter);
      if (!batchPriorStatusesRef.current.has(chapter.id)) {
        batchPriorStatusesRef.current.set(chapter.id, priorStatus);
      }

      const controller = new AbortController();
      batchAbortControllersRef.current.set(chapter.id, controller);

      setChapters((prev) =>
        prev.map((c) =>
          c.id === chapter.id
            ? { ...c, status: 'translating', lastError: undefined }
            : c
        )
      );

      try {
        const {
          targets: dirtyTargets,
          allPairs,
          isBlockCountMatched,
          rawBodyBlockCount,
          translatedBodyBlockCount,
        } = extractDirtyBlockTargets(chapter, modelConfig.customBannedWords);

        const isMisaligned =
          !isBlockCountMatched ||
          Boolean(chapter.qaReport?.blockMismatch);

        // Only use targeted block_cleanup when the chapter is ALREADY 1:1 aligned and has localized dirty blocks.
        // If the chapter has QA Block Misalignment (lệch đoạn), paragraphs are shifted so we MUST send the ENTIRE chapter!
        if (!isMisaligned && dirtyTargets.length > 0) {
          const res = await safeFetchJson<{
            updates?: Array<{ id: string; translation: string }>;
            modelUsed?: string;
            keyUsed?: number;
            poolExhausted429?: boolean;
            error?: string;
          }>(
            '/api/editor/assist',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: controller.signal,
              body: JSON.stringify({
                action: 'block_cleanup',
                targets: dirtyTargets,
                chapterNumber: chapter.chapterNumber,
                systemInstruction: activeEditorialProfile.systemInstruction,
                pronounRule: activeEditorialProfile.pronounRule,
                includeGlossary: shouldSendGlossary,
                glossary: enabledGlossaryItems,
                model: modelConfig.selectedModel,
                fallbackModel: effectiveFallbackModel,
                thinkingLevel:
                  modelConfig.thinkingLevel || DEFAULT_THINKING_LEVEL,
              }),
            },
            {
              scope: 'AI_EDITOR',
              label: `Biên tập Block Cleanup Chương #${chapter.orderPrefix} (${dirtyTargets.length} dirty blocks)`,
            }
          );
          const data = res.data || {};
          if (!res.ok || !res.data) {
            const err = new Error(
              data.error || res.errorMessage || 'Lỗi AI dọn Block ID'
            ) as Error & { poolExhausted429?: boolean };
            if (res.status === 429 || data.poolExhausted429) {
              err.poolExhausted429 = true;
            }
            throw err;
          }
          const actualModelUsed: string =
            data.modelUsed || modelConfig.selectedModel;
          const actualKeyUsed: number | undefined =
            typeof data.keyUsed === 'number' ? data.keyUsed : undefined;

          const updates: Array<{ id: string; translation: string }> =
            data.updates || [];
          const merged = applyBlockUpdatesToChapter(
            allPairs,
            updates,
            chapter.titleTranslated
          );
          const updated: Chapter = {
            ...chapter,
            titleTranslated: merged.titleTranslated,
            translatedContent: merged.translatedContent,
            alignment: merged.alignment,
            translatedByModel: actualModelUsed,
            lastKeyUsed: actualKeyUsed,
            status: 'edited',
            lastError: undefined,
            updatedAt: Date.now(),
          };
          updated.qaReport = scanChapterQA(
            updated,
            modelConfig.customBannedWords,
            modelConfig.qaRules || DEFAULT_QA_VALIDATION_RULES,
            enabledGlossaryItems
          );
          await saveChapter(updated);
          setChapters((prev) =>
            prev.map((c) => (c.id === updated.id ? updated : c))
          );
          if (options?.isBatch) {
            setBatchProgress((prev) => ({
              ...prev,
              lastModelUsed: actualModelUsed,
              lastKeyUsed: actualKeyUsed,
            }));
          }
          return { chapter: updated };
        } else {
          // Send ENTIRE CHAPTER (action: 'realign_chapter') whenever the chapter has QA Block Misalignment (lệch đoạn)
          // OR when doing whole-chapter AI Editorial polish so 1:1 Block-ID alignment is strictly reconstructed & preserved.
          const res = await safeFetchJson<{
            titleTranslated?: string;
            translatedContent?: string;
            alignment?: ChapterAlignment;
            modelUsed?: string;
            keyUsed?: number;
            poolExhausted429?: boolean;
            error?: string;
          }>(
            '/api/editor/assist',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: controller.signal,
              body: JSON.stringify({
                action: 'realign_chapter',
                chapterNumber: chapter.chapterNumber,
                titleRaw: chapter.titleRaw,
                rawContent: chapter.rawContent,
                titleTranslated: chapter.titleTranslated,
                translatedContent: chapter.translatedContent,
                systemInstruction: activeEditorialProfile.systemInstruction,
                pronounRule: activeEditorialProfile.pronounRule,
                includeGlossary: shouldSendGlossary,
                glossary: enabledGlossaryItems,
                model: modelConfig.selectedModel,
                fallbackModel: effectiveFallbackModel,
                thinkingLevel:
                  modelConfig.thinkingLevel || DEFAULT_THINKING_LEVEL,
              }),
            },
            {
              scope: 'AI_EDITOR',
              label: isMisaligned
                ? `Biên tập & Căn lại toàn Chương #${chapter.orderPrefix} (Lệch ${translatedBodyBlockCount}/${rawBodyBlockCount} đoạn)`
                : `Biên tập toàn Chương 1:1 #${chapter.orderPrefix}`,
            }
          );
          const data = res.data || {};
          if (!res.ok || !res.data) {
            const err = new Error(
              data.error ||
                res.errorMessage ||
                'Lỗi AI biên tập & căn chỉnh toàn chương'
            ) as Error & { poolExhausted429?: boolean };
            if (res.status === 429 || data.poolExhausted429) {
              err.poolExhausted429 = true;
            }
            throw err;
          }
          const actualModelUsed: string =
            data.modelUsed || modelConfig.selectedModel;
          const actualKeyUsed: number | undefined =
            typeof data.keyUsed === 'number' ? data.keyUsed : undefined;

          const updated: Chapter = {
            ...chapter,
            titleTranslated: data.titleTranslated || chapter.titleTranslated,
            translatedContent:
              data.translatedContent || chapter.translatedContent,
            alignment: data.alignment || chapter.alignment,
            translatedByModel: actualModelUsed,
            lastKeyUsed: actualKeyUsed,
            status: 'edited',
            lastError: undefined,
            updatedAt: Date.now(),
          };
          updated.qaReport = scanChapterQA(
            updated,
            modelConfig.customBannedWords,
            modelConfig.qaRules || DEFAULT_QA_VALIDATION_RULES,
            enabledGlossaryItems
          );
          await saveChapter(updated);
          setChapters((prev) =>
            prev.map((c) => (c.id === updated.id ? updated : c))
          );
          if (options?.isBatch) {
            setBatchProgress((prev) => ({
              ...prev,
              lastModelUsed: actualModelUsed,
              lastKeyUsed: actualKeyUsed,
            }));
          }
          return { chapter: updated };
        }
      } catch (err) {
        const isAborted =
          controller.signal.aborted ||
          (err instanceof Error && err.name === 'AbortError');

        if (isAborted) {
          const restored: Chapter = {
            ...chapter,
            status: priorStatus,
            lastError: undefined,
            updatedAt: Date.now(),
          };
          await saveChapter(restored);
          setChapters((prev) =>
            prev.map((c) => (c.id === restored.id ? restored : c))
          );
          return { chapter: restored, aborted: true };
        }

        const errMsg = (err as Error).message || 'Lỗi không xác định';
        const isPool429 =
          Boolean((err as { poolExhausted429?: boolean }).poolExhausted429) ||
          errMsg.includes('429') ||
          errMsg.includes('RESOURCE_EXHAUSTED') ||
          errMsg.includes('chạm giới hạn');

        if (options?.isBatch && isPool429) {
          const requeued: Chapter = {
            ...chapter,
            status: 'queued',
            lastError: undefined,
            updatedAt: Date.now(),
          };
          await saveChapter(requeued);
          setChapters((prev) =>
            prev.map((c) => (c.id === requeued.id ? requeued : c))
          );
          return { chapter: requeued, poolExhausted429: true };
        }

        const failed: Chapter = {
          ...chapter,
          status: 'error',
          lastError: errMsg,
          updatedAt: Date.now(),
        };
        await saveChapter(failed);
        setChapters((prev) =>
          prev.map((c) => (c.id === failed.id ? failed : c))
        );
        return { chapter: failed, poolExhausted429: isPool429 };
      } finally {
        batchAbortControllersRef.current.delete(chapter.id);
      }
    },
    [
      translateSingleChapter,
      resolveSafePriorStatus,
      activeEditorialProfile,
      shouldSendGlossary,
      enabledGlossaryItems,
      modelConfig.selectedModel,
      modelConfig.thinkingLevel,
      modelConfig.customBannedWords,
      modelConfig.qaRules,
      effectiveFallbackModel,
    ]
  );

  // Internal worker runner shared by Start & Resume
  const runBatchWorkersLoop = useCallback(
    async (jobType: 'translate' | 'ai_edit') => {
      const queue = batchQueueRef.current;
      const concurrency = Math.min(10, Math.max(1, modelConfig.concurrency));

      const worker = async () => {
        while (batchStatusRef.current === 'running') {
          let idx: number | undefined = batchRetryIndicesRef.current.shift();
          if (idx === undefined) {
            if (batchCursorRef.current >= queue.length) break;
            idx = batchCursorRef.current++;
          }
          const item = queue[idx];
          if (!item) break;

          setBatchProgress((prev) => ({
            ...prev,
            activeWorkers: prev.activeWorkers + 1,
          }));

          const outcome =
            jobType === 'ai_edit'
              ? await aiEditSingleChapter(item, { isBatch: true })
              : await translateSingleChapter(item, { isBatch: true });

          setBatchProgress((prev) => ({
            ...prev,
            activeWorkers: Math.max(0, prev.activeWorkers - 1),
          }));

          if (outcome.aborted) {
            break;
          }

          if (outcome.poolExhausted429) {
            // Put chapter index back so Resume will translate it first
            if (!batchRetryIndicesRef.current.includes(idx)) {
              batchRetryIndicesRef.current.unshift(idx);
            }
            if (batchStatusRef.current === 'running') {
              batchStatusRef.current = 'paused';
              stopBatchRef.current = true;
              setBatchStatus('paused');
              const pauseReason = `Tất cả Key đã chạm hạn mức 429 trên model (${modelConfig.selectedModel}${
                effectiveFallbackModel ? ` & ${effectiveFallbackModel}` : ''
              }). Hệ thống tự động TẠM DỪNG để bảo vệ các chương còn lại — hãy đổi Model hoặc thêm Key rồi bấm Tiếp tục!`;
              logger.warn('BATCH_QUEUE', pauseReason, {
                jobType,
                pausedAtChapter: item.orderPrefix,
                completed: batchCompletedRef.current,
                total: queue.length,
              });
              setBatchPauseReason(pauseReason);
              showToast(
                'Đã tự động TẠM DỪNG hàng đợi do tất cả Key chạm trần 429!'
              );
            }
            break;
          }

          batchCompletedRef.current += 1;
          setBatchProgress((prev) => ({
            ...prev,
            completed: batchCompletedRef.current,
          }));
        }
      };

      const remainingCount =
        batchRetryIndicesRef.current.length +
        Math.max(0, queue.length - batchCursorRef.current);
      if (remainingCount <= 0) {
        batchStatusRef.current = 'idle';
        setBatchStatus('idle');
        setIsBatchRunning(false);
        return;
      }

      const workers = Array.from(
        { length: Math.min(concurrency, remainingCount) },
        () => worker()
      );
      await Promise.all(workers);

      // If all items finished naturally without being paused or hard-stopped
      if (
        batchStatusRef.current === 'running' &&
        batchCursorRef.current >= queue.length &&
        batchRetryIndicesRef.current.length === 0
      ) {
        batchStatusRef.current = 'idle';
        setBatchStatus('idle');
        setBatchPauseReason(null);
        setIsBatchRunning(false);
        batchPriorStatusesRef.current.clear();
        logger.info(
          'BATCH_QUEUE',
          `Hoàn tất hàng đợi (${jobType}): ${batchCompletedRef.current}/${queue.length} chương`
        );
        showToast(
          jobType === 'ai_edit'
            ? `Hoàn tất Biên tập AI ${batchCompletedRef.current}/${queue.length} chương!`
            : `Hoàn tất Dịch ${batchCompletedRef.current}/${queue.length} chương!`
        );
      }
    },
    [
      modelConfig.concurrency,
      modelConfig.selectedModel,
      effectiveFallbackModel,
      aiEditSingleChapter,
      translateSingleChapter,
      showToast,
    ]
  );

  // Start Parallel Batch Queue (Supports both Batch Translation & Batch AI Edit)
  const handleStartBatchQueue = async (
    jobType: 'translate' | 'ai_edit',
    targetList?: Chapter[]
  ) => {
    if (batchStatusRef.current === 'running') return;
    const queue =
      targetList || chapters.filter((c) => selectedChapterIds.has(c.id));
    if (queue.length === 0) {
      showToast('Vui lòng tick chọn ít nhất 1 chương để thực thi hàng loạt.');
      return;
    }

    // Record prior status for every chapter in queue so Hard Stop can rollback cleanly
    const priorMap = new Map<string, ChapterStatus>();
    for (const ch of queue) {
      priorMap.set(
        ch.id,
        ch.status === 'queued' || ch.status === 'translating'
          ? ch.translatedContent.trim()
            ? 'translated'
            : 'raw'
          : ch.status
      );
    }
    batchPriorStatusesRef.current = priorMap;
    batchQueueRef.current = queue;
    batchCursorRef.current = 0;
    batchCompletedRef.current = 0;
    batchRetryIndicesRef.current = [];
    stopBatchRef.current = false;
    batchStatusRef.current = 'running';

    setBatchJobLabel(jobType);
    setBatchPauseReason(null);
    setBatchStatus('running');
    setIsBatchRunning(true);
    setBatchProgress({
      completed: 0,
      total: queue.length,
      activeWorkers: 0,
    });

    const queueIds = new Set(queue.map((q) => q.id));
    setChapters((prev) =>
      prev.map((c) => (queueIds.has(c.id) ? { ...c, status: 'queued' } : c))
    );

    logger.info(
      'BATCH_QUEUE',
      `Bắt đầu hàng đợi (${jobType === 'ai_edit' ? 'Biên tập AI' : 'Dịch chương'}): ${queue.length} chương • Concurrency=${Math.min(10, Math.max(1, modelConfig.concurrency))} • Model=${modelConfig.selectedModel}`,
      {
        jobType,
        totalChapters: queue.length,
        concurrency: Math.min(10, Math.max(1, modelConfig.concurrency)),
        selectedModel: modelConfig.selectedModel,
        fallbackModel: effectiveFallbackModel,
      }
    );

    await runBatchWorkersLoop(jobType);
  };

  // Pause Batch Queue (Preserves cursor & queued chapters so user can Resume anytime)
  const handlePauseBatchQueue = useCallback(() => {
    if (batchStatusRef.current !== 'running') return;
    batchStatusRef.current = 'paused';
    stopBatchRef.current = true;
    setBatchStatus('paused');
    setBatchPauseReason(
      'Đã tạm dừng theo yêu cầu. Các luồng đang chạy dở sẽ hoàn tất nốt chương hiện tại; bạn có thể bấm Tiếp tục bất kỳ lúc nào.'
    );
    logger.info(
      'BATCH_QUEUE',
      `Tạm dừng hàng đợi tại tiến độ ${batchCompletedRef.current}/${batchQueueRef.current.length} chương`
    );
    showToast('Đã tạm dừng hàng đợi! Bấm "Tiếp tục" khi sẵn sàng.');
  }, [showToast]);

  // Resume Batch Queue from exact paused cursor
  const handleResumeBatchQueue = useCallback(async () => {
    if (batchStatusRef.current !== 'paused') return;
    batchStatusRef.current = 'running';
    stopBatchRef.current = false;
    setBatchStatus('running');
    setBatchPauseReason(null);
    setIsBatchRunning(true);
    logger.info(
      'BATCH_QUEUE',
      `Tiếp tục chạy hàng đợi (${batchJobLabel}) từ chương ${batchCompletedRef.current + 1}/${batchQueueRef.current.length} • Model=${modelConfig.selectedModel}`
    );
    showToast(
      `Đang tiếp tục hàng đợi từ chương ${batchCompletedRef.current + 1}/${
        batchQueueRef.current.length
      } với model ${modelConfig.selectedModel}...`
    );
    await runBatchWorkersLoop(batchJobLabel);
  }, [batchJobLabel, modelConfig.selectedModel, runBatchWorkersLoop, showToast]);

  // Hard Stop Batch Queue (Aborts all in-flight HTTP requests immediately & rolls back 'queued' chapters)
  const handleHardStopBatchQueue = useCallback(async () => {
    batchStatusRef.current = 'idle';
    stopBatchRef.current = true;
    setBatchStatus('idle');
    setBatchPauseReason(null);
    setIsBatchRunning(false);

    // 1. Immediately abort all in-flight requests
    for (const [, controller] of batchAbortControllersRef.current.entries()) {
      try {
        controller.abort();
      } catch {
        // Ignore abort error
      }
    }
    batchAbortControllersRef.current.clear();

    // 2. Roll back any chapters still in 'queued' or 'translating' to their prior status
    const toRollback: Chapter[] = [];
    setChapters((prev) =>
      prev.map((c) => {
        if (c.status === 'queued' || c.status === 'translating') {
          const prior = resolveSafePriorStatus(c);
          const restored: Chapter = {
            ...c,
            status: prior,
            lastError: undefined,
            updatedAt: Date.now(),
          };
          toRollback.push(restored);
          return restored;
        }
        return c;
      })
    );

    if (toRollback.length > 0) {
      await saveChaptersBulk(toRollback);
    }

    batchQueueRef.current = [];
    batchCursorRef.current = 0;
    batchRetryIndicesRef.current = [];
    batchPriorStatusesRef.current.clear();
    setBatchProgress({ completed: 0, total: 0, activeWorkers: 0 });
    logger.warn(
      'BATCH_QUEUE',
      `Đã dừng hẳn (Hard Stop) hàng đợi & khôi phục trạng thái cho ${toRollback.length} chương đang chờ`
    );
    showToast(
      `Đã dừng hẳn hàng đợi & khôi phục trạng thái cho các chương chưa dịch xong!`
    );
  }, [resolveSafePriorStatus, showToast]);

  // 1-Click Retry Failed / Stranded Chapters
  const handleRetryFailedChapters = useCallback(
    async (jobType: 'translate' | 'ai_edit' = 'translate') => {
      const targets = chapters.filter(
        (c) => c.status === 'error' || c.status === 'queued'
      );
      if (targets.length === 0) {
        showToast('Không có chương nào đang bị lỗi hoặc kẹt hàng đợi!');
        return;
      }
      await handleStartBatchQueue(jobType, targets);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chapters, showToast]
  );

  // 1-Click Reset Stranded 'queued' Chapters
  const handleResetStrandedQueuedChapters = useCallback(async () => {
    const stranded = chapters.filter(
      (c) => c.status === 'queued' || c.status === 'translating'
    );
    if (stranded.length === 0) return;
    const restoredList = stranded.map((c) => ({
      ...c,
      status: (c.translatedContent.trim() ? 'translated' : 'raw') as ChapterStatus,
      lastError: undefined,
      updatedAt: Date.now(),
    }));
    await saveChaptersBulk(restoredList);
    const map = new Map(restoredList.map((r) => [r.id, r]));
    setChapters((prev) => prev.map((c) => map.get(c.id) || c));
    showToast(`Đã khôi phục trạng thái cho ${restoredList.length} chương bị kẹt!`);
  }, [chapters, showToast]);

  // Bulk Chapter Actions
  const handleBulkScanQA = async () => {
    const activeGl = glossary.filter((g) => g.enabled !== false);
    const updated = chapters.map((ch) => ({
      ...ch,
      qaReport: scanChapterQA(
        ch,
        modelConfig.customBannedWords,
        modelConfig.qaRules || DEFAULT_QA_VALIDATION_RULES,
        activeGl
      ),
    }));
    await saveChaptersBulk(updated);
    setChapters(updated);
    const totalErrorChapters = updated.filter((c) => c.qaReport?.hasIssues).length;
    logger.info(
      'QA_SCAN',
      `Quét QA toàn bộ ${updated.length} chương (đối chiếu ${activeGl.length} mục Glossary): phát hiện ${totalErrorChapters} chương cần lưu ý`,
      {
        totalChapters: updated.length,
        chaptersWithIssues: totalErrorChapters,
        activeGlossaryTerms: activeGl.length,
      }
    );
    showToast(
      `Đã quét QA đa tiêu chí & đối chiếu Glossary: phát hiện ${totalErrorChapters} chương cần lưu ý.`
    );
  };

  const handleBulkChangeStatus = async (newStatus: ChapterStatus) => {
    if (selectedChapterIds.size === 0) return;
    const updated: Chapter[] = [];
    const nextList = chapters.map((ch) => {
      if (!selectedChapterIds.has(ch.id)) return ch;
      const copy: Chapter = {
        ...ch,
        status: newStatus,
        translatedContent: newStatus === 'raw' ? '' : ch.translatedContent,
        titleTranslated: newStatus === 'raw' ? '' : ch.titleTranslated,
        updatedAt: Date.now(),
      };
      copy.qaReport = scanChapterQA(
        copy,
        modelConfig.customBannedWords,
        modelConfig.qaRules || DEFAULT_QA_VALIDATION_RULES
      );
      updated.push(copy);
      return copy;
    });
    await saveChaptersBulk(updated);
    setChapters(nextList);
    showToast(`Đã cập nhật trạng thái cho ${updated.length} chương.`);
  };

  const handleBulkDeleteSelectedChapters = async () => {
    if (selectedChapterIds.size === 0) return;
    const ids = Array.from(selectedChapterIds);
    await deleteChaptersBulk(ids);
    const remaining = chapters.filter((c) => !selectedChapterIds.has(c.id));
    setChapters(remaining);
    setSelectedChapterIds(new Set());
    if (activeChapterId && selectedChapterIds.has(activeChapterId)) {
      setActiveChapterId(remaining[0]?.id || null);
    }
    showToast(`Đã xóa ${ids.length} chương.`);
  };

  // Active chapter block pairs & alignment analysis for Unified 1:1 Block-ID Editor & Reader
  const activeChapterBlockAnalysis = useMemo(() => {
    if (!activeChapter) {
      return {
        pairs: [] as AlignedBlockPair[],
        rawBodyBlockCount: 0,
        translatedBodyBlockCount: 0,
        isBlockCountMatched: true,
      };
    }
    const liveChapter: Chapter = {
      ...activeChapter,
      titleTranslated: editorTitle,
      translatedContent: editorContent,
    };
    return buildChapterBlockPairs(liveChapter, modelConfig.customBannedWords);
  }, [activeChapter, editorTitle, editorContent, modelConfig.customBannedWords]);

  const activeChapterBlockPairs = activeChapterBlockAnalysis.pairs;

  const dirtyBlocksCount = useMemo(
    () =>
      activeChapterBlockPairs.filter(
        (p) => p.hasChinese || p.hasEnglishLeak || p.isMissingTranslation
      ).length,
    [activeChapterBlockPairs]
  );

  // 1. Direct 1:1 Block-Locked Text Edit (prevents accidental newline paragraph shifts)
  const handleUpdateSingleBlockText = useCallback(
    (pair: AlignedBlockPair, rawNewValue: string) => {
      const cleaned = normalizeVietnameseText(rawNewValue).replace(/\r?\n+/g, ' ');
      if (pair.id === 'TITLE') {
        pushEditorSnapshot(cleaned, editorContent, 'Sửa TITLE');
        return;
      }
      const bodyList = activeChapterBlockPairs
        .filter((p) => p.id !== 'TITLE')
        .map((p) => p.translation);
      if (pair.index >= 0) {
        while (bodyList.length <= pair.index) {
          bodyList.push('');
        }
        bodyList[pair.index] = cleaned;
        const nextContent = serializeBodyBlocksToContent(bodyList, false);
        pushEditorSnapshot(editorTitle, nextContent, `Sửa ${pair.id}`);
      }
    },
    [activeChapterBlockPairs, editorContent, editorTitle, pushEditorSnapshot]
  );

  // Block-Aware Selection & Clipboard Utilities (operates on activeFocusedBlockId in 1:1 Table)
  const getEditorSelection = () => {
    const targetBlockId = activeFocusedBlockId || 'P0001';
    const el = blockTextareaRefs.current[targetBlockId];
    const currentText =
      targetBlockId === 'TITLE'
        ? editorTitle
        : activeChapterBlockPairs.find((p) => p.id === targetBlockId)?.translation || '';
    if (!el) return { blockId: targetBlockId, start: 0, end: 0, selected: '' };
    return {
      blockId: targetBlockId,
      start: el.selectionStart,
      end: el.selectionEnd,
      selected: currentText.slice(el.selectionStart, el.selectionEnd),
    };
  };

  const replaceEditorSelection = (replacementText: string, label: string) => {
    const { blockId, start, end } = getEditorSelection();
    const cleanedReplacement = normalizeVietnameseText(replacementText).replace(
      /\r?\n+/g,
      ' '
    );
    if (blockId === 'TITLE') {
      const nextTitle =
        start === end
          ? cleanedReplacement
          : editorTitle.slice(0, start) +
            cleanedReplacement +
            editorTitle.slice(end);
      pushEditorSnapshot(nextTitle, editorContent, label);
      return;
    }
    const bodyList = activeChapterBlockPairs
      .filter((p) => p.id !== 'TITLE')
      .map((p) => p.translation);
    const pair = activeChapterBlockPairs.find((p) => p.id === blockId);
    if (pair && pair.index >= 0) {
      while (bodyList.length <= pair.index) bodyList.push('');
      const currentBlockText = bodyList[pair.index] || '';
      bodyList[pair.index] =
        start === end
          ? cleanedReplacement
          : currentBlockText.slice(0, start) +
            cleanedReplacement +
            currentBlockText.slice(end);
      const nextContent = serializeBodyBlocksToContent(bodyList, false);
      pushEditorSnapshot(editorTitle, nextContent, label);
    } else {
      pushEditorSnapshot(editorTitle, replacementText, label);
    }
  };

  const handleNormalizeFormatting = () => {
    const nextTitle = normalizeVietnameseText(editorTitle)
      .replace(/[ \t]+/g, ' ')
      .replace(/\s+([,.;:!?])/g, '$1')
      .trim();
    const bodyList = activeChapterBlockPairs
      .filter((p) => p.id !== 'TITLE')
      .map((p) =>
        normalizeVietnameseText(p.translation)
          .replace(/[ \t]+/g, ' ')
          .replace(/\s+([,.;:!?])/g, '$1')
          .trim()
      );
    const normalized = serializeBodyBlocksToContent(bodyList, false);
    pushEditorSnapshot(nextTitle, normalized, 'Chuẩn hóa trình bày 1:1');
    handleSaveEditorChanges(nextTitle, normalized, true);
    showToast('Đã chuẩn hóa khoảng trắng và dấu câu cho toàn bộ Block ID!');
  };

  const handleRestoreActiveChapter = () => {
    if (!activeChapter) return;
    const savedTitle = normalizeVietnameseText(activeChapter.titleTranslated || '');
    const savedContent = normalizeVietnameseText(activeChapter.translatedContent || '');
    pushEditorSnapshot(savedTitle, savedContent, 'Khôi phục bản lưu active');
    showToast('Đã khôi phục nội dung về bản lưu active gần nhất!');
  };

  const handleDownloadActiveChapterTxt = () => {
    if (!activeChapter) return;
    const titleLine = normalizeVietnameseText(
      editorTitle || activeChapter.titleTranslated || activeChapter.titleRaw
    ).trim();
    const bodyLines = activeChapterBlockPairs
      .filter((p) => p.id !== 'TITLE')
      .map((p) => p.translation.trim())
      .filter(Boolean)
      .join('\n\n');
    const fullText = titleLine ? `${titleLine}\n\n${bodyLines}\n` : `${bodyLines}\n`;
    const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeChapter.orderPrefix}-${titleLine
      .slice(0, 40)
      .replace(/[\\/:*?"<>|]/g, '_')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Đã tải xuống TXT active (#${activeChapter.orderPrefix})!`);
  };

  const handleApproveActiveChapter = async () => {
    if (!activeChapter) return;
    const updatedChapter: Chapter = {
      ...activeChapter,
      titleTranslated: normalizeVietnameseText(editorTitle.trim()),
      translatedContent: editorContent,
      status: 'edited',
      updatedAt: Date.now(),
    };
    updatedChapter.qaReport = scanChapterQA(
      updatedChapter,
      modelConfig.customBannedWords,
      modelConfig.qaRules || DEFAULT_QA_VALIDATION_RULES,
      glossary.filter((g) => g.enabled !== false)
    );
    await saveChapter(updatedChapter);
    syncedChapterKeyRef.current = `${updatedChapter.id}:${updatedChapter.updatedAt}:${updatedChapter.translatedContent.length}`;
    setChapters((prev) =>
      prev.map((c) => (c.id === updatedChapter.id ? updatedChapter : c))
    );
    showToast(`Đã duyệt & lưu Chương #${activeChapter.orderPrefix}!`);
  };

  // In-Chapter Block-Aware Find & Replace
  const inChapterBlockMatches = useMemo(() => {
    if (!inEditorFindQuery) {
      return [] as Array<{
        blockId: string;
        start: number;
        end: number;
        matchText: string;
      }>;
    }
    try {
      const flags = inEditorCaseSensitive ? 'gu' : 'giu';
      const escaped = inEditorUseRegex
        ? inEditorFindQuery
        : inEditorFindQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = inEditorWholeWord ? `\\b(?:${escaped})\\b` : escaped;
      const results: Array<{
        blockId: string;
        start: number;
        end: number;
        matchText: string;
      }> = [];
      for (const pair of activeChapterBlockPairs) {
        if (pair.id === 'TITLE' && !inEditorIncludeTitle) continue;
        const text = pair.translation || '';
        if (!text) continue;
        const re = new RegExp(pattern, flags);
        let m: RegExpExecArray | null;
        let safety = 0;
        while ((m = re.exec(text)) !== null && safety < 500) {
          safety++;
          if (m[0].length === 0) {
            re.lastIndex++;
            continue;
          }
          results.push({
            blockId: pair.id,
            start: m.index,
            end: m.index + m[0].length,
            matchText: m[0],
          });
        }
      }
      return results;
    } catch {
      return [];
    }
  }, [
    activeChapterBlockPairs,
    inEditorFindQuery,
    inEditorCaseSensitive,
    inEditorWholeWord,
    inEditorUseRegex,
    inEditorIncludeTitle,
  ]);

  const inEditorMatchCount = inChapterBlockMatches.length;

  const focusAndHighlightFindMatch = useCallback(
    (matchIdx: number) => {
      if (inChapterBlockMatches.length === 0) return;
      const clampedIdx =
        ((matchIdx % inChapterBlockMatches.length) +
          inChapterBlockMatches.length) %
        inChapterBlockMatches.length;
      setActiveFindMatchIndex(clampedIdx);
      const target = inChapterBlockMatches[clampedIdx];
      if (!target) return;
      setActiveFocusedBlockId(target.blockId);
      const el = blockTextareaRefs.current[target.blockId];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.focus();
        el.setSelectionRange(target.start, target.end);
      }
    },
    [inChapterBlockMatches]
  );

  const handleReplaceSingleMatchInChapter = async () => {
    if (inChapterBlockMatches.length === 0) return;
    const safeIdx = Math.min(
      activeFindMatchIndex,
      inChapterBlockMatches.length - 1
    );
    const target = inChapterBlockMatches[safeIdx];
    if (!target) return;

    const cleanedReplace = normalizeVietnameseText(inEditorReplaceText).replace(
      /\r?\n+/g,
      ' '
    );
    if (target.blockId === 'TITLE') {
      const nextTitle =
        editorTitle.slice(0, target.start) +
        cleanedReplace +
        editorTitle.slice(target.end);
      pushEditorSnapshot(nextTitle, editorContent, 'Thay 1 vị trí (TITLE)');
      await handleSaveEditorChanges(nextTitle, editorContent, true);
    } else {
      const bodyList = activeChapterBlockPairs
        .filter((p) => p.id !== 'TITLE')
        .map((p) => p.translation);
      const pair = activeChapterBlockPairs.find((p) => p.id === target.blockId);
      if (pair && pair.index >= 0) {
        const cur = bodyList[pair.index] || '';
        bodyList[pair.index] =
          cur.slice(0, target.start) + cleanedReplace + cur.slice(target.end);
        const nextContent = serializeBodyBlocksToContent(bodyList, false);
        pushEditorSnapshot(
          editorTitle,
          nextContent,
          `Thay 1 vị trí (${target.blockId})`
        );
        await handleSaveEditorChanges(editorTitle, nextContent, true);
      }
    }
    showToast(`Đã thay thế tại ${target.blockId}!`);
  };

  const handleInEditorReplaceAll = async () => {
    if (!inEditorFindQuery || inEditorMatchCount === 0) return;
    try {
      const flags = inEditorCaseSensitive ? 'gu' : 'giu';
      const escaped = inEditorUseRegex
        ? inEditorFindQuery
        : inEditorFindQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = inEditorWholeWord ? `\\b(?:${escaped})\\b` : escaped;
      const re = new RegExp(pattern, flags);
      const cleanedReplace = normalizeVietnameseText(inEditorReplaceText).replace(
        /\r?\n+/g,
        ' '
      );

      const nextTitle = inEditorIncludeTitle
        ? editorTitle.replace(re, cleanedReplace)
        : editorTitle;
      const bodyList = activeChapterBlockPairs
        .filter((p) => p.id !== 'TITLE')
        .map((p) => p.translation.replace(re, cleanedReplace));
      const nextContent = serializeBodyBlocksToContent(bodyList, false);

      pushEditorSnapshot(nextTitle, nextContent, 'Thay thế tất cả trong chương');
      await handleSaveEditorChanges(nextTitle, nextContent, true);
      showToast(
        `Đã thay thế ${inEditorMatchCount} vị trí "${inEditorFindQuery}" trong chương!`
      );
    } catch (err) {
      showToast(`Lỗi Regex: ${(err as Error).message}`);
    }
  };

  const handleCancelAiAssist = useCallback(() => {
    if (aiAssistAbortRef.current) {
      aiAssistAbortRef.current.abort();
      aiAssistAbortRef.current = null;
    }
    setAiAssistLoading(false);
    showToast('Đã hủy tác vụ AI Biên tập!');
  }, [showToast]);

  // Smart AI Editorial:
  // - If the chapter is flagged with QA Block Misalignment (!isBlockCountMatched or blockAlignmentPass === false)
  //   OR has no dirty blocks (user wants full-chapter polish), sends the ENTIRE CHAPTER (`realign_chapter`)
  //   so AI realigns all paragraphs 1:1 with raw Chinese blocks (`TITLE`, `P0001`..`Pxxxx`).
  // - If the chapter is already 1:1 aligned and only has specific dirty blocks, sends only `dirtyTargets` (`block_cleanup`).
  const handleRunBlockIdCleanup = async () => {
    if (!activeChapter) return;
    const draftChapter: Chapter = {
      ...activeChapter,
      titleTranslated: editorTitle,
      translatedContent: editorContent,
    };
    const {
      targets: dirtyTargets,
      allPairs,
      isBlockCountMatched,
      rawBodyBlockCount,
      translatedBodyBlockCount,
    } = extractDirtyBlockTargets(draftChapter, modelConfig.customBannedWords);

    const isMisaligned =
      !isBlockCountMatched ||
      Boolean(activeChapter.qaReport?.blockMismatch);

    const controller = new AbortController();
    aiAssistAbortRef.current = controller;
    setAiAssistLoading(true);
    try {
      if (isMisaligned || dirtyTargets.length === 0) {
        const res = await safeFetchJson<{
          titleTranslated?: string;
          translatedContent?: string;
          alignment?: ChapterAlignment;
          modelUsed?: string;
          keyUsed?: number;
          error?: string;
        }>(
          '/api/editor/assist',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              action: 'realign_chapter',
              chapterNumber: activeChapter.chapterNumber,
              titleRaw: activeChapter.titleRaw,
              rawContent: activeChapter.rawContent,
              titleTranslated: editorTitle || activeChapter.titleTranslated,
              translatedContent:
                editorContent || activeChapter.translatedContent,
              systemInstruction: activeEditorialProfile.systemInstruction,
              pronounRule: activeEditorialProfile.pronounRule,
              includeGlossary: shouldSendGlossary,
              glossary: enabledGlossaryItems,
              model: modelConfig.selectedModel,
              fallbackModel: effectiveFallbackModel,
              thinkingLevel:
                modelConfig.thinkingLevel || DEFAULT_THINKING_LEVEL,
            }),
          },
          {
            scope: 'AI_EDITOR',
            label: isMisaligned
              ? `Biên tập & Căn lại toàn Chương #${activeChapter.orderPrefix} (Lệch ${translatedBodyBlockCount}/${rawBodyBlockCount} đoạn)`
              : `Biên tập toàn Chương 1:1 #${activeChapter.orderPrefix}`,
          }
        );
        const data = res.data || {};
        if (!res.ok || !res.data || !data.translatedContent) {
          throw new Error(
            data.error ||
              res.errorMessage ||
              'Lỗi khi gọi AI Biên Tập & Căn Chỉnh Toàn Chương'
          );
        }

        const actualModelUsed: string =
          data.modelUsed || modelConfig.selectedModel;
        const actualKeyUsed: number | undefined =
          typeof data.keyUsed === 'number' ? data.keyUsed : undefined;
        const nextTitle =
          data.titleTranslated || editorTitle || activeChapter.titleTranslated;
        const nextContent = data.translatedContent;

        pushEditorSnapshot(
          nextTitle,
          nextContent,
          isMisaligned
            ? `AI Căn chỉnh & Biên tập toàn chương 1:1 (${actualModelUsed})`
            : `AI Biên tập toàn chương 1:1 (${actualModelUsed})`
        );
        await handleSaveEditorChanges(
          nextTitle,
          nextContent,
          true,
          data.alignment,
          actualModelUsed,
          actualKeyUsed
        );
        showToast(
          isMisaligned
            ? `Đã gửi cả chương & căn chỉnh lại khớp 1:1 (${data.alignment?.translatedBlockCount ?? rawBodyBlockCount}/${rawBodyBlockCount} đoạn) bằng ${actualModelUsed}!`
            : `Đã biên tập toàn chương chuẩn 1:1 bằng ${actualModelUsed}!`
        );
        return;
      }

      const res = await safeFetchJson<{
        updates?: Array<{ id: string; translation: string }>;
        modelUsed?: string;
        keyUsed?: number;
        error?: string;
      }>(
        '/api/editor/assist',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            action: 'block_cleanup',
            targets: dirtyTargets,
            chapterNumber: activeChapter.chapterNumber,
            systemInstruction: activeEditorialProfile.systemInstruction,
            pronounRule: activeEditorialProfile.pronounRule,
            includeGlossary: shouldSendGlossary,
            glossary: enabledGlossaryItems,
            model: modelConfig.selectedModel,
            fallbackModel: effectiveFallbackModel,
            thinkingLevel:
              modelConfig.thinkingLevel || DEFAULT_THINKING_LEVEL,
          }),
        },
        {
          scope: 'AI_EDITOR',
          label: `Dọn ${dirtyTargets.length} Block ID lỗi (Chương #${activeChapter.orderPrefix})`,
        }
      );
      const data = res.data || {};
      if (!res.ok || !res.data) {
        throw new Error(
          data.error || res.errorMessage || 'Lỗi khi gọi AI Dọn Lỗi Theo Block ID'
        );
      }

      const updates: Array<{ id: string; translation: string }> =
        data.updates || [];
      const merged = applyBlockUpdatesToChapter(
        allPairs,
        updates,
        editorTitle || activeChapter.titleTranslated
      );
      const actualModelUsed: string =
        data.modelUsed || modelConfig.selectedModel;
      const actualKeyUsed: number | undefined =
        typeof data.keyUsed === 'number' ? data.keyUsed : undefined;

      pushEditorSnapshot(
        merged.titleTranslated,
        merged.translatedContent,
        `AI Dọn ${updates.length} Block ID lỗi (${actualModelUsed})`
      );
      await handleSaveEditorChanges(
        merged.titleTranslated,
        merged.translatedContent,
        true,
        merged.alignment,
        actualModelUsed,
        actualKeyUsed
      );
      showToast(
        `Đã dọn sạch ${updates.length}/${dirtyTargets.length} Block ID lỗi bằng ${actualModelUsed}!`
      );
    } catch (err) {
      if (
        controller.signal.aborted ||
        (err instanceof Error && err.name === 'AbortError')
      ) {
        return;
      }
      showToast(`Lỗi AI Biên Tập: ${(err as Error).message}`);
    } finally {
      aiAssistAbortRef.current = null;
      setAiAssistLoading(false);
    }
  };

  // AI Co-Editor Assist Actions (works on currently focused Block ID or selected text inside it)
  const handleRunAiCoEditor = async (
    action: 'polish' | 'fix_pronouns' | 'fix_qa' | 'alternatives' | 'custom'
  ) => {
    if (!activeChapter) return;
    const { blockId, selected } = getEditorSelection();
    const focusedPair =
      activeChapterBlockPairs.find((p) => p.id === blockId) ||
      activeChapterBlockPairs.find((p) => p.id === 'P0001');
    const targetText =
      selected.trim() ||
      focusedPair?.translation.trim() ||
      editorContent.trim();
    if (!targetText) {
      showToast('Chưa có văn bản tiếng Việt để biên tập AI.');
      return;
    }

    setAiAssistLoading(true);
    setAiAlternatives([]);
    try {
      const res = await safeFetchJson<{
        resultText?: string;
        alternatives?: string[];
        error?: string;
      }>(
        '/api/editor/assist',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            selectedText: targetText,
            rawReference: focusedPair?.source || activeChapter.rawContent.slice(0, 6000),
            customPrompt: customAiPrompt,
            systemInstruction: activeEditorialProfile.systemInstruction,
            pronounRule: activeEditorialProfile.pronounRule,
            includeGlossary: shouldSendGlossary,
            glossary: enabledGlossaryItems,
            model: modelConfig.selectedModel,
            thinkingLevel:
              modelConfig.thinkingLevel || DEFAULT_THINKING_LEVEL,
          }),
        },
        {
          scope: 'AI_EDITOR',
          label: `AI Co-Editor (${action} • ${focusedPair?.id || 'Chapter'})`,
        }
      );
      const data = res.data || {};
      if (!res.ok || !res.data) {
        throw new Error(
          data.error || res.errorMessage || 'Lỗi khi gọi AI Biên Tập'
        );
      }

      if (action === 'alternatives' && Array.isArray(data.alternatives)) {
        setAiAlternatives(data.alternatives);
      } else if (data.resultText && focusedPair) {
        const cleanedResult = normalizeVietnameseText(data.resultText)
          .replace(/\r?\n+/g, ' ')
          .trim();
        if (selected.trim()) {
          replaceEditorSelection(cleanedResult, `AI Biên tập (${action})`);
        } else {
          handleUpdateSingleBlockText(focusedPair, cleanedResult);
        }
        showToast(`AI đã biên tập ${focusedPair.id}!`);
      }
    } catch (err) {
      showToast(`Lỗi AI Biên Tập: ${(err as Error).message}`);
    } finally {
      setAiAssistLoading(false);
    }
  };

  // Keyboard shortcuts inside Editor (Ctrl+S, Ctrl+Z, Ctrl+Y)
  const handleEditorKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>
  ) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      handleSaveEditorChanges();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      handleUndo();
    } else if (
      ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') ||
      ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z')
    ) {
      e.preventDefault();
      handleRedo();
    }
  };

  // Reader Text Selection & 3-Color Highlight Creation
  const handleReaderMouseUp = (blockId: string) => {
    const sel = window.getSelection();
    if (!sel) return;
    const text = sel.toString().trim();
    if (text.length >= 2) {
      setPendingHighlightText(text);
      setPendingHighlightBlockId(blockId);
    }
  };

  const handleCreateReaderHighlight = useCallback(
    async (color: HighlightColor) => {
      if (!activeChapter || !activeNovelId || !pendingHighlightText.trim()) return;
      const nowTs = new Date().getTime();
      const paraIdx =
        parseInt(pendingHighlightBlockId.replace(/\D/g, ''), 10) - 1;
      const newHl: ReaderHighlight = {
        id: `hl-${nowTs}`,
        novelId: activeNovelId,
        chapterId: activeChapter.id,
        blockId: pendingHighlightBlockId,
        paragraphIndex: Number.isNaN(paraIdx) ? 0 : Math.max(0, paraIdx),
        quote: pendingHighlightText.trim(),
        selectedText: pendingHighlightText.trim(),
        color,
        note: pendingHighlightNote.trim(),
        createdAt: nowTs,
      };
      await saveHighlight(newHl);
      setHighlights((prev) => [newHl, ...prev]);
      setPendingHighlightText('');
      setPendingHighlightNote('');
      window.getSelection()?.removeAllRanges();
      showToast(`Đã lưu Highlight (${HIGHLIGHT_COLOR_STYLES[color].label})!`);
    },
    [
      activeChapter,
      activeNovelId,
      pendingHighlightText,
      pendingHighlightBlockId,
      pendingHighlightNote,
      showToast,
    ]
  );

  const handleDeleteReaderHighlight = async (id: string) => {
    await deleteHighlight(id);
    setHighlights((prev) => prev.filter((h) => h.id !== id));
  };

  const handleSaveCurrentReadingPosition = () => {
    if (!activeChapter || !activeNovelId) return;
    const container = readerScrollContainerRef.current;
    const scrollRatio =
      container && container.scrollHeight > container.clientHeight
        ? container.scrollTop / (container.scrollHeight - container.clientHeight)
        : 0;
    const clampedRatio = Math.max(0, Math.min(1, scrollRatio));
    const bm: ReadingBookmark = {
      novelId: activeNovelId,
      chapterId: activeChapter.id,
      orderPrefix: activeChapter.orderPrefix,
      scrollPercentage: Math.round(clampedRatio * 100),
      scrollRatio: clampedRatio,
      updatedAt: Date.now(),
    };
    saveReadingBookmark(bm);
    setSavedBookmark(bm);
    showToast(`Đã đánh dấu vị trí đọc tại Chương #${activeChapter.orderPrefix}!`);
  };

  const handleJumpToSavedBookmark = () => {
    if (!savedBookmark) return;
    setActiveChapterId(savedBookmark.chapterId);
    setWorkspaceMode('reader');
    setTimeout(() => {
      const container = readerScrollContainerRef.current;
      const ratio =
        savedBookmark.scrollRatio ??
        (savedBookmark.scrollPercentage || 0) / 100;
      if (container && container.scrollHeight > container.clientHeight) {
        container.scrollTo({
          top: ratio * (container.scrollHeight - container.clientHeight),
          behavior: 'smooth',
        });
      }
    }, 120);
  };

  // Prev / Next Chapter Navigation
  const activeIndexInFiltered = useMemo(
    () => filteredAndSortedChapters.findIndex((c) => c.id === activeChapterId),
    [filteredAndSortedChapters, activeChapterId]
  );

  const prevChapter =
    activeIndexInFiltered > 0
      ? filteredAndSortedChapters[activeIndexInFiltered - 1]
      : null;
  const nextChapter =
    activeIndexInFiltered >= 0 &&
    activeIndexInFiltered < filteredAndSortedChapters.length - 1
      ? filteredAndSortedChapters[activeIndexInFiltered + 1]
      : null;

  // Windowed / Searchable list for Header Chapter Dropdown (instantaneous even on 3,000+ chapters)
  const dropdownChapterSlice = useMemo(() => {
    const q = chapterDropdownQuery.trim().toLowerCase();
    if (q) {
      const matches = filteredAndSortedChapters.filter(
        (c) =>
          c.orderPrefix.toLowerCase().includes(q) ||
          String(c.chapterNumber) === q ||
          (c.titleTranslated || '').toLowerCase().includes(q) ||
          c.titleRaw.toLowerCase().includes(q)
      );
      return {
        items: matches.slice(0, 250),
        totalMatches: matches.length,
        isWindowed: matches.length > 250,
        windowStart: 1,
        windowEnd: Math.min(250, matches.length),
      };
    }
    const total = filteredAndSortedChapters.length;
    if (total <= 300) {
      return {
        items: filteredAndSortedChapters,
        totalMatches: total,
        isWindowed: false,
        windowStart: 1,
        windowEnd: total,
      };
    }
    const center = activeIndexInFiltered >= 0 ? activeIndexInFiltered : 0;
    const start = Math.max(0, center - 100);
    const end = Math.min(total, start + 250);
    return {
      items: filteredAndSortedChapters.slice(start, end),
      totalMatches: total,
      isWindowed: true,
      windowStart: start + 1,
      windowEnd: end,
    };
  }, [filteredAndSortedChapters, chapterDropdownQuery, activeIndexInFiltered]);

  // Overall QA & Translation stats
  const stats = useMemo(() => {
    let translated = 0;
    let errorChapters = 0;
    let queuedChapters = 0;
    let qaIssues = 0;
    let chineseResidualChapters = 0;
    let englishLeakChapters = 0;
    let blockMismatchChapters = 0;
    let lengthRatioChapters = 0;
    let repeatedChapters = 0;
    let glossaryViolationChapters = 0;
    for (const c of chapters) {
      if (c.status === 'translated' || c.status === 'edited') translated++;
      if (c.status === 'error') errorChapters++;
      if (c.status === 'queued') queuedChapters++;
      if (c.qaReport?.hasIssues) qaIssues++;
      if ((c.qaReport?.residualChineseCount || 0) > 0) chineseResidualChapters++;
      if ((c.qaReport?.leakedEnglishCount || 0) > 0) englishLeakChapters++;
      if (c.qaReport?.blockMismatch) blockMismatchChapters++;
      if (c.qaReport?.issues.some((i) => i.type === 'length_ratio'))
        lengthRatioChapters++;
      if ((c.qaReport?.repeatedParagraphCount || 0) > 0) repeatedChapters++;
      if ((c.qaReport?.glossaryViolationCount || 0) > 0)
        glossaryViolationChapters++;
    }
    return {
      total: chapters.length,
      translated,
      errorChapters,
      queuedChapters,
      qaIssues,
      chineseResidualChapters,
      englishLeakChapters,
      blockMismatchChapters,
      lengthRatioChapters,
      repeatedChapters,
      glossaryViolationChapters,
    };
  }, [chapters]);

  // Live-merged Library Summaries (keeps the currently open novel 100% real-time)
  const liveLibrarySummaries = useMemo(() => {
    if (!activeNovelId) return librarySummaries;
    let translatedChapters = 0;
    let editedChapters = 0;
    let rawChapters = 0;
    let errorChapters = 0;
    let totalRawChars = 0;
    let totalTranslatedWords = 0;
    for (const c of chapters) {
      totalRawChars += c.charCount || 0;
      if (c.status === 'translated' || c.status === 'edited') translatedChapters++;
      if (c.status === 'edited') editedChapters++;
      if (c.status === 'raw') rawChapters++;
      if (c.status === 'error') errorChapters++;
      if (c.translatedContent) {
        totalTranslatedWords += c.translatedContent
          .trim()
          .split(/\s+/)
          .filter(Boolean).length;
      }
    }
    return {
      ...librarySummaries,
      [activeNovelId]: {
        novelId: activeNovelId,
        totalChapters: chapters.length,
        translatedChapters,
        editedChapters,
        rawChapters,
        errorChapters,
        totalRawChars,
        totalTranslatedWords,
        glossaryCount: glossary.length,
        highlightCount: highlights.length,
        bookmark: savedBookmark,
      },
    };
  }, [
    librarySummaries,
    activeNovelId,
    chapters,
    glossary.length,
    highlights.length,
    savedBookmark,
  ]);

  const libraryGlobalStats = useMemo(() => {
    let totalChapters = 0;
    let totalTranslated = 0;
    let totalEdited = 0;
    for (const n of novels) {
      const s = liveLibrarySummaries[n.id];
      if (!s) continue;
      totalChapters += s.totalChapters || 0;
      totalTranslated += s.translatedChapters || 0;
      totalEdited += s.editedChapters || 0;
    }
    const pct =
      totalChapters > 0 ? Math.round((totalTranslated / totalChapters) * 100) : 0;
    return { totalChapters, totalTranslated, totalEdited, pct };
  }, [novels, liveLibrarySummaries]);

  // 1b. Direct 1:1 Raw Source Block Edit (when "Sửa raw" is toggled on)
  const handleUpdateRawBlockText = useCallback(
    async (pair: AlignedBlockPair, rawNewSource: string) => {
      if (!activeChapter) return;
      const cleanedRaw = rawNewSource.replace(/\r?\n+/g, ' ').trim();
      let nextTitleRaw = activeChapter.titleRaw;
      let nextRawContent = activeChapter.rawContent;

      if (pair.id === 'TITLE') {
        nextTitleRaw = cleanedRaw;
      } else {
        const rawBodyList = activeChapterBlockPairs
          .filter((p) => p.id !== 'TITLE')
          .map((p) => p.source);
        if (pair.index >= 0) {
          while (rawBodyList.length <= pair.index) rawBodyList.push('');
          rawBodyList[pair.index] = cleanedRaw;
          nextRawContent = rawBodyList.filter(Boolean).join('\n\n');
        }
      }

      const updatedChapter: Chapter = {
        ...activeChapter,
        titleRaw: nextTitleRaw,
        rawContent: nextRawContent,
        charCount: nextRawContent.replace(/\s+/g, '').length,
        updatedAt: Date.now(),
      };
      updatedChapter.qaReport = scanChapterQA(
        updatedChapter,
        modelConfig.customBannedWords,
        modelConfig.qaRules || DEFAULT_QA_VALIDATION_RULES
      );
      await saveChapter(updatedChapter);
      setChapters((prev) =>
        prev.map((c) => (c.id === updatedChapter.id ? updatedChapter : c))
      );
    },
    [
      activeChapter,
      activeChapterBlockPairs,
      modelConfig.customBannedWords,
      modelConfig.qaRules,
    ]
  );

  // 2. Merge current block with the next block below (pulls subsequent blocks UP by 1 slot)
  const handleMergeBlockWithNext = async (blockIndex: number, blockId: string) => {
    const bodyList = activeChapterBlockPairs
      .filter((p) => p.id !== 'TITLE')
      .map((p) => p.translation.trim());
    if (blockIndex < 0 || blockIndex >= bodyList.length - 1) {
      showToast('Không có đoạn kế tiếp bên dưới để gộp.');
      return;
    }
    const mergedText = `${bodyList[blockIndex]} ${bodyList[blockIndex + 1]}`
      .replace(/\s+/g, ' ')
      .trim();
    bodyList.splice(blockIndex, 2, mergedText);
    const nextContent = serializeBodyBlocksToContent(bodyList, true);
    pushEditorSnapshot(editorTitle, nextContent, `Gộp ${blockId} với đoạn dưới`);
    await handleSaveEditorChanges(editorTitle, nextContent, true);
    showToast(`Đã gộp ${blockId} với đoạn dưới (kéo các đoạn sau lên 1 nhịp)!`);
  };

  // 3. Split current block into 2 blocks at cursor or sentence boundary (pushes subsequent blocks DOWN by 1 slot)
  const handleSplitBlockIntoTwo = async (pair: AlignedBlockPair) => {
    if (pair.id === 'TITLE' || pair.index < 0) return;
    const text = pair.translation.trim();
    if (text.length < 4) {
      showToast('Đoạn dịch quá ngắn để tách làm 2 Block.');
      return;
    }
    const el = blockTextareaRefs.current[pair.id];
    let splitPos = -1;
    if (el && el.selectionStart > 0 && el.selectionStart < text.length) {
      splitPos = el.selectionStart;
    } else {
      // Find sentence boundary closest to midpoint
      const mid = Math.floor(text.length / 2);
      const sentenceMatches = Array.from(text.matchAll(/[.!?。！？]["”']?\s+/g));
      if (sentenceMatches.length > 0) {
        let best = sentenceMatches[0];
        let bestDist = Math.abs((best.index || 0) - mid);
        for (const m of sentenceMatches) {
          const dist = Math.abs((m.index || 0) - mid);
          if (dist < bestDist) {
            best = m;
            bestDist = dist;
          }
        }
        splitPos = (best.index || 0) + best[0].length;
      } else {
        const spaceAfterMid = text.indexOf(' ', mid);
        splitPos = spaceAfterMid > 0 ? spaceAfterMid : mid;
      }
    }

    const firstPart = text.slice(0, splitPos).trim();
    const secondPart = text.slice(splitPos).trim();
    if (!firstPart || !secondPart) {
      showToast('Hãy đặt con trỏ chuột vào vị trí giữa câu cần tách rồi bấm [Tách ↵].');
      return;
    }

    const bodyList = activeChapterBlockPairs
      .filter((p) => p.id !== 'TITLE')
      .map((p) => p.translation.trim());
    bodyList.splice(pair.index, 1, firstPart, secondPart);
    const nextContent = serializeBodyBlocksToContent(bodyList, true);
    pushEditorSnapshot(editorTitle, nextContent, `Tách ${pair.id} thành 2 đoạn`);
    await handleSaveEditorChanges(editorTitle, nextContent, true);
    showToast(`Đã tách ${pair.id} thành 2 đoạn (đẩy các đoạn sau xuống 1 nhịp)!`);
  };

  // 4. Insert an empty translation slot at blockIndex (pushes subsequent blocks DOWN by 1 slot)
  const handleInsertEmptyBlockAt = async (blockIndex: number, blockId: string) => {
    if (blockIndex < 0) return;
    const bodyList = activeChapterBlockPairs
      .filter((p) => p.id !== 'TITLE')
      .map((p) => p.translation.trim());
    bodyList.splice(blockIndex, 0, '');
    const nextContent = serializeBodyBlocksToContent(bodyList, true);
    pushEditorSnapshot(editorTitle, nextContent, `Đẩy xuống từ ${blockId}`);
    await handleSaveEditorChanges(editorTitle, nextContent, true);
    showToast(`Đã chèn ô trống tại ${blockId} và đẩy bản dịch bên dưới xuống 1 nhịp!`);
  };

  // 5. Delete extra/shifted translation slot at blockIndex (pulls subsequent blocks UP by 1 slot)
  const handleDeleteTranslatedBlockAt = async (blockIndex: number, blockId: string) => {
    if (blockIndex < 0) return;
    const bodyList = activeChapterBlockPairs
      .filter((p) => p.id !== 'TITLE')
      .map((p) => p.translation.trim());
    if (blockIndex >= bodyList.length) return;
    bodyList.splice(blockIndex, 1);
    const nextContent = serializeBodyBlocksToContent(bodyList, true);
    pushEditorSnapshot(editorTitle, nextContent, `Kéo lên tại ${blockId}`);
    await handleSaveEditorChanges(editorTitle, nextContent, true);
    showToast(`Đã xóa ô dịch lệch tại ${blockId} và kéo các đoạn dưới lên 1 nhịp!`);
  };

  // 6. Strip residual Chinese characters in a single block with 1 click
  const handleStripResidualChineseInBlock = async (pair: AlignedBlockPair) => {
    const cleaned = pair.translation
      .replace(/[\u4E00-\u9FFF\u3400-\u4DBF]+/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.;:!?])/g, '$1')
      .trim();
    handleUpdateSingleBlockText(pair, cleaned);
    if (pair.id === 'TITLE') {
      await handleSaveEditorChanges(cleaned, editorContent, true);
    } else {
      const bodyList = activeChapterBlockPairs
        .filter((p) => p.id !== 'TITLE')
        .map((p) => p.translation);
      bodyList[pair.index] = cleaned;
      const nextContent = serializeBodyBlocksToContent(bodyList, true);
      await handleSaveEditorChanges(editorTitle, nextContent, true);
    }
    showToast(`Đã lọc bỏ Hán tự sót trong ${pair.id}!`);
  };

  // 7. AI Retranslate / Polish a SINGLE Block ID in place
  const handleRetranslateSingleBlock = async (
    pair: AlignedBlockPair,
    idxInAllPairs: number
  ) => {
    if (!activeChapter || !pair.source.trim()) {
      showToast('Block này không có văn bản gốc tiếng Trung để dịch.');
      return;
    }
    setSingleBlockLoadingId(pair.id);
    try {
      const prev =
        idxInAllPairs > 0 ? activeChapterBlockPairs[idxInAllPairs - 1]?.translation : undefined;
      const next =
        idxInAllPairs < activeChapterBlockPairs.length - 1
          ? activeChapterBlockPairs[idxInAllPairs + 1]?.translation
          : undefined;
      const res = await safeFetchJson<{
        updates?: Array<{ id: string; translation: string }>;
        error?: string;
      }>(
        '/api/editor/assist',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'block_cleanup',
            targets: [
              {
                id: pair.id,
                source: pair.source,
                translation: pair.translation,
                contextBefore: prev,
                contextAfter: next,
              },
            ],
            systemInstruction: activeEditorialProfile.systemInstruction,
            pronounRule: activeEditorialProfile.pronounRule,
            includeGlossary: shouldSendGlossary,
            glossary: enabledGlossaryItems,
            model: modelConfig.selectedModel,
            thinkingLevel:
              modelConfig.thinkingLevel || DEFAULT_THINKING_LEVEL,
          }),
        },
        {
          scope: 'AI_EDITOR',
          label: `Dịch lại đơn lẻ Block ${pair.id} (Chương #${activeChapter.orderPrefix})`,
        }
      );
      const data = res.data || {};
      if (!res.ok || !res.data) {
        throw new Error(
          data.error || res.errorMessage || `Lỗi khi dịch lại Block ${pair.id}`
        );
      }
      const updates: Array<{ id: string; translation: string }> = data.updates || [];
      if (updates.length > 0 && updates[0].translation) {
        const merged = applyBlockUpdatesToChapter(
          activeChapterBlockPairs,
          updates,
          editorTitle || activeChapter.titleTranslated
        );
        pushEditorSnapshot(
          merged.titleTranslated,
          merged.translatedContent,
          `AI Dịch lại ${pair.id}`
        );
        await handleSaveEditorChanges(
          merged.titleTranslated,
          merged.translatedContent,
          true,
          merged.alignment
        );
        showToast(`Đã dịch/chuốt lại riêng Block ${pair.id} (Khóa khung 1:1)!`);
      }
    } catch (err) {
      showToast(`Lỗi AI Block ${pair.id}: ${(err as Error).message}`);
    } finally {
      setSingleBlockLoadingId(null);
    }
  };

  const activeChapterHighlights = useMemo(
    () => highlights.filter((h) => h.chapterId === activeChapterId),
    [highlights, activeChapterId]
  );

  const englishHighlightSplitRegex = useMemo(() => {
    const eng = buildEnglishLeakRegex(modelConfig.customBannedWords);
    return new RegExp(
      `([\\u4E00-\\u9FFF\\u3400-\\u4DBF]+|${eng.source})`,
      'giu'
    );
  }, [modelConfig.customBannedWords]);

  const englishExactPartRegex = useMemo(() => {
    const eng = buildEnglishLeakRegex(modelConfig.customBannedWords);
    return new RegExp(`^${eng.source}$`, 'iu');
  }, [modelConfig.customBannedWords]);

  // Helper to highlight residual Chinese, leaked English words & user 3-color highlights
  const renderHighlightedParagraph = (text: string, blockId?: string) => {
    if (!text) return null;
    const blockHighlights = blockId
      ? activeChapterHighlights.filter((h) => {
          const phrase = h.quote || h.selectedText || '';
          return h.blockId === blockId && phrase && text.includes(phrase);
        })
      : [];

    const parts = text.split(englishHighlightSplitRegex);
    return parts.map((part, idx) => {
      if (!part) return null;
      if (/^[\u4E00-\u9FFF\u3400-\u4DBF]+$/.test(part)) {
        return (
          <mark
            key={idx}
            className="rounded bg-red-500/20 px-1 font-mono text-red-800 underline decoration-red-500 decoration-wavy"
            title="Chữ Trung Quốc còn sót trong bản dịch"
          >
            {part}
          </mark>
        );
      }
      if (englishExactPartRegex.test(part)) {
        return (
          <mark
            key={idx}
            className="rounded bg-amber-500/25 px-1 font-mono text-amber-900 underline decoration-amber-600 decoration-wavy"
            title="Từ tiếng Anh không có nghĩa trong tiếng Việt lọt vào bản dịch"
          >
            {part}
          </mark>
        );
      }
      // Check if user highlighted a phrase inside this segment
      const matchedHl = blockHighlights.find((h) => {
        const phrase = h.quote || h.selectedText || '';
        return phrase && part.includes(phrase);
      });
      if (matchedHl) {
        const target = matchedHl.quote || matchedHl.selectedText || '';
        const subIdx = part.indexOf(target);
        const before = part.slice(0, subIdx);
        const after = part.slice(subIdx + target.length);
        return (
          <React.Fragment key={idx}>
            {before}
            <mark
              className={HIGHLIGHT_COLOR_STYLES[matchedHl.color].bgClass}
              title={matchedHl.note || 'Highlight của bạn'}
            >
              {target}
            </mark>
            {after}
          </React.Fragment>
        );
      }
      return <React.Fragment key={idx}>{part}</React.Fragment>;
    });
  };

  if (isInitializing) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#FBF8F1] text-[#1C1917]">
        <Loader2 className="h-8 w-8 animate-spin text-[#8C2D19]" />
        <p className="mt-3 font-serif text-base font-semibold">
          Đang khởi tạo Mặc Hương Các Studio &amp; nạp dữ liệu chương...
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#FBF8F1] text-[#1C1917]">
      {/* 1. TOP BAR CONTRACT (52px height, 3 clean zones) */}
      <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-[#E5DEC9] bg-[#F3EFE6] px-3 select-none">
        {/* Left Zone: Sidebar Toggle + Brand + Novel Switcher */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="rounded-lg p-1.5 text-[#605A52] hover:bg-[#E5DEC9]/60 hover:text-[#1C1917]"
            title={sidebarOpen ? 'Thu gọn danh sách chương' : 'Mở danh sách chương'}
          >
            {sidebarOpen ? (
              <PanelLeftClose className="h-4 w-4" />
            ) : (
              <PanelLeftOpen className="h-4 w-4" />
            )}
          </button>

          <div className="flex shrink-0 items-center gap-2">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#8C2D19] font-serif text-xs font-bold text-white shadow-2xs">
              墨
            </span>
            <span className="hidden whitespace-nowrap font-serif text-sm font-bold tracking-tight text-[#1C1917] sm:inline">
              Mặc Hương Các
            </span>
          </div>

          <div className="h-4 w-[1px] shrink-0 bg-[#E5DEC9]" />

          {/* Novel Library Button + Quick Switcher */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handleOpenLibraryModal}
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#8C2D19]/35 bg-[#8C2D19]/10 px-2.5 py-1.5 text-xs font-bold text-[#8C2D19] transition hover:bg-[#8C2D19] hover:text-white"
              title={`Mở Thư Viện & Bảng Điều Khiển Tiến Độ Toàn Thư Viện — ${novels.length} bộ truyện · Đã dịch ${libraryGlobalStats.totalTranslated}/${libraryGlobalStats.totalChapters} chương (${libraryGlobalStats.pct}%) · Đã duyệt ${libraryGlobalStats.totalEdited} chương`}
            >
              <Library className="h-3.5 w-3.5" />
              <span>Thư Viện</span>
              <span className="font-mono text-[10px] opacity-90">
                {novels.length} bộ · {libraryGlobalStats.pct}%
              </span>
            </button>

            <select
              value={activeNovelId}
              onChange={(e) => {
                if (e.target.value) handleSelectNovel(e.target.value);
              }}
              disabled={novels.length === 0}
              className="max-w-[170px] truncate rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-2.5 py-1.5 text-xs font-semibold text-[#1C1917] focus:border-[#8C2D19] focus:outline-hidden disabled:opacity-60"
              title="Chuyển nhanh giữa các bộ truyện trong Thư viện"
            >
              {novels.length === 0 ? (
                <option value="">-- Thư viện trống --</option>
              ) : (
                novels.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.pinned ? '⭐ ' : ''}
                    {n.title}
                    {n.originalTitle ? ` (${n.originalTitle})` : ''}
                  </option>
                ))
              )}
            </select>
            <button
              type="button"
              onClick={() => setIsNewNovelModalOpen(true)}
              className="shrink-0 rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] p-1.5 text-[#605A52] hover:bg-[#E5DEC9]/60 hover:text-[#1C1917]"
              title="Tạo nhanh dự án truyện mới"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Center Zone: Unified 2-Mode Workspace Switcher */}
        <div className="flex shrink-0 items-center rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] p-0.5">
          <button
            onClick={() => setWorkspaceMode('editor')}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1 text-xs font-semibold transition ${
              workspaceMode === 'editor'
                ? 'bg-[#8C2D19] text-white shadow-2xs'
                : 'text-[#605A52] hover:text-[#1C1917]'
            }`}
          >
            <Columns className="h-3.5 w-3.5" />
            Biên tập bản dịch
          </button>
          <button
            onClick={() => setWorkspaceMode('reader')}
            className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1 text-xs font-semibold transition ${
              workspaceMode === 'reader'
                ? 'bg-[#8C2D19] text-white shadow-2xs'
                : 'text-[#605A52] hover:text-[#1C1917]'
            }`}
          >
            <BookOpen className="h-3.5 w-3.5" />
            Đọc
          </button>
        </div>

        {/* Right Zone: Import, Presets/Model (incl. Glossary), Reader Appearance, Terminal, Guide, Export/Backup */}
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-2.5 py-1.5 text-xs font-semibold text-[#1C1917] hover:bg-[#E5DEC9]/60"
          >
            <FolderUp className="h-3.5 w-3.5 text-[#8C2D19]" />
            <span className="hidden md:inline">Nhập Chương</span>
          </button>

          <button
            onClick={() => {
              setInstructionsModalTab('instructions');
              setIsInstructionsModalOpen(true);
            }}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-2.5 py-1.5 text-xs font-semibold text-[#1C1917] hover:bg-[#E5DEC9]/60"
            title={`Quản lý Preset Dịch, Preset Biên Tập AI, Từ Điển Glossary & Chọn Model (${modelConfig.selectedModel} • Thinking: ${modelConfig.thinkingLevel || DEFAULT_THINKING_LEVEL})`}
          >
            <Sliders className="h-3.5 w-3.5 text-[#8C2D19]" />
            <span className="hidden lg:inline">Preset &amp; Model</span>
            <span className="rounded bg-[#8C2D19]/12 px-1.5 py-0.2 font-mono text-[10px] font-bold text-[#8C2D19]">
              {modelConfig.selectedModel}
            </span>
            <span
              className="rounded border border-[#8C2D19]/30 bg-white px-1.5 py-0.2 font-mono text-[10px] font-bold text-[#8C2D19]"
              title={`Mức suy luận AI hiện tại: ${modelConfig.thinkingLevel || DEFAULT_THINKING_LEVEL} (Mặc định: high)`}
            >
              {(modelConfig.thinkingLevel || DEFAULT_THINKING_LEVEL).toUpperCase()}
            </span>
            {shouldSendGlossary && (
              <span
                className="rounded bg-[#1E6F50]/15 px-1.5 py-0.2 font-mono text-[10px] font-bold text-[#1E6F50]"
                title="Đang BẬT gửi kèm bảng Glossary"
              >
                Gloss
              </span>
            )}
          </button>

          <button
            onClick={() => setIsAppearanceModalOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-2.5 py-1.5 text-xs font-semibold text-[#1C1917] hover:bg-[#E5DEC9]/60"
            title="Màu nền HEX/RGB, Phông chữ & Căn đều Justify"
          >
            <Palette className="h-3.5 w-3.5 text-[#8C2D19]" />
            <span className="hidden xl:inline">Giao Diện Đọc</span>
          </button>

          <button
            onClick={() => setIsTerminalOpen(!isTerminalOpen)}
            className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
              terminalCounts.errors > 0
                ? 'border-red-300 bg-red-50 text-red-800 hover:bg-red-100'
                : isTerminalOpen
                ? 'border-[#8C2D19] bg-[#8C2D19]/12 text-[#8C2D19]'
                : 'border-[#E5DEC9] bg-[#FBF8F1] text-[#1C1917] hover:bg-[#E5DEC9]/60'
            }`}
            title="Bật/Tắt bảng System Terminal tích hợp trong dự án để xem trực tiếp nhật ký quét Glossary, Dịch AI & Xoay tua Key"
          >
            <Terminal className="h-3.5 w-3.5 text-[#8C2D19]" />
            <span className="hidden sm:inline">Terminal</span>
            {terminalCounts.errors > 0 ? (
              <span className="rounded bg-red-600 px-1.5 py-0.2 font-mono text-[10px] font-bold text-white">
                {terminalCounts.errors} lỗi
              </span>
            ) : (
              <span className="rounded bg-[#8C2D19]/12 px-1.5 py-0.2 font-mono text-[10px] font-bold text-[#8C2D19]">
                {terminalCounts.total}
              </span>
            )}
          </button>

          <button
            onClick={() => setIsUserGuideOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-2.5 py-1.5 text-xs font-semibold text-[#1C1917] hover:bg-[#E5DEC9]/60"
            title="Mở Cẩm Nang Hướng Dẫn Sử Dụng chi tiết & Tải tài liệu (.md)"
          >
            <HelpCircle className="h-3.5 w-3.5 text-[#8C2D19]" />
            <span className="hidden xl:inline">Hướng Dẫn</span>
          </button>

          <button
            onClick={() => setIsExportModalOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#8C2D19] px-3 py-1.5 text-xs font-semibold text-white shadow-2xs hover:bg-[#722211]"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">EPUB &amp; Backup</span>
          </button>
        </div>
      </header>

      {/* 2. MAIN WORKSPACE CONTAINER */}
      <div className="flex flex-1 overflow-hidden">
        {/* LEFT SIDEBAR: CHAPTER MANAGER (Tickboxes, Sort, Filter, Search, QA Badges, Batch Queue) */}
        {sidebarOpen && (
          <aside className="flex w-[380px] shrink-0 flex-col border-r border-[#E5DEC9] bg-[#F3EFE6]">
            {/* Top summary & Search bar */}
            <div className="space-y-2 border-b border-[#E5DEC9] p-3">
              {/* Novel Progress & QA Overview */}
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-[#1C1917]">
                  Đã dịch:{' '}
                  <strong className="font-mono text-[#1E6F50]">
                    {stats.translated}/{stats.total}
                  </strong>{' '}
                  chương
                </span>
                <div className="flex items-center gap-1.5">
                  {stats.qaIssues > 0 ? (
                    <button
                      onClick={() =>
                        setFilterOption(
                          filterOption === 'qa_any' ? 'all' : 'qa_any'
                        )
                      }
                      className="inline-flex items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-900 hover:bg-amber-500/30"
                      title="Lọc các chương có lỗi QA (Sót Hán tự, lọt từ tiếng Anh, lệch số đoạn, tỷ lệ độ dài bất thường...)"
                    >
                      <AlertTriangle className="h-3 w-3 text-amber-700" />
                      {stats.qaIssues} chương lỗi QA
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#1E6F50]">
                      <CheckCircle2 className="h-3 w-3" />
                      0 lỗi QA
                    </span>
                  )}
                  <button
                    onClick={handleBulkScanQA}
                    className="rounded border border-[#C9B99A] bg-[#FBF8F1] px-1.5 py-0.5 text-[10px] font-semibold text-[#1C1917] hover:bg-[#E5DEC9]"
                    title="Quét lại toàn bộ chương theo bộ tiêu chí QA"
                  >
                    Quét QA
                  </button>
                </div>
              </div>

              {/* Search Input + Quick Jump + Full-Text Search Modal Trigger */}
              <div className="flex gap-1.5">
                <div className="relative flex-1">
                  <Search className="absolute top-2 left-2.5 h-3.5 w-3.5 text-[#605A52]" />
                  <input
                    type="text"
                    placeholder="Tìm tên chương, mã 0001..."
                    value={chapterSearch}
                    onChange={(e) => setChapterSearch(e.target.value)}
                    className="w-full rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] py-1.5 pr-2 pl-8 text-xs text-[#1C1917] focus:border-[#8C2D19] focus:outline-hidden"
                  />
                </div>
                <form onSubmit={handleQuickJump} className="w-16">
                  <input
                    type="text"
                    placeholder="#Mã"
                    value={quickJumpInput}
                    onChange={(e) => setQuickJumpInput(e.target.value)}
                    className="w-full rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-2 py-1.5 text-center font-mono text-xs text-[#1C1917] focus:border-[#8C2D19] focus:outline-hidden"
                    title="Nhập số chương (VD: 1 hoặc 0003) rồi nhấn Enter để nhảy nhanh"
                  />
                </form>
                <button
                  onClick={() => setIsSearchReplaceModalOpen(true)}
                  className="rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-2 py-1.5 text-xs font-semibold text-[#8C2D19] hover:bg-[#E5DEC9]/60"
                  title="Tìm kiếm toàn văn & Thay thế hàng loạt xuyên chương"
                >
                  Toàn văn
                </button>
              </div>

              {/* Sort & Multi-Criteria QA Filter Row */}
              <div className="grid grid-cols-2 gap-1.5">
                <div className="flex items-center gap-1 rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-2 py-1">
                  <Filter className="h-3 w-3 shrink-0 text-[#605A52]" />
                  <select
                    value={filterOption}
                    onChange={(e) =>
                      setFilterOption(e.target.value as FilterOption)
                    }
                    className="w-full bg-transparent text-[11px] font-medium text-[#1C1917] focus:outline-hidden"
                  >
                    <option value="all">Lọc: Tất cả ({chapters.length})</option>
                    <option value="raw">Chưa dịch (Raw)</option>
                    <option value="translating">Đang dịch / Hàng đợi</option>
                    <option value="translated">Đã dịch</option>
                    <option value="edited">Đã biên tập</option>
                    <option value="error">Bị lỗi API</option>
                    <option value="qa_any">
                      ⚠️ Tất cả lỗi QA ({stats.qaIssues})
                    </option>
                    <option value="qa_chinese">
                      🀄 Sót chữ Trung Quốc ({stats.chineseResidualChapters})
                    </option>
                    <option value="qa_english">
                      🔤 Lọt từ tiếng Anh ({stats.englishLeakChapters})
                    </option>
                    <option value="qa_block_mismatch">
                      📐 Không khớp đoạn Block ({stats.blockMismatchChapters})
                    </option>
                    <option value="qa_length_ratio">
                      📏 Lệch tỷ lệ độ dài ({stats.lengthRatioChapters})
                    </option>
                    <option value="qa_repeated">
                      🔁 Lặp đoạn bất thường ({stats.repeatedChapters})
                    </option>
                    <option value="qa_glossary">
                      📕 Lệch Glossary / Từ cấm ({stats.glossaryViolationChapters})
                    </option>
                  </select>
                </div>

                <div className="flex items-center gap-1 rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-2 py-1">
                  <ArrowUpDown className="h-3 w-3 shrink-0 text-[#605A52]" />
                  <select
                    value={sortOption}
                    onChange={(e) => setSortOption(e.target.value as SortOption)}
                    className="w-full bg-transparent text-[11px] font-medium text-[#1C1917] focus:outline-hidden"
                  >
                    <option value="prefix_asc">Thứ tự: 0000 → 9999</option>
                    <option value="prefix_desc">Thứ tự: 9999 → 0000</option>
                    <option value="qa_issues_first">Ưu tiên chương lỗi QA</option>
                    <option value="length_desc">Độ dài: Dài → Ngắn</option>
                    <option value="length_asc">Độ dài: Ngắn → Dài</option>
                    <option value="status">Theo trạng thái</option>
                  </select>
                </div>
              </div>

              {/* Tickbox Selection Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-1 pt-0.5 text-[11px]">
                <div className="flex flex-wrap items-center gap-1">
                  <button
                    onClick={handleSelectOnlyFiltered}
                    className="rounded bg-[#8C2D19]/15 px-1.5 py-0.5 font-semibold text-[#8C2D19] hover:bg-[#8C2D19]/25"
                    title="Chỉ tick chọn các chương nằm trong kết quả lọc hiện tại (để đưa đi dịch lại hoặc biên tập AI)"
                  >
                    Chỉ chọn kết quả lọc ({filteredAndSortedChapters.length})
                  </button>
                  <button
                    onClick={handleDeselectAll}
                    className="rounded bg-[#E5DEC9]/70 px-1.5 py-0.5 font-medium text-[#1C1917] hover:bg-[#E5DEC9]"
                  >
                    Bỏ chọn
                  </button>
                  <button
                    onClick={handleInvertSelection}
                    className="rounded bg-[#E5DEC9]/70 px-1.5 py-0.5 font-medium text-[#1C1917] hover:bg-[#E5DEC9]"
                  >
                    Đảo
                  </button>
                  <button
                    onClick={() => setShowRangeSelector(!showRangeSelector)}
                    className="rounded bg-[#E5DEC9]/70 px-1.5 py-0.5 font-medium text-[#1C1917] hover:bg-[#E5DEC9]"
                  >
                    Khoảng...
                  </button>
                </div>
                <span className="font-mono font-bold text-[#8C2D19]">
                  Tick: {selectedChapterIds.size}
                </span>
              </div>

              {showRangeSelector && (
                <div className="flex items-center gap-1.5 rounded-lg border border-[#C9B99A] bg-[#FBF8F1] p-2 text-xs">
                  <span>Từ #</span>
                  <input
                    type="number"
                    placeholder="0"
                    value={rangeFromInput}
                    onChange={(e) => setRangeFromInput(e.target.value)}
                    className="w-14 rounded border border-[#E5DEC9] px-1.5 py-0.5 font-mono text-xs"
                  />
                  <span>đến #</span>
                  <input
                    type="number"
                    placeholder="50"
                    value={rangeToInput}
                    onChange={(e) => setRangeToInput(e.target.value)}
                    className="w-14 rounded border border-[#E5DEC9] px-1.5 py-0.5 font-mono text-xs"
                  />
                  <button
                    onClick={handleSelectByRange}
                    className="ml-auto rounded bg-[#8C2D19] px-2.5 py-1 text-[11px] font-semibold text-white"
                  >
                    Tick khoảng
                  </button>
                </div>
              )}
            </div>

            {/* Chapter List */}
            <div
              ref={sidebarListContainerRef}
              className="flex-1 overflow-y-auto divide-y divide-[#E5DEC9]/60"
            >
              {filteredAndSortedChapters.map((ch, idx) => {
                const isSelected = selectedChapterIds.has(ch.id);
                const isActive = activeChapterId === ch.id;
                const statusMeta = STATUS_LABELS[ch.status];
                const qa = ch.qaReport;

                return (
                  <div
                    key={ch.id}
                    data-sidebar-chapter-id={ch.id}
                    onClick={() => setActiveChapterId(ch.id)}
                    className={`group flex cursor-pointer items-start gap-2.5 px-3 py-2.5 transition select-none ${
                      isActive
                        ? 'bg-[#8C2D19]/12 border-l-4 border-l-[#8C2D19]'
                        : 'hover:bg-[#E5DEC9]/40'
                    }`}
                  >
                    {/* Tickbox */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleChapterTick(ch.id, idx, e.shiftKey);
                      }}
                      className="mt-0.5 text-[#8C2D19] hover:scale-110"
                      title="Tick chọn chương (Giữ phím Shift + Click để chọn hàng loạt theo dải)"
                    >
                      {isSelected ? (
                        <CheckSquare className="h-4 w-4 fill-[#8C2D19]/15 text-[#8C2D19]" />
                      ) : (
                        <Square className="h-4 w-4 text-[#605A52]/70 group-hover:text-[#1C1917]" />
                      )}
                    </button>

                    {/* Chapter Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="rounded bg-[#E5DEC9]/80 px-1.5 py-0.2 font-mono text-[10px] font-bold text-[#1C1917]">
                          {ch.orderPrefix}
                        </span>
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          {qa?.hasIssues && (
                            <>
                              {qa.residualChineseCount > 0 && (
                                <span
                                  className="rounded bg-red-100 px-1.5 py-0.2 font-mono text-[10px] font-bold text-red-800"
                                  title={`Còn sót ${qa.residualChineseCount} chữ Hán trong bản dịch`}
                                >
                                  🀄 {qa.residualChineseCount} Hán
                                </span>
                              )}
                              {qa.leakedEnglishCount > 0 && (
                                <span
                                  className="rounded bg-amber-100 px-1.5 py-0.2 font-mono text-[10px] font-bold text-amber-900"
                                  title={`Phát hiện ${qa.leakedEnglishCount} từ tiếng Anh ('but', 'and'...) lọt vào câu`}
                                >
                                  🔤 {qa.leakedEnglishCount} Eng
                                </span>
                              )}
                              {qa.blockMismatch && (
                                <span
                                  className="rounded bg-purple-100 px-1.5 py-0.2 font-mono text-[10px] font-bold text-purple-900"
                                  title="Số đoạn bản dịch không khớp với số đoạn nguyên tác"
                                >
                                  📐 Lệch đoạn
                                </span>
                              )}
                              {(qa.glossaryViolationCount || 0) > 0 && (
                                <span
                                  className="rounded bg-rose-100 px-1.5 py-0.2 font-mono text-[10px] font-bold text-rose-900"
                                  title={`Phát hiện ${qa.glossaryViolationCount} điểm lệch Glossary hoặc phạm từ cấm dịch`}
                                >
                                  📕 {qa.glossaryViolationCount} Gloss
                                </span>
                              )}
                            </>
                          )}
                          <span
                            className={`rounded px-1.5 py-0.2 text-[10px] font-semibold ${statusMeta.colorClass}`}
                          >
                            {statusMeta.label}
                          </span>
                        </div>
                      </div>

                      <p className="mt-1 truncate text-xs font-bold text-[#1C1917]">
                        {ch.titleTranslated || ch.titleRaw}
                      </p>
                      {ch.titleTranslated && (
                        <p className="truncate text-[11px] text-[#605A52]">
                          {ch.titleRaw}
                        </p>
                      )}
                      {ch.lastError && (
                        <p className="mt-0.5 truncate text-[10px] font-medium text-red-600">
                          Lỗi: {ch.lastError}
                        </p>
                      )}
                      <div className="mt-1 flex flex-wrap items-center justify-between gap-1 font-mono text-[10px] text-[#605A52]">
                        <span>{ch.charCount.toLocaleString()} chữ Hán</span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {(ch.translatedByModel ||
                            ch.status === 'translated' ||
                            ch.status === 'edited') && (
                            <span
                              className="inline-flex items-center gap-0.5 rounded border border-[#8C2D19]/25 bg-[#8C2D19]/8 px-1.5 py-0.2 font-mono text-[10px] font-semibold text-[#8C2D19]"
                              title={`Được dịch / biên tập bởi model: ${
                                ch.translatedByModel || modelConfig.selectedModel
                              }${ch.lastKeyUsed ? ` (Key #${ch.lastKeyUsed})` : ''}`}
                            >
                              <Cpu className="h-2.5 w-2.5 shrink-0" />
                              {(ch.translatedByModel || modelConfig.selectedModel).replace(
                                /^models\//,
                                ''
                              )}
                            </span>
                          )}
                          {ch.translatedContent && (
                            <span>
                              {ch.translatedContent
                                .trim()
                                .split(/\s+/)
                                .filter(Boolean)
                                .length.toLocaleString()}{' '}
                              từ Việt
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {filteredAndSortedChapters.length === 0 && (
                <div className="p-8 text-center text-xs text-[#605A52]">
                  Không có chương nào khớp với bộ lọc hiện tại.
                </div>
              )}
            </div>

            {/* Bottom Sticky Batch Action Bar (Batch Translate + Batch AI Editorial + Pause/Resume/Hard Stop) */}
            <div className="space-y-2 border-t border-[#E5DEC9] bg-[#FBF8F1] p-3 shadow-inner">
              {/* Quick Thinking Level Bar (minimal | low | medium | high — Default: high) */}
              <div className="flex items-center justify-between gap-1.5 rounded-lg border border-[#E5DEC9] bg-white px-2.5 py-1.5 text-[11px]">
                <span
                  className="font-semibold text-[#605A52]"
                  title="Chọn mức suy luận AI (Thinking Level). Mặc định là high; hạ xuống medium/low/minimal nếu cổng 300 giây bị ngắt do suy nghĩ lâu."
                >
                  Thinking:
                </span>
                <div className="flex items-center gap-1">
                  {THINKING_LEVEL_OPTIONS.map((opt) => {
                    const activeLvl: ThinkingLevelOption =
                      modelConfig.thinkingLevel || DEFAULT_THINKING_LEVEL;
                    const isActive = activeLvl === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          const nextCfg: ModelConfigState = {
                            ...modelConfig,
                            thinkingLevel: opt.id,
                          };
                          setModelConfig(nextCfg);
                          saveModelConfig(nextCfg);
                          showToast(
                            `Đã chuyển mức suy luận AI sang "${opt.id}"${
                              opt.id === 'high' ? ' (Mặc định)' : ''
                            }!`
                          );
                        }}
                        className={`rounded px-1.5 py-0.5 font-mono text-[10px] font-bold transition ${
                          isActive
                            ? 'bg-[#8C2D19] text-white shadow-2xs'
                            : 'bg-[#F3EFE6] text-[#605A52] hover:bg-[#E5DEC9] hover:text-[#1C1917]'
                        }`}
                        title={`${opt.label} — ${opt.description}`}
                      >
                        {opt.id}
                      </button>
                    );
                  })}
                </div>
              </div>

              {batchStatus !== 'idle' ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    {batchStatus === 'paused' ? (
                      <span className="flex items-center gap-1.5 font-bold text-amber-800">
                        <Pause className="h-3.5 w-3.5 fill-current" />
                        Đã tạm dừng hàng đợi ({batchProgress.activeWorkers} luồng đang nốt)
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 font-semibold text-[#8C2D19]">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {batchJobLabel === 'ai_edit'
                          ? `Đang Biên tập AI (${batchProgress.activeWorkers} luồng)...`
                          : `Đang Dịch (${batchProgress.activeWorkers} luồng)...`}
                      </span>
                    )}
                    <span className="font-mono font-bold text-[#1C1917]">
                      {batchProgress.completed}/{batchProgress.total}
                    </span>
                  </div>

                  {/* Live Model & Key Telemetry */}
                  <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] font-mono text-[#605A52]">
                    <span>
                      Model chính: <strong className="text-[#8C2D19]">{modelConfig.selectedModel}</strong>
                    </span>
                    {batchProgress.lastModelUsed && (
                      <span className="rounded bg-[#1E6F50]/15 px-1.5 py-0.2 font-semibold text-[#1E6F50]">
                        Vừa xong: {batchProgress.lastModelUsed}
                        {batchProgress.lastKeyUsed ? ` • KEY#${batchProgress.lastKeyUsed}` : ''}
                      </span>
                    )}
                  </div>

                  <div className="h-2 w-full overflow-hidden rounded-full bg-[#E5DEC9]">
                    <div
                      className={`h-full transition-all ${
                        batchStatus === 'paused' ? 'bg-amber-600' : 'bg-[#8C2D19]'
                      }`}
                      style={{
                        width: `${
                          batchProgress.total > 0
                            ? Math.round(
                                (batchProgress.completed / batchProgress.total) * 100
                              )
                            : 0
                        }%`,
                      }}
                    />
                  </div>

                  {/* Auto-Pause / Manual Pause Reason Banner + Quick Model Switch */}
                  {batchStatus === 'paused' && batchPauseReason && (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-950 space-y-1.5">
                      <p className="leading-snug font-medium">{batchPauseReason}</p>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {modelConfig.selectedModel !== 'gemini-3.1-flash-lite' && (
                          <button
                            type="button"
                            onClick={() => {
                              const nextCfg: ModelConfigState = {
                                ...modelConfig,
                                selectedModel: 'gemini-3.1-flash-lite',
                              };
                              setModelConfig(nextCfg);
                              saveModelConfig(nextCfg);
                              showToast(
                                'Đã chuyển sang model gemini-3.1-flash-lite! Hãy bấm Tiếp tục.'
                              );
                            }}
                            className="rounded bg-amber-700 px-2 py-1 text-[10px] font-bold text-white hover:bg-amber-800"
                          >
                            Đổi sang gemini-3.1-flash-lite
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setInstructionsModalTab('model_keys');
                            setIsInstructionsModalOpen(true);
                          }}
                          className="rounded border border-amber-400 bg-white px-2 py-1 text-[10px] font-semibold text-amber-900 hover:bg-amber-100"
                        >
                          Mở Bể Key / Đổi Model...
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Pause / Resume & Hard Stop Control Buttons */}
                  <div className="grid grid-cols-2 gap-1.5">
                    {batchStatus === 'running' ? (
                      <button
                        type="button"
                        onClick={handlePauseBatchQueue}
                        className="flex items-center justify-center gap-1.5 rounded-lg bg-amber-600 py-1.5 px-2 text-xs font-semibold text-white hover:bg-amber-700"
                        title="Tạm dừng nhận chương mới (Giữ nguyên vị trí hàng đợi để bấm Tiếp tục bất kỳ lúc nào)"
                      >
                        <Pause className="h-3.5 w-3.5 fill-current" />
                        Tạm dừng
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleResumeBatchQueue}
                        className="flex items-center justify-center gap-1.5 rounded-lg bg-[#1E6F50] py-1.5 px-2 text-xs font-semibold text-white hover:bg-[#16563D]"
                        title="Tiếp tục chạy từ chương đang chờ tiếp theo"
                      >
                        <Play className="h-3.5 w-3.5 fill-current" />
                        Tiếp tục ({batchProgress.total - batchProgress.completed} chương)
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={handleHardStopBatchQueue}
                      className="flex items-center justify-center gap-1.5 rounded-lg bg-red-600 py-1.5 px-2 text-xs font-semibold text-white hover:bg-red-700"
                      title="Ngắt ngay lập tức mọi kết nối API đang chạy & trả các chương Hàng đợi về trạng thái ban đầu"
                    >
                      <XCircle className="h-3.5 w-3.5" />
                      Dừng hẳn (Hủy ngay)
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* 1-Click Retry Failed / Stranded Queued Chapters Bar */}
                  {(stats.errorChapters > 0 || stats.queuedChapters > 0) && (
                    <div className="flex items-center justify-between gap-1.5 rounded-lg border border-red-200 bg-red-50/80 px-2.5 py-1.5 text-[11px]">
                      <span className="font-semibold text-red-800">
                        {stats.errorChapters > 0
                          ? `${stats.errorChapters} chương lỗi`
                          : ''}
                        {stats.errorChapters > 0 && stats.queuedChapters > 0
                          ? ' • '
                          : ''}
                        {stats.queuedChapters > 0
                          ? `${stats.queuedChapters} chương chờ`
                          : ''}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleRetryFailedChapters('translate')}
                          className="inline-flex items-center gap-1 rounded bg-[#8C2D19] px-2 py-0.5 text-[10px] font-bold text-white hover:bg-[#722211]"
                          title="Tự động gom tất cả chương bị lỗi / kẹt hàng đợi và chạy Dịch lại ngay mà không cần tick chọn thủ công"
                        >
                          <RotateCcw className="h-3 w-3" />
                          Chạy lại ({stats.errorChapters + stats.queuedChapters})
                        </button>
                        {stats.queuedChapters > 0 && (
                          <button
                            type="button"
                            onClick={handleResetStrandedQueuedChapters}
                            className="rounded border border-red-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-red-700 hover:bg-red-100"
                            title="Trả các chương bị kẹt trạng thái Hàng đợi về Chưa dịch / Đã dịch"
                          >
                            Đặt lại
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      onClick={() => handleStartBatchQueue('translate')}
                      disabled={selectedChapterIds.size === 0}
                      className="flex items-center justify-center gap-1.5 rounded-lg bg-[#8C2D19] py-2 px-2 text-xs font-semibold text-white shadow-xs hover:bg-[#722211] disabled:opacity-45"
                      title="Dịch mới hoặc Dịch lại các chương đang tick chọn bằng Structured Output (blocks-v1)"
                    >
                      <Play className="h-3.5 w-3.5 fill-current" />
                      Dịch ({selectedChapterIds.size})
                    </button>

                    <button
                      onClick={() => handleStartBatchQueue('ai_edit')}
                      disabled={selectedChapterIds.size === 0}
                      className="flex items-center justify-center gap-1.5 rounded-lg bg-[#1E6F50] py-2 px-2 text-xs font-semibold text-white shadow-xs hover:bg-[#16563D] disabled:opacity-45"
                      title="Đưa các chương đang tick chọn đi Biên tập AI (Tự động dọn các Block ID lỗi Hán tự/English leak)"
                    >
                      <Wand2 className="h-3.5 w-3.5" />
                      Biên tập AI ({selectedChapterIds.size})
                    </button>
                  </div>

                  {selectedChapterIds.size > 0 && (
                    <div className="flex items-center justify-between gap-1 pt-0.5">
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          const val = e.target.value as ChapterStatus;
                          if (val) {
                            handleBulkChangeStatus(val);
                            e.target.value = '';
                          }
                        }}
                        className="flex-1 rounded border border-[#E5DEC9] bg-white px-2 py-1 text-[11px] font-medium text-[#1C1917]"
                      >
                        <option value="" disabled>
                          Đổi trạng thái ({selectedChapterIds.size} chương)...
                        </option>
                        <option value="raw">Đặt lại: Chưa dịch (Xóa bản dịch)</option>
                        <option value="translated">Đánh dấu: Đã dịch</option>
                        <option value="edited">Đánh dấu: Đã biên tập</option>
                      </select>

                      <button
                        onClick={handleBulkDeleteSelectedChapters}
                        className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100"
                        title="Xóa các chương đã tick"
                      >
                        <Trash2 className="h-3 w-3" />
                        Xóa
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </aside>
        )}

        {/* CENTER WORKSPACE: STUDIO EDITOR / BILINGUAL BLOCK-ID / CLEAN JUSTIFIED READER */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {activeChapter ? (
            <>
              {/* Active Chapter Sub-Header Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5DEC9] bg-[#FBF8F1] px-4 py-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <button
                    onClick={() => prevChapter && setActiveChapterId(prevChapter.id)}
                    disabled={!prevChapter}
                    className="rounded-lg border border-[#E5DEC9] bg-white p-1.5 text-[#1C1917] shadow-2xs hover:bg-[#F3EFE6] disabled:opacity-35"
                    title={
                      prevChapter
                        ? `Chương trước: #${prevChapter.orderPrefix} ${
                            prevChapter.titleTranslated || prevChapter.titleRaw
                          }`
                        : 'Đang ở chương đầu tiên'
                    }
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>

                  {/* Interactive Chapter Dropdown Selector between Prev & Next arrows */}
                  <div ref={chapterDropdownRef} className="relative min-w-0">
                    <button
                      type="button"
                      onClick={() => {
                        setIsChapterDropdownOpen((prev) => !prev);
                        setChapterDropdownQuery('');
                      }}
                      className="flex w-[260px] items-center justify-between gap-2 rounded-lg border border-[#C9B99A] bg-white px-2.5 py-1 text-left shadow-2xs transition hover:border-[#8C2D19] hover:bg-[#F3EFE6]/50 sm:w-[400px] md:w-[500px] xl:w-[580px]"
                      title="Bấm để mở danh sách chọn chương nhanh"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <span className="shrink-0 rounded bg-[#8C2D19]/12 px-2 py-0.5 font-mono text-xs font-bold text-[#8C2D19]">
                          #{activeChapter.orderPrefix}
                        </span>
                        <span className="truncate font-sans text-sm font-bold text-[#1C1917]">
                          {normalizeVietnameseText(
                            activeChapter.titleTranslated || activeChapter.titleRaw
                          )}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="hidden shrink-0 rounded bg-[#E5DEC9]/70 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#605A52] lg:inline">
                          {activeIndexInFiltered >= 0
                            ? `${activeIndexInFiltered + 1}/${filteredAndSortedChapters.length}`
                            : `${filteredAndSortedChapters.length}`}
                        </span>
                        <ChevronDown
                          className={`h-4 w-4 shrink-0 text-[#605A52] transition-transform ${
                            isChapterDropdownOpen ? 'rotate-180 text-[#8C2D19]' : ''
                          }`}
                        />
                      </div>
                    </button>

                    {isChapterDropdownOpen && (
                      <div className="absolute top-full left-0 z-50 mt-1.5 w-[320px] overflow-hidden rounded-xl border border-[#C9B99A] bg-[#FBF8F1] shadow-xl sm:w-[460px] md:w-[540px] xl:w-[580px]">
                        {/* Search & Quick Jump Header inside Dropdown */}
                        <div className="space-y-2 border-b border-[#E5DEC9] bg-[#F3EFE6] p-2.5">
                          <div className="relative">
                            <Search className="absolute top-2 left-2.5 h-3.5 w-3.5 text-[#605A52]" />
                            <input
                              type="text"
                              autoFocus
                              placeholder="Tìm nhanh số chương (VD: 0008, 120) hoặc tên chương..."
                              value={chapterDropdownQuery}
                              onChange={(e) =>
                                setChapterDropdownQuery(e.target.value)
                              }
                              className="w-full rounded-lg border border-[#C9B99A] bg-white py-1.5 pr-3 pl-8 font-sans text-xs text-[#1C1917] focus:border-[#8C2D19] focus:outline-hidden"
                            />
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-[#605A52]">
                            <span>
                              {chapterDropdownQuery.trim()
                                ? `Khớp ${dropdownChapterSlice.totalMatches} chương`
                                : dropdownChapterSlice.isWindowed
                                ? `Hiển thị quanh chương hiện tại (${dropdownChapterSlice.windowStart}–${dropdownChapterSlice.windowEnd} / ${dropdownChapterSlice.totalMatches})`
                                : `Tổng ${dropdownChapterSlice.totalMatches} chương`}
                            </span>
                            <div className="flex items-center gap-1">
                              {filteredAndSortedChapters.length > 0 && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveChapterId(
                                        filteredAndSortedChapters[0].id
                                      );
                                      setIsChapterDropdownOpen(false);
                                    }}
                                    className="rounded border border-[#C9B99A] bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#1C1917] hover:bg-[#E5DEC9]"
                                  >
                                    Đầu (#{filteredAndSortedChapters[0].orderPrefix})
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setActiveChapterId(
                                        filteredAndSortedChapters[
                                          filteredAndSortedChapters.length - 1
                                        ].id
                                      );
                                      setIsChapterDropdownOpen(false);
                                    }}
                                    className="rounded border border-[#C9B99A] bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#1C1917] hover:bg-[#E5DEC9]"
                                  >
                                    Cuối (#
                                    {
                                      filteredAndSortedChapters[
                                        filteredAndSortedChapters.length - 1
                                      ].orderPrefix
                                    }
                                    )
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Scrollable Chapter Options */}
                        <div className="max-h-[340px] divide-y divide-[#E5DEC9]/60 overflow-y-auto bg-white">
                          {dropdownChapterSlice.items.map((ch) => {
                            const isCurrent = ch.id === activeChapter.id;
                            const statusMeta = STATUS_LABELS[ch.status];
                            return (
                              <button
                                key={ch.id}
                                type="button"
                                ref={
                                  isCurrent
                                    ? (el) => {
                                        if (el && !chapterDropdownQuery.trim()) {
                                          el.scrollIntoView({ block: 'center' });
                                        }
                                      }
                                    : undefined
                                }
                                onClick={() => {
                                  setActiveChapterId(ch.id);
                                  setIsChapterDropdownOpen(false);
                                }}
                                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition ${
                                  isCurrent
                                    ? 'bg-[#8C2D19]/12 font-bold text-[#8C2D19]'
                                    : 'text-[#1C1917] hover:bg-[#F3EFE6]/70'
                                }`}
                              >
                                <div className="flex min-w-0 items-center gap-2">
                                  <span
                                    className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${
                                      isCurrent
                                        ? 'bg-[#8C2D19] text-white'
                                        : 'bg-[#E5DEC9]/80 text-[#1C1917]'
                                    }`}
                                  >
                                    #{ch.orderPrefix}
                                  </span>
                                  <span className="truncate font-sans text-xs">
                                    {normalizeVietnameseText(
                                      ch.titleTranslated || ch.titleRaw
                                    )}
                                  </span>
                                </div>
                                <div className="flex shrink-0 items-center gap-1.5">
                                  {(ch.translatedByModel ||
                                    ch.status === 'translated' ||
                                    ch.status === 'edited') && (
                                    <span className="rounded border border-[#8C2D19]/25 bg-[#8C2D19]/8 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#8C2D19]">
                                      {(
                                        ch.translatedByModel ||
                                        modelConfig.selectedModel
                                      ).replace(/^models\//, '')}
                                    </span>
                                  )}
                                  <span
                                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${statusMeta.colorClass}`}
                                  >
                                    {statusMeta.label}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                          {dropdownChapterSlice.items.length === 0 && (
                            <div className="p-6 text-center text-xs text-[#605A52]">
                              Không tìm thấy chương khớp với từ khóa &ldquo;
                              {chapterDropdownQuery}&rdquo;.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => nextChapter && setActiveChapterId(nextChapter.id)}
                    disabled={!nextChapter}
                    className="rounded-lg border border-[#E5DEC9] bg-white p-1.5 text-[#1C1917] shadow-2xs hover:bg-[#F3EFE6] disabled:opacity-35"
                    title={
                      nextChapter
                        ? `Chương tiếp theo: #${nextChapter.orderPrefix} ${
                            nextChapter.titleTranslated || nextChapter.titleRaw
                          }`
                        : 'Đang ở chương cuối cùng'
                    }
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                {/* Right actions for current chapter (matching unified Biên tập bản dịch header) */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {editorStatusToast && (
                    <span className="rounded-md bg-[#1E6F50]/15 px-2.5 py-1 text-xs font-semibold text-[#1E6F50]">
                      {editorStatusToast}
                    </span>
                  )}

                  {/* Status & Model Badges */}
                  <span
                    className={`hidden rounded-md px-2 py-1 text-[11px] font-semibold xl:inline-flex ${
                      STATUS_LABELS[activeChapter.status].colorClass
                    }`}
                  >
                    {STATUS_LABELS[activeChapter.status].label}
                  </span>
                  <span
                    className="hidden items-center gap-1 rounded-md border border-[#E5DEC9] bg-white px-2 py-1 font-mono text-[11px] font-semibold text-[#605A52] 2xl:inline-flex"
                    title={
                      activeChapter.translatedByModel
                        ? `Chương này được dịch bởi: ${activeChapter.translatedByModel}`
                        : `Model đang chọn: ${modelConfig.selectedModel}`
                    }
                  >
                    <Cpu className="h-3 w-3 text-[#8C2D19]" />
                    {activeChapter.translatedByModel || modelConfig.selectedModel}
                  </span>

                  {/* Phóng lớn / Thu nhỏ (Toggles full-width expanded table frame) */}
                  <button
                    onClick={() => setSidebarOpen((prev) => !prev)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#C9B99A] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#1C1917] hover:bg-[#F3EFE6]"
                    title={
                      sidebarOpen
                        ? 'Phóng lớn toàn khung biên tập (ẩn thanh danh sách chương bên trái)'
                        : 'Thu nhỏ (hiện lại danh sách chương bên trái)'
                    }
                  >
                    {sidebarOpen ? (
                      <Maximize2 className="h-3.5 w-3.5 text-[#8C2D19]" />
                    ) : (
                      <Minimize2 className="h-3.5 w-3.5 text-[#8C2D19]" />
                    )}
                    <span className="hidden sm:inline">
                      {sidebarOpen ? 'Phóng lớn' : 'Thu nhỏ'}
                    </span>
                  </button>

                  {/* TXT active download */}
                  <button
                    onClick={handleDownloadActiveChapterTxt}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#C9B99A] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#1C1917] hover:bg-[#F3EFE6]"
                    title="Tải xuống bản dịch tiếng Việt của chương này thành tệp .TXT"
                  >
                    <Download className="h-3.5 w-3.5 text-[#8C2D19]" />
                    <span className="hidden md:inline">TXT active</span>
                  </button>

                  {/* Quick switch to Reader / Edit */}
                  <button
                    onClick={() =>
                      setWorkspaceMode(
                        workspaceMode === 'reader' ? 'editor' : 'reader'
                      )
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-[#C9B99A] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#1C1917] hover:bg-[#F3EFE6]"
                    title={
                      workspaceMode === 'reader'
                        ? 'Quay lại khung Biên tập bản dịch 1:1'
                        : 'Chuyển sang chế độ Đọc chương này'
                    }
                  >
                    {workspaceMode === 'reader' ? (
                      <>
                        <Edit3 className="h-3.5 w-3.5 text-[#8C2D19]" />
                        <span>Biên tập</span>
                      </>
                    ) : (
                      <>
                        <BookOpen className="h-3.5 w-3.5 text-[#8C2D19]" />
                        <span>Đọc</span>
                      </>
                    )}
                  </button>

                  {/* AI biên tập (Targeted Block-ID Cleanup with 1-Click Cancel) */}
                  {aiAssistLoading ? (
                    <button
                      onClick={handleCancelAiAssist}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-300 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                      title="Bấm để HỦY NGAY tác vụ AI Biên tập đang chạy"
                    >
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-red-600" />
                      <span>Đang biên tập... (Hủy)</span>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={handleRunBlockIdCleanup}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#C9B99A] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#1C1917] hover:bg-[#F3EFE6]"
                      title="AI Biên tập & Dọn riêng các Block ID bị sót Hán tự / lọt từ tiếng Anh / thiếu dịch"
                    >
                      <Wand2 className="h-3.5 w-3.5 text-[#8C2D19]" />
                      <span>AI biên tập</span>
                    </button>
                  )}

                  {/* Dịch lại... (Full chapter 1-req structured blocks-v1 translation with 1-Click Cancel) */}
                  {activeChapter.status === 'translating' ? (
                    <button
                      onClick={() => handleCancelSingleChapter(activeChapter.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-300 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                      title="Bấm để HỦY NGAY yêu cầu dịch chương này & khôi phục trạng thái trước đó"
                    >
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-red-600" />
                      <span>Đang dịch... (Hủy)</span>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => translateSingleChapter(activeChapter)}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#C9B99A] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#1C1917] hover:bg-[#F3EFE6]"
                      title="Dịch mới hoặc Dịch lại trọn vẹn chương này (1 Request Structured Output blocks-v1)"
                    >
                      <Sparkles className="h-3.5 w-3.5 text-[#8C2D19]" />
                      <span>Dịch lại...</span>
                    </button>
                  )}

                  {/* Lưu revision */}
                  <button
                    onClick={() => handleSaveEditorChanges()}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#C9B99A] bg-white px-2.5 py-1.5 text-xs font-semibold text-[#1C1917] hover:bg-[#F3EFE6]"
                    title="Lưu bản biên tập hiện tại (Ctrl+S)"
                  >
                    <FileCheck2 className="h-3.5 w-3.5 text-[#1E6F50]" />
                    <span>Lưu revision</span>
                  </button>

                  {/* Duyệt (Approve chapter) */}
                  <button
                    onClick={handleApproveActiveChapter}
                    className="inline-flex items-center gap-1 rounded-lg bg-[#8C2D19] px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-[#722211]"
                    title="Lưu và đánh dấu chương này là Đã duyệt"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Duyệt</span>
                  </button>
                </div>
              </div>

              {/* UNIFIED MODE 1: BIÊN TẬP BẢN DỊCH (1:1 BLOCK-ID TABLE EDITOR WITH PINNED TOOLBAR & AUTO-EXPANDING FRAMES) */}
              {workspaceMode === 'editor' && (
                <div className="flex flex-1 flex-col overflow-hidden bg-[#F4EFE6]/60">
                  {/* 1. PINNED / STATIONARY UNIFIED TOOLBAR & IN-CHAPTER FIND/REPLACE CARD (NEVER SCROLLS AWAY) */}
                  <div className="z-20 shrink-0 border-b border-[#D8CEB8]/80 bg-[#F4EFE6]/95 px-3 pt-2.5 pb-2 backdrop-blur-xs sm:px-5">
                    <div
                      className={`mx-auto ${
                        sidebarOpen ? 'max-w-[1440px]' : 'max-w-none'
                      }`}
                    >
                      <div className="rounded-xl border border-[#D8CEB8] bg-[#FBF8F1] p-3 shadow-xs space-y-2.5">
                        {/* Row 1: Undo, Redo, Copy, Cut, Paste, Khôi phục active, Nhập bản dịch cả chương, AI Co-Editor & Block Filter */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              onClick={handleUndo}
                              disabled={historyPointer <= 0}
                              className="inline-flex items-center gap-1 rounded-lg border border-[#D8CEB8] bg-white px-2.5 py-1 text-xs font-semibold text-[#1C1917] hover:bg-[#F3EFE6] disabled:opacity-40"
                              title="Hoàn tác / Undo (Ctrl+Z)"
                            >
                              <Undo2 className="h-3.5 w-3.5" />
                              Undo
                            </button>
                            <button
                              onClick={handleRedo}
                              disabled={historyPointer >= historyStack.length - 1}
                              className="inline-flex items-center gap-1 rounded-lg border border-[#D8CEB8] bg-white px-2.5 py-1 text-xs font-semibold text-[#1C1917] hover:bg-[#F3EFE6] disabled:opacity-40"
                              title="Làm lại / Redo (Ctrl+Y)"
                            >
                              <Redo2 className="h-3.5 w-3.5" />
                              Redo
                            </button>

                            <button
                              onClick={() => {
                                const { selected } = getEditorSelection();
                                navigator.clipboard.writeText(
                                  selected || editorContent
                                );
                                showToast(
                                  selected
                                    ? `Đã copy văn bản bôi đen trong ${activeFocusedBlockId}!`
                                    : 'Đã copy toàn bộ bản dịch chương!'
                                );
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-[#D8CEB8] bg-white px-2.5 py-1 text-xs font-semibold text-[#1C1917] hover:bg-[#F3EFE6]"
                              title="Copy đoạn bôi đen (hoặc toàn chương)"
                            >
                              <Copy className="h-3.5 w-3.5" />
                              Copy
                            </button>

                            <button
                              onClick={() => {
                                const { selected } = getEditorSelection();
                                if (selected) {
                                  navigator.clipboard.writeText(selected);
                                  replaceEditorSelection('', 'Cut');
                                } else {
                                  showToast('Hãy bôi đen cụm từ cần cắt (Cut) trong ô Block.');
                                }
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-[#D8CEB8] bg-white px-2.5 py-1 text-xs font-semibold text-[#1C1917] hover:bg-[#F3EFE6]"
                              title="Cắt văn bản đang bôi đen trong Block"
                            >
                              <Scissors className="h-3.5 w-3.5" />
                              Cut
                            </button>

                            <button
                              onClick={async () => {
                                try {
                                  const clip = await navigator.clipboard.readText();
                                  if (clip) replaceEditorSelection(clip, 'Paste');
                                } catch {
                                  showToast('Hãy nhấn Ctrl+V để dán văn bản vào ô Block.');
                                }
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-[#D8CEB8] bg-white px-2.5 py-1 text-xs font-semibold text-[#1C1917] hover:bg-[#F3EFE6]"
                              title="Dán từ bộ nhớ tạm vào Block đang chọn"
                            >
                              <ClipboardPaste className="h-3.5 w-3.5" />
                              Paste
                            </button>

                            <button
                              onClick={handleRestoreActiveChapter}
                              className="inline-flex items-center gap-1 rounded-lg border border-[#D8CEB8] bg-white px-2.5 py-1 text-xs font-semibold text-[#1C1917] hover:bg-[#F3EFE6]"
                              title="Khôi phục về bản lưu active gần nhất của chương"
                            >
                              <RotateCcw className="h-3.5 w-3.5 text-[#605A52]" />
                              Khôi phục active
                            </button>

                            <button
                              onClick={() => setIsTranslationImportModalOpen(true)}
                              className="inline-flex items-center gap-1 rounded-lg border border-[#D8CEB8] bg-white px-2.5 py-1 text-xs font-semibold text-[#1C1917] hover:bg-[#F3EFE6]"
                              title="Nhập bản dịch cả chương từ tệp .TXT hoặc dán văn bản với preview ghép đoạn Block ID"
                            >
                              <FileUp className="h-3.5 w-3.5 text-[#8C2D19]" />
                              Nhập bản dịch cả chương
                            </button>

                            <button
                              onClick={handleNormalizeFormatting}
                              className="inline-flex items-center gap-1 rounded-lg border border-[#D8CEB8] bg-white px-2.5 py-1 text-xs font-semibold text-[#1C1917] hover:bg-[#F3EFE6]"
                              title="Chuẩn hóa khoảng trắng và dấu câu cho toàn bộ các Block ID"
                            >
                              Chuẩn hóa câu
                            </button>
                          </div>

                          {/* Right of Row 1: AI Assist on Focused Block + Filter All/Dirty */}
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded bg-[#8C2D19]/12 px-2 py-0.5 font-mono text-[11px] font-bold text-[#8C2D19]">
                              Đang chọn: {activeFocusedBlockId}
                            </span>
                            <button
                              onClick={() => handleRunAiCoEditor('polish')}
                              disabled={aiAssistLoading}
                              className="rounded-lg border border-[#D8CEB8] bg-white px-2 py-1 text-xs font-semibold text-[#1C1917] hover:bg-[#F3EFE6]"
                              title={`Nhờ AI chuốt mượt ${activeFocusedBlockId}`}
                            >
                              Chuốt mượt
                            </button>
                            <button
                              onClick={() => handleRunAiCoEditor('fix_pronouns')}
                              disabled={aiAssistLoading}
                              className="rounded-lg border border-[#D8CEB8] bg-white px-2 py-1 text-xs font-semibold text-[#1C1917] hover:bg-[#F3EFE6]"
                              title={`Đồng bộ đại từ xưng hô cho ${activeFocusedBlockId}`}
                            >
                              Sửa xưng hô
                            </button>
                            <button
                              onClick={() => handleRunAiCoEditor('alternatives')}
                              disabled={aiAssistLoading}
                              className="rounded-lg border border-[#D8CEB8] bg-white px-2 py-1 text-xs font-semibold text-[#1C1917] hover:bg-[#F3EFE6]"
                              title={`Gợi ý 3 phương án diễn đạt khác cho ${activeFocusedBlockId}`}
                            >
                              3 Gợi ý
                            </button>
                            <button
                              onClick={() => setShowCustomAiInput(!showCustomAiInput)}
                              className="rounded-lg border border-[#D8CEB8] bg-white px-2 py-1 text-xs font-semibold text-[#1C1917] hover:bg-[#F3EFE6]"
                            >
                              Lệnh AI...
                            </button>

                             {/* Filter All vs Dirty Blocks */}
                            <div className="flex items-center rounded-lg border border-[#D8CEB8] bg-white p-0.5">
                              <button
                                onClick={() => setBilingualFilterMode('all')}
                                className={`rounded px-2 py-0.5 text-[11px] font-semibold transition ${
                                  bilingualFilterMode === 'all'
                                    ? 'bg-[#8C2D19] text-white'
                                    : 'text-[#605A52] hover:text-[#1C1917]'
                                }`}
                              >
                                Tất cả ({activeChapterBlockPairs.length})
                              </button>
                              <button
                                onClick={() => setBilingualFilterMode('dirty')}
                                className={`rounded px-2 py-0.5 text-[11px] font-semibold transition ${
                                  bilingualFilterMode === 'dirty'
                                    ? 'bg-amber-600 text-white'
                                    : 'text-[#605A52] hover:text-[#1C1917]'
                                }`}
                              >
                                Block lỗi ({dirtyBlocksCount})
                              </button>
                            </div>

                            {!isEditorToolbarExpanded && (
                              <>
                                {activeChapterBlockAnalysis.isBlockCountMatched ? (
                                  <span className="inline-flex items-center gap-1 rounded-md border border-[#1E6F50]/30 bg-[#1E6F50]/10 px-2 py-0.5 font-mono text-[11px] font-bold text-[#1E6F50]">
                                    <CheckCircle2 className="h-3 w-3" />
                                    Khớp 1:1 ({activeChapterBlockAnalysis.translatedBodyBlockCount}/
                                    {activeChapterBlockAnalysis.rawBodyBlockCount})
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 font-mono text-[11px] font-bold text-amber-900">
                                    <AlertTriangle className="h-3 w-3 text-amber-700" />
                                    Lệch: {activeChapterBlockAnalysis.translatedBodyBlockCount}/
                                    {activeChapterBlockAnalysis.rawBodyBlockCount}
                                  </span>
                                )}
                              </>
                            )}

                            {/* Collapse / Expand Editor Find & Replace Rows */}
                            <button
                              type="button"
                              onClick={() =>
                                setIsEditorToolbarExpanded((prev) => !prev)
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-[#C9B99A] bg-[#F3EFE6] px-2 py-1 text-[11px] font-semibold text-[#1C1917] hover:bg-[#E5DEC9]"
                              title={
                                isEditorToolbarExpanded
                                  ? 'Thu gọn khung Tìm kiếm & Thay thế để mở rộng diện tích bảng biên tập'
                                  : 'Mở rộng khung Tìm kiếm & Thay thế trong chương'
                              }
                            >
                              <Search className="h-3 w-3 text-[#8C2D19]" />
                              {isEditorToolbarExpanded ? (
                                <>
                                  <span>Thu gọn</span>
                                  <ChevronUp className="h-3 w-3" />
                                </>
                              ) : (
                                <>
                                  <span>Tìm &amp; Thay</span>
                                  <ChevronDown className="h-3 w-3" />
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        {isEditorToolbarExpanded && (
                          <>
                            {/* Row 2: In-Chapter Find & Replace Inputs + Actions */}
                            <div className="grid grid-cols-1 gap-2 lg:grid-cols-12">
                              {/* Search Input with Match Counter & Up/Down Nav */}
                              <div className="flex items-center rounded-lg border border-[#D8CEB8] bg-white px-2.5 py-1 lg:col-span-5">
                                <Search className="mr-2 h-3.5 w-3.5 shrink-0 text-[#605A52]" />
                                <input
                                  type="text"
                                  placeholder="Tìm trong chương..."
                                  value={inEditorFindQuery}
                                  onChange={(e) => {
                                    setInEditorFindQuery(e.target.value);
                                    setActiveFindMatchIndex(0);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      focusAndHighlightFindMatch(
                                        e.shiftKey
                                          ? activeFindMatchIndex - 1
                                          : activeFindMatchIndex + 1
                                      );
                                    }
                                  }}
                                  className="w-full bg-transparent text-xs text-[#1C1917] focus:outline-hidden"
                                />
                                <span className="mx-2 shrink-0 font-mono text-[11px] font-semibold text-[#605A52]">
                                  {inEditorMatchCount > 0
                                    ? `${Math.min(activeFindMatchIndex + 1, inEditorMatchCount)}/${inEditorMatchCount}`
                                    : '0/0'}
                                </span>
                                <div className="flex items-center gap-0.5">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      focusAndHighlightFindMatch(
                                        activeFindMatchIndex - 1
                                      )
                                    }
                                    disabled={inEditorMatchCount === 0}
                                    className="rounded p-0.5 text-[#605A52] hover:bg-[#F3EFE6] hover:text-[#1C1917] disabled:opacity-35"
                                    title="Vị trí khớp trước đó (Shift+Enter)"
                                  >
                                    <ChevronUp className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      focusAndHighlightFindMatch(
                                        activeFindMatchIndex + 1
                                      )
                                    }
                                    disabled={inEditorMatchCount === 0}
                                    className="rounded p-0.5 text-[#605A52] hover:bg-[#F3EFE6] hover:text-[#1C1917] disabled:opacity-35"
                                    title="Vị trí khớp tiếp theo (Enter)"
                                  >
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>

                              {/* Replace Input + Replace Single / Replace All Buttons */}
                              <div className="flex flex-wrap items-center gap-1.5 lg:col-span-7">
                                <div className="flex min-w-[200px] flex-1 items-center rounded-lg border border-[#D8CEB8] bg-white px-2.5 py-1">
                                  <Replace className="mr-2 h-3.5 w-3.5 shrink-0 text-[#605A52]" />
                                  <input
                                    type="text"
                                    placeholder="Thay bằng..."
                                    value={inEditorReplaceText}
                                    onChange={(e) =>
                                      setInEditorReplaceText(e.target.value)
                                    }
                                    className="w-full bg-transparent text-xs text-[#1C1917] focus:outline-hidden"
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={handleReplaceSingleMatchInChapter}
                                  disabled={inEditorMatchCount === 0}
                                  className="rounded-lg border border-[#D8CEB8] bg-white px-3 py-1.5 text-xs font-semibold text-[#1C1917] hover:bg-[#F3EFE6] disabled:opacity-40"
                                >
                                  Thay vị trí này
                                </button>
                                <button
                                  type="button"
                                  onClick={handleInEditorReplaceAll}
                                  disabled={inEditorMatchCount === 0}
                                  className="rounded-lg border border-[#D8CEB8] bg-white px-3 py-1.5 text-xs font-semibold text-[#1C1917] hover:bg-[#F3EFE6] disabled:opacity-40"
                                >
                                  Thay tất cả trong chương
                                </button>
                              </div>
                            </div>

                            {/* Row 3: Search Options Checkboxes + Alignment Status */}
                            <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 text-xs text-[#605A52]">
                              <div className="flex flex-wrap items-center gap-4">
                                <label className="flex cursor-pointer items-center gap-1.5 select-none">
                                  <input
                                    type="checkbox"
                                    checked={inEditorCaseSensitive}
                                    onChange={(e) =>
                                      setInEditorCaseSensitive(e.target.checked)
                                    }
                                    className="accent-[#8C2D19]"
                                  />
                                  <span>Phân biệt hoa/thường</span>
                                </label>
                                <label className="flex cursor-pointer items-center gap-1.5 select-none">
                                  <input
                                    type="checkbox"
                                    checked={inEditorWholeWord}
                                    onChange={(e) =>
                                      setInEditorWholeWord(e.target.checked)
                                    }
                                    className="accent-[#8C2D19]"
                                  />
                                  <span>Nguyên từ</span>
                                </label>
                                <label className="flex cursor-pointer items-center gap-1.5 select-none">
                                  <input
                                    type="checkbox"
                                    checked={inEditorUseRegex}
                                    onChange={(e) =>
                                      setInEditorUseRegex(e.target.checked)
                                    }
                                    className="accent-[#8C2D19]"
                                  />
                                  <span>Regex</span>
                                </label>
                                <label className="flex cursor-pointer items-center gap-1.5 select-none">
                                  <input
                                    type="checkbox"
                                    checked={inEditorIncludeTitle}
                                    onChange={(e) =>
                                      setInEditorIncludeTitle(e.target.checked)
                                    }
                                    className="accent-[#8C2D19]"
                                  />
                                  <span>Gồm dòng title</span>
                                </label>
                              </div>

                              {/* 1:1 Block Alignment Status Pill */}
                              <div className="flex items-center gap-2">
                                {activeChapterBlockAnalysis.isBlockCountMatched ? (
                                  <span className="inline-flex items-center gap-1 rounded-md border border-[#1E6F50]/30 bg-[#1E6F50]/10 px-2 py-0.5 font-mono text-[11px] font-bold text-[#1E6F50]">
                                    <CheckCircle2 className="h-3 w-3" />
                                    Khớp 1:1 (
                                    {
                                      activeChapterBlockAnalysis.translatedBodyBlockCount
                                    }
                                    /{activeChapterBlockAnalysis.rawBodyBlockCount}{' '}
                                    đoạn)
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 font-mono text-[11px] font-bold text-amber-900">
                                    <AlertTriangle className="h-3 w-3 text-amber-700" />
                                    Lệch đoạn:{' '}
                                    {
                                      activeChapterBlockAnalysis.translatedBodyBlockCount
                                    }{' '}
                                    dịch /{' '}
                                    {activeChapterBlockAnalysis.rawBodyBlockCount}{' '}
                                    gốc
                                  </span>
                                )}
                              </div>
                            </div>
                          </>
                        )}

                        {/* Optional Custom AI Command Bar */}
                        {showCustomAiInput && (
                          <div className="flex items-center gap-2 border-t border-[#E5DEC9] pt-2 text-xs">
                            <span className="font-semibold text-[#8C2D19]">
                              Lệnh AI cho {activeFocusedBlockId}:
                            </span>
                            <input
                              type="text"
                              placeholder="VD: Chuyển đoạn này sang giọng văn cổ phong bi tráng hơn, đổi xưng hô thành Bản tọa - Ngươi..."
                              value={customAiPrompt}
                              onChange={(e) => setCustomAiPrompt(e.target.value)}
                              className="flex-1 rounded-lg border border-[#D8CEB8] bg-white px-3 py-1 text-xs"
                            />
                            <button
                              onClick={() => handleRunAiCoEditor('custom')}
                              disabled={aiAssistLoading || !customAiPrompt.trim()}
                              className="rounded-lg bg-[#8C2D19] px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
                            >
                              Thực thi AI
                            </button>
                          </div>
                        )}

                        {/* Optional 3 AI Alternatives Picker */}
                        {aiAlternatives.length > 0 && (
                          <div className="space-y-2 border-t border-[#E5DEC9] pt-2.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-[#8C2D19]">
                                3 Phương Án Diễn Đạt Từ AI cho {activeFocusedBlockId} (Bấm để áp dụng):
                              </span>
                              <button
                                onClick={() => setAiAlternatives([])}
                                className="text-xs text-[#605A52] hover:text-[#1C1917]"
                              >
                                Đóng
                              </button>
                            </div>
                            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                              {aiAlternatives.map((alt, i) => (
                                <div
                                  key={i}
                                  onClick={() => {
                                    const targetPair = activeChapterBlockPairs.find(
                                      (p) => p.id === activeFocusedBlockId
                                    );
                                    const { selected } = getEditorSelection();
                                    if (selected.trim()) {
                                      replaceEditorSelection(
                                        alt,
                                        `Phương án AI #${i + 1}`
                                      );
                                    } else if (targetPair) {
                                      handleUpdateSingleBlockText(targetPair, alt);
                                    }
                                    setAiAlternatives([]);
                                  }}
                                  className="cursor-pointer rounded-lg border border-[#C9B99A] bg-white p-2.5 text-xs leading-relaxed text-[#1C1917] hover:border-[#8C2D19] hover:bg-[#FBF8F1]"
                                >
                                  <div className="mb-1 font-bold text-[#8C2D19]">
                                    Phương án {i + 1}
                                  </div>
                                  <p className="prose-justify">{alt}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 2. SCROLLABLE 1:1 BLOCK-ID TABLE VIEWPORT */}
                  <div
                    ref={editorScrollContainerRef}
                    className="flex-1 overflow-y-auto px-3 pt-2.5 pb-5 sm:px-5"
                  >
                    <div
                      className={`mx-auto space-y-3 ${
                        sidebarOpen ? 'max-w-[1440px]' : 'max-w-none'
                      }`}
                    >
                      <div className="rounded-xl border border-[#D8CEB8] bg-[#FBF8F1] shadow-2xs">
                        {/* Sticky Table Header Row (原文 · NGUYÊN VĂN THEO ID | 译文 · BẢN NHÁP TƯƠNG ỨNG) */}
                        <div className="sticky top-0 z-10 grid grid-cols-1 rounded-t-xl border-b border-[#D8CEB8] bg-[#F3EFE6] lg:grid-cols-12 lg:divide-x lg:divide-[#D8CEB8]">
                        {/* Left Column Header */}
                        <div className="flex items-center justify-between px-4 py-2.5 lg:col-span-5">
                          <span className="font-mono text-xs font-bold tracking-wide text-[#57534E] uppercase">
                            原文 · NGUYÊN VĂN THEO ID ({activeChapterBlockPairs.length}{' '}
                            block cố định)
                          </span>
                          <button
                            type="button"
                            onClick={() => setIsEditingRawBlocks((prev) => !prev)}
                            className={`rounded-md border px-2.5 py-0.5 text-xs font-semibold transition ${
                              isEditingRawBlocks
                                ? 'border-[#8C2D19] bg-[#8C2D19] text-white'
                                : 'border-[#C9B99A] bg-white text-[#1C1917] hover:bg-[#E5DEC9]/60'
                            }`}
                            title="Bật/tắt chế độ sửa trực tiếp văn bản tiếng Trung gốc theo từng Block ID"
                          >
                            {isEditingRawBlocks ? 'Đang sửa raw' : 'Sửa raw'}
                          </button>
                        </div>

                        {/* Right Column Header */}
                        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 lg:col-span-7">
                          <span className="font-mono text-xs font-bold tracking-wide text-[#57534E] uppercase">
                            译文 · BẢN NHÁP TƯƠNG ỨNG
                          </span>
                          <div className="flex flex-wrap items-center gap-2">
                            {dirtyBlocksCount === 0 &&
                            activeChapterBlockAnalysis.isBlockCountMatched ? (
                              <span className="text-xs font-semibold text-[#1E6F50]">
                                Không phát hiện chữ Hán hoặc &ldquo;But&rdquo;
                              </span>
                            ) : (
                              <>
                                {activeChapter.qaReport &&
                                  activeChapter.qaReport.residualChineseCount > 0 && (
                                    <span className="rounded bg-red-100 px-2 py-0.5 font-mono text-[11px] font-bold text-red-800">
                                      🀄 Sót {activeChapter.qaReport.residualChineseCount} Hán
                                    </span>
                                  )}
                                {activeChapter.qaReport &&
                                  activeChapter.qaReport.leakedEnglishCount > 0 && (
                                    <span className="rounded bg-amber-100 px-2 py-0.5 font-mono text-[11px] font-bold text-amber-900">
                                      🔤 Lọt {activeChapter.qaReport.leakedEnglishCount} Eng
                                    </span>
                                  )}
                                <button
                                  type="button"
                                  onClick={handleRunBlockIdCleanup}
                                  disabled={
                                    aiAssistLoading ||
                                    (dirtyBlocksCount === 0 &&
                                      activeChapterBlockAnalysis.isBlockCountMatched)
                                  }
                                  className="inline-flex items-center gap-1 rounded-md bg-[#1E6F50] px-2.5 py-0.5 text-[11px] font-bold text-white hover:bg-[#16563D] disabled:opacity-45"
                                  title={
                                    !activeChapterBlockAnalysis.isBlockCountMatched
                                      ? 'Chương đang bị lệch đoạn: Gửi toàn bộ chương để AI đối chiếu nguyên tác và căn chỉnh lại khớp 1:1 từng đoạn P0001..Pxxxx'
                                      : 'Gửi riêng các Block ID bị lỗi để AI làm sạch nhanh'
                                  }
                                >
                                  <Wand2 className="h-3 w-3" />
                                  {aiAssistLoading
                                    ? 'Đang xử lý...'
                                    : !activeChapterBlockAnalysis.isBlockCountMatched
                                      ? `AI Căn Lại & Biên Tập Cả Chương (${activeChapterBlockAnalysis.translatedBodyBlockCount}/${activeChapterBlockAnalysis.rawBodyBlockCount})`
                                      : `AI Dọn ${dirtyBlocksCount} Block Lỗi`}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Helper Strip when Block Count Mismatch exists */}
                      {!activeChapterBlockAnalysis.isBlockCountMatched && (
                        <div className="border-b border-amber-300 bg-amber-50/90 px-4 py-2 text-xs text-amber-950">
                          <strong>Mẹo chỉnh lệch đoạn trực tiếp:</strong> Tại dòng{' '}
                          <code className="rounded bg-amber-200/70 px-1 font-mono font-bold">
                            P00XX
                          </code>{' '}
                          bắt đầu lệch so với nguyên văn bên trái: bấm{' '}
                          <strong>[Gộp ↓]</strong> nếu 1 đoạn gốc bị tách đôi; bấm{' '}
                          <strong>[Tách ↵]</strong> (hoặc <kbd>Ctrl+Enter</kbd> tại con trỏ)
                          nếu 2 đoạn gốc bị gộp chung; bấm <strong>[Đẩy ↓]</strong> để chèn ô
                          trống đẩy xuống 1 nhịp, hoặc <strong>[Kéo ↑]</strong> để xóa ô dư
                          kéo lên 1 nhịp.
                        </div>
                      )}

                      {/* Contiguous 1:1 Block Rows (TITLE, P0001, P0002...) */}
                      <div className="divide-y divide-[#E5DEC9]">
                        {activeChapterBlockPairs.map((pair, idxInAll) => {
                          const isDirty =
                            pair.hasChinese ||
                            pair.hasEnglishLeak ||
                            pair.isMissingTranslation;
                          if (bilingualFilterMode === 'dirty' && !isDirty) {
                            return null;
                          }
                          const isTitle = pair.id === 'TITLE';
                          const isFocused = activeFocusedBlockId === pair.id;
                          const isSingleAiBusy = singleBlockLoadingId === pair.id;
                          const hasFindMatchInBlock =
                            Boolean(inEditorFindQuery) &&
                            inChapterBlockMatches.some((m) => m.blockId === pair.id);

                          return (
                            <div
                              key={pair.id}
                              className={`group grid grid-cols-1 transition lg:grid-cols-12 lg:divide-x lg:divide-[#E5DEC9] ${
                                isDirty
                                  ? 'bg-amber-50/45'
                                  : isFocused
                                  ? 'bg-[#FFFDF9]'
                                  : 'bg-[#FBF8F1]/60 hover:bg-[#FBF8F1]'
                              }`}
                            >
                              {/* LEFT COLUMN: Block ID + Raw Chinese Source (5 cols) */}
                              <div className="grid grid-cols-[64px_1fr] items-start gap-2 px-3 py-3 sm:px-4 lg:col-span-5">
                                <div className="flex flex-col items-start gap-1 pt-1 select-none">
                                  <span className="font-mono text-xs font-bold text-[#8C2D19]">
                                    {pair.id}
                                  </span>
                                  {pair.source && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        navigator.clipboard.writeText(pair.source);
                                        showToast(`Đã copy nguyên văn ${pair.id}`);
                                      }}
                                      className="opacity-0 rounded px-1 py-0.5 text-[10px] font-medium text-[#605A52] transition group-hover:opacity-100 hover:bg-[#E5DEC9]/70 hover:text-[#1C1917]"
                                      title="Copy nguyên văn tiếng Trung của Block này"
                                    >
                                      Copy
                                    </button>
                                  )}
                                </div>

                                <div className="min-w-0">
                                  {isEditingRawBlocks ? (
                                    <AutoResizeBlockTextarea
                                      value={pair.source}
                                      minHeight={isTitle ? 34 : 42}
                                      onChange={(e) =>
                                        handleUpdateRawBlockText(pair, e.target.value)
                                      }
                                      placeholder={`Nhập nguyên văn tiếng Trung cho ${pair.id}...`}
                                      className="w-full rounded-md border border-[#C9B99A] bg-white px-2.5 py-1.5 font-serif text-[15px] leading-relaxed text-[#1C1917] focus:border-[#8C2D19] focus:outline-hidden"
                                    />
                                  ) : (
                                    <div
                                      className={`prose-justify font-serif text-[15px] leading-relaxed text-[#292524] select-text ${
                                        isTitle ? 'font-bold text-[#1C1917]' : ''
                                      }`}
                                    >
                                      {pair.source || (
                                        <span className="italic text-amber-800 text-xs">
                                          (Đoạn dịch dư ra so với số đoạn gốc tiếng Trung —
                                          bấm [Gộp ↓] ở đoạn trên hoặc [Kéo ↑] tại đây để
                                          khớp lại 1:1)
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* RIGHT COLUMN: Auto-Expanding 1:1 Vietnamese Block Editor (7 cols) */}
                              <div className="flex flex-col justify-between px-3 py-2.5 sm:px-4 lg:col-span-7">
                                {/* Auto-Expanding Vietnamese Textarea (Zero internal scrollbar, zero manual drag needed) */}
                                <AutoResizeBlockTextarea
                                  textareaRefCallback={(el) => {
                                    blockTextareaRefs.current[pair.id] = el;
                                  }}
                                  value={pair.translation}
                                  minHeight={isTitle ? 36 : 44}
                                  onFocus={() => setActiveFocusedBlockId(pair.id)}
                                  onChange={(e) =>
                                    handleUpdateSingleBlockText(pair, e.target.value)
                                  }
                                  onKeyDown={(e) => {
                                    if (
                                      (e.ctrlKey || e.metaKey) &&
                                      e.key === 'Enter' &&
                                      !isTitle
                                    ) {
                                      e.preventDefault();
                                      handleSplitBlockIntoTwo(pair);
                                    } else if (e.key === 'Enter' && !e.shiftKey) {
                                      e.preventDefault();
                                      showToast(
                                        `Đang khóa khung 1:1 cho ${pair.id}. Nhấn Ctrl+Enter hoặc bấm [Tách ↵] nếu muốn tách thành 2 đoạn.`
                                      );
                                    } else if (
                                      e.key === 'Backspace' &&
                                      e.currentTarget.selectionStart === 0 &&
                                      e.currentTarget.selectionEnd === 0
                                    ) {
                                      // Prevent accidental backspace at start of block from doing anything unexpected
                                      e.preventDefault();
                                    } else {
                                      handleEditorKeyDown(e);
                                    }
                                  }}
                                  onBlur={() =>
                                    handleSaveEditorChanges(
                                      normalizeVietnameseText(editorTitle.trim()),
                                      editorContent,
                                      true
                                    )
                                  }
                                  placeholder={
                                    isTitle
                                      ? 'Nhập tiêu đề chương tiếng Việt (TITLE)...'
                                      : `Nhập bản dịch tiếng Việt cho ${pair.id}...`
                                  }
                                  style={{
                                    fontFamily: isTitle
                                      ? undefined
                                      : readerSettings.fontFamily,
                                    fontSize: isTitle
                                      ? '16px'
                                      : `${readerSettings.fontSize}px`,
                                    lineHeight: readerSettings.lineHeight,
                                    textAlign: isTitle ? 'left' : 'justify',
                                  }}
                                  className={`w-full rounded-lg border px-2.5 py-1.5 text-[#1C1917] transition focus:bg-white focus:outline-hidden ${
                                    isTitle
                                      ? 'font-sans font-bold text-[#8C2D19]'
                                      : 'prose-justify'
                                  } ${
                                    hasFindMatchInBlock
                                      ? 'border-[#8C2D19] bg-amber-50/60 ring-1 ring-[#8C2D19]/30'
                                      : isFocused
                                      ? 'border-[#8C2D19] bg-white shadow-2xs'
                                      : 'border-transparent bg-transparent hover:border-[#E5DEC9] hover:bg-white/60'
                                  }`}
                                />

                                {/* Per-Block Subtle Action & QA Bar (Visible on hover, focus, or when dirty/mismatched) */}
                                <div
                                  className={`mt-1 flex flex-wrap items-center justify-between gap-1.5 text-[11px] transition ${
                                    isDirty ||
                                    isFocused ||
                                    !activeChapterBlockAnalysis.isBlockCountMatched
                                      ? 'opacity-100'
                                      : 'opacity-0 group-hover:opacity-100'
                                  }`}
                                >
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {pair.hasChinese && (
                                      <span className="inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-red-800">
                                        🀄 Sót Hán
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleStripResidualChineseInBlock(pair)
                                          }
                                          className="ml-1 rounded bg-red-700 px-1.5 py-0.2 text-[9px] text-white hover:bg-red-800"
                                          title="Xóa ngay các chữ Hán còn sót trong Block này"
                                        >
                                          Xóa Hán
                                        </button>
                                      </span>
                                    )}
                                    {pair.hasEnglishLeak && (
                                      <span className="rounded bg-amber-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-900">
                                        🔤 Lọt tiếng Anh
                                        {pair.leakedEnglishWords &&
                                        pair.leakedEnglishWords.length > 0
                                          ? `: ${pair.leakedEnglishWords.join(', ')}`
                                          : ''}
                                      </span>
                                    )}
                                    {pair.isMissingTranslation && (
                                      <span className="rounded bg-purple-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-purple-900">
                                        ⚠️ Chưa dịch / Trống
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex flex-wrap items-center gap-1 ml-auto">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleRetranslateSingleBlock(pair, idxInAll)
                                      }
                                      disabled={isSingleAiBusy || !pair.source.trim()}
                                      className="inline-flex items-center gap-1 rounded border border-[#1E6F50]/40 bg-[#1E6F50]/10 px-2 py-0.5 text-[10px] font-bold text-[#1E6F50] hover:bg-[#1E6F50] hover:text-white disabled:opacity-40"
                                      title="Nhờ AI dịch hoặc chuốt lại riêng duy nhất Block ID này"
                                    >
                                      {isSingleAiBusy ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <Sparkles className="h-3 w-3" />
                                      )}
                                      {isSingleAiBusy ? 'Đang dịch...' : 'AI Dịch Block'}
                                    </button>

                                    {!isTitle && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleMergeBlockWithNext(pair.index, pair.id)
                                          }
                                          className="rounded border border-[#E5DEC9] bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#1C1917] hover:border-[#8C2D19] hover:bg-[#8C2D19]/10"
                                          title="Gộp đoạn này với đoạn kế tiếp bên dưới (kéo các đoạn dưới lên 1 nhịp)"
                                        >
                                          Gộp ↓
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleSplitBlockIntoTwo(pair)}
                                          className="rounded border border-[#E5DEC9] bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#1C1917] hover:border-[#8C2D19] hover:bg-[#8C2D19]/10"
                                          title="Tách đoạn này thành 2 đoạn tại con trỏ (đẩy các đoạn dưới xuống 1 nhịp) • Phím tắt: Ctrl+Enter"
                                        >
                                          Tách ↵
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleInsertEmptyBlockAt(pair.index, pair.id)
                                          }
                                          className="rounded border border-[#E5DEC9] bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#605A52] hover:border-[#8C2D19] hover:text-[#1C1917]"
                                          title="Chèn 1 ô trống tại đây để đẩy bản dịch bên dưới xuống 1 nhịp"
                                        >
                                          Đẩy ↓
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            handleDeleteTranslatedBlockAt(
                                              pair.index,
                                              pair.id
                                            )
                                          }
                                          className="rounded border border-[#E5DEC9] bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-red-700 hover:border-red-400 hover:bg-red-50"
                                          title="Xóa ô dịch dư tại đây để kéo các đoạn dưới lên 1 nhịp"
                                        >
                                          Kéo ↑
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </div>

                                {/* Visual QA Highlight Strip when residual Chinese or English leak is inside this block */}
                                {(pair.hasChinese || pair.hasEnglishLeak) &&
                                  pair.translation && (
                                    <div className="mt-1.5 rounded-lg border border-amber-300/80 bg-amber-50/80 px-2.5 py-1 text-xs leading-relaxed text-[#1C1917]">
                                      <span className="mr-1.5 font-mono text-[10px] font-bold text-amber-900">
                                        Vị trí từ lỗi:
                                      </span>
                                      {renderHighlightedParagraph(
                                        pair.translation,
                                        pair.id
                                      )}
                                    </div>
                                  )}
                              </div>
                            </div>
                          );
                        })}
                        </div>
                      </div>

                      {/* Footer Lock Guarantee Note matching reference screenshot */}
                      <p className="px-1 text-xs text-[#605A52]">
                        Xuống dòng hoặc gộp đoạn chỉ tác động bên trong cùng ID. Backspace ở đầu ô không thể nhập sang block trước.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* MODE 3: CLEAN JUSTIFIED READER STUDIO (HEX/RGB Colors, Custom Fonts, 3-Color Highlights + Notes + Bookmark) */}
              {workspaceMode === 'reader' && (
                <div className="flex flex-1 flex-col overflow-hidden">
                  {/* Reader Utility Subbar: Bookmark + 3-Color Highlight Creator + Notes Drawer Toggle */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5DEC9] bg-[#F3EFE6] px-4 py-1.5 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={handleSaveCurrentReadingPosition}
                        className="inline-flex items-center gap-1 rounded-md border border-[#C9B99A] bg-white px-2.5 py-1 font-semibold text-[#1C1917] hover:bg-[#FBF8F1]"
                      >
                        <Bookmark className="h-3.5 w-3.5 text-[#8C2D19]" />
                        Lưu vị trí đọc
                      </button>
                      {savedBookmark && (
                        <button
                          onClick={handleJumpToSavedBookmark}
                          className="inline-flex items-center gap-1 rounded-md bg-[#8C2D19]/15 px-2.5 py-1 font-mono text-[11px] font-bold text-[#8C2D19] hover:bg-[#8C2D19]/25"
                        >
                          Đọc tiếp Chương #{savedBookmark.orderPrefix || 'Đã lưu'} (
                          {savedBookmark.scrollPercentage ??
                            Math.round((savedBookmark.scrollRatio || 0) * 100)}
                          %)
                        </button>
                      )}
                    </div>

                    {/* Selection Highlight Quick Bar */}
                    {pendingHighlightText ? (
                      <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-[#8C2D19] bg-white px-2.5 py-1 shadow-xs">
                        <Highlighter className="h-3.5 w-3.5 text-[#8C2D19]" />
                        <span className="max-w-[180px] truncate italic text-[#1C1917]">
                          &ldquo;{pendingHighlightText}&rdquo;
                        </span>
                        <input
                          type="text"
                          placeholder="Ghi chú (tùy chọn)..."
                          value={pendingHighlightNote}
                          onChange={(e) => setPendingHighlightNote(e.target.value)}
                          className="w-36 rounded border border-[#E5DEC9] px-2 py-0.5 text-xs"
                        />
                        {(Object.keys(HIGHLIGHT_COLOR_STYLES) as HighlightColor[]).map(
                          (color) => (
                            <button
                              key={color}
                              onClick={() => handleCreateReaderHighlight(color)}
                              className={`rounded px-2 py-0.5 text-[11px] font-bold ${HIGHLIGHT_COLOR_STYLES[color].badgeClass}`}
                            >
                              {HIGHLIGHT_COLOR_STYLES[color].label}
                            </button>
                          )
                        )}
                        <button
                          onClick={() => setPendingHighlightText('')}
                          className="text-[#605A52] hover:text-[#1C1917]"
                        >
                          ×
                        </button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-[#605A52]">
                        💡 Bôi đen câu chữ bất kỳ khi đọc để đánh dấu Highlight 3 màu &amp; viết Ghi chú
                      </span>
                    )}

                    <button
                      onClick={() => setShowHighlightsDrawer(!showHighlightsDrawer)}
                      className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 font-semibold ${
                        showHighlightsDrawer
                          ? 'border-[#8C2D19] bg-[#8C2D19] text-white'
                          : 'border-[#C9B99A] bg-white text-[#1C1917]'
                      }`}
                    >
                      <StickyNote className="h-3.5 w-3.5" />
                      Sổ Tay Highlight ({highlights.length})
                    </button>
                  </div>

                  <div className="flex flex-1 overflow-hidden">
                    <div
                      ref={readerScrollContainerRef}
                      style={{
                        backgroundColor: readerSettings.bgHex,
                        color: readerSettings.textHex,
                      }}
                      className="flex-1 overflow-y-auto px-4 py-10 transition-colors sm:px-8"
                    >
                      <article
                        style={{
                          maxWidth: `${readerSettings.maxWidth}px`,
                          fontFamily: readerSettings.fontFamily,
                          fontSize: `${readerSettings.fontSize}px`,
                          lineHeight: readerSettings.lineHeight,
                          textAlign: 'justify',
                        }}
                        className="prose-justify mx-auto"
                      >
                        <header className="mb-8 border-b border-current/15 pb-6 text-center">
                          <p className="font-mono text-xs opacity-65">
                            {activeNovel?.title} • Mã chương #{activeChapter.orderPrefix}
                          </p>
                          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">
                            {normalizeVietnameseText(
                              activeChapter.titleTranslated || activeChapter.titleRaw
                            )}
                          </h1>
                          {activeChapter.titleTranslated && (
                            <p className="mt-1 text-xs opacity-60">
                              {activeChapter.titleRaw}
                            </p>
                          )}
                        </header>

                        {(editorContent || activeChapter.translatedContent).trim() ? (
                          <div>
                            {(editorContent || activeChapter.translatedContent)
                              .split(/\r?\n/)
                              .map((l) => l.trim())
                              .filter(Boolean)
                              .map((para, idx) => {
                                const blockId = `P${String(idx + 1).padStart(4, '0')}`;
                                return (
                                  <p
                                    key={idx}
                                    onMouseUp={() => handleReaderMouseUp(blockId)}
                                    style={{
                                      marginBottom: `${readerSettings.paragraphSpacing}px`,
                                      textAlign: 'justify',
                                    }}
                                    className="prose-justify indent-6"
                                  >
                                    {renderHighlightedParagraph(para, blockId)}
                                  </p>
                                );
                              })}
                          </div>
                        ) : (
                          <div className="rounded-xl border border-current/20 p-8 text-center">
                            <p className="text-base font-semibold">
                              Chương này chưa có bản dịch Tiếng Việt.
                            </p>
                            <button
                              onClick={() => translateSingleChapter(activeChapter)}
                              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#8C2D19] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#722211]"
                            >
                              <Sparkles className="h-4 w-4" />
                              Dịch Trọn Vẹn Chương Này Bằng AI Ngay
                            </button>
                            <div className="mt-8 border-t border-current/15 pt-6 text-left opacity-80">
                              <p className="mb-3 font-mono text-xs uppercase">
                                Nguyên bản tiếng Trung:
                              </p>
                              {activeChapter.rawContent
                                .split(/\r?\n/)
                                .map((l) => l.trim())
                                .filter(Boolean)
                                .map((para, idx) => (
                                  <p
                                    key={idx}
                                    style={{
                                      marginBottom: `${readerSettings.paragraphSpacing}px`,
                                      textAlign: 'justify',
                                    }}
                                    className="prose-justify indent-6"
                                  >
                                    {para}
                                  </p>
                                ))}
                            </div>
                          </div>
                        )}

                        {/* Bottom Chapter Navigation inside Reader */}
                        <footer className="mt-12 flex flex-wrap items-center justify-between gap-2 border-t border-current/15 pt-6">
                          <button
                            onClick={() =>
                              prevChapter && setActiveChapterId(prevChapter.id)
                            }
                            disabled={!prevChapter}
                            className="inline-flex items-center gap-2 rounded-lg border border-current/25 px-4 py-2 text-sm font-semibold hover:bg-current/5 disabled:opacity-30"
                          >
                            <ChevronLeft className="h-4 w-4" />
                            Chương trước
                          </button>

                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              value={activeChapter.id}
                              onChange={(e) => setActiveChapterId(e.target.value)}
                              className="w-[260px] truncate rounded-lg border border-current/25 bg-transparent px-3 py-2 font-sans text-xs font-semibold focus:outline-hidden sm:w-[400px] md:w-[480px]"
                              title="Chọn chương nhanh"
                            >
                              {dropdownChapterSlice.items.map((ch) => (
                                <option
                                  key={ch.id}
                                  value={ch.id}
                                  className="bg-[#FAF6EE] text-[#1C1917]"
                                >
                                  #{ch.orderPrefix} —{' '}
                                  {normalizeVietnameseText(
                                    ch.titleTranslated || ch.titleRaw
                                  )}
                                </option>
                              ))}
                            </select>

                            <button
                              onClick={() => setIsAppearanceModalOpen(true)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-current/25 px-3 py-2 text-xs font-medium hover:bg-current/5"
                            >
                              <Palette className="h-3.5 w-3.5" />
                              Màu &amp; Font
                            </button>
                          </div>

                          <button
                            onClick={() =>
                              nextChapter && setActiveChapterId(nextChapter.id)
                            }
                            disabled={!nextChapter}
                            className="inline-flex items-center gap-2 rounded-lg border border-current/25 px-4 py-2 text-sm font-semibold hover:bg-current/5 disabled:opacity-30"
                          >
                            Chương tiếp
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </footer>
                      </article>
                    </div>

                    {/* Collapsible Reader Highlights & Notes Drawer */}
                    {showHighlightsDrawer && (
                      <aside className="flex w-80 shrink-0 flex-col border-l border-[#E5DEC9] bg-[#FBF8F1] p-4">
                        <div className="flex items-center justify-between border-b border-[#E5DEC9] pb-2.5">
                          <h3 className="text-xs font-bold tracking-wider text-[#1C1917] uppercase">
                            Sổ Tay Highlight &amp; Ghi Chú ({highlights.length})
                          </h3>
                          <button
                            onClick={() => setShowHighlightsDrawer(false)}
                            className="text-xs text-[#605A52] hover:text-[#1C1917]"
                          >
                            Đóng
                          </button>
                        </div>
                        <div className="mt-3 flex-1 space-y-2.5 overflow-y-auto">
                          {highlights.map((hl) => {
                            const chObj = chapters.find((c) => c.id === hl.chapterId);
                            return (
                              <div
                                key={hl.id}
                                onClick={() => setActiveChapterId(hl.chapterId)}
                                className="cursor-pointer rounded-lg border border-[#E5DEC9] bg-white p-3 text-xs hover:border-[#8C2D19]"
                              >
                                <div className="flex items-center justify-between">
                                  <span
                                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${HIGHLIGHT_COLOR_STYLES[hl.color].badgeClass}`}
                                  >
                                    {chObj ? `#${chObj.orderPrefix}` : ''} •{' '}
                                    {hl.blockId || `P${String(hl.paragraphIndex + 1).padStart(4, '0')}`}
                                  </span>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteReaderHighlight(hl.id);
                                    }}
                                    className="text-red-600 hover:underline"
                                  >
                                    Xóa
                                  </button>
                                </div>
                                <p className="mt-1.5 font-serif italic text-[#1C1917]">
                                  &ldquo;{hl.quote || hl.selectedText}&rdquo;
                                </p>
                                {hl.note && (
                                  <p className="mt-1 rounded bg-[#F3EFE6] p-1.5 text-[11px] font-medium text-[#8C2D19]">
                                    📝 {hl.note}
                                  </p>
                                )}
                              </div>
                            );
                          })}
                          {highlights.length === 0 && (
                            <p className="py-8 text-center text-xs text-[#605A52]">
                              Chưa có Highlight nào. Hãy bôi đen một câu trong Trình Đọc để tạo Highlight 3 màu &amp; ghi chú.
                            </p>
                          )}
                        </div>
                      </aside>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
              <BookOpen className="h-12 w-12 text-[#8C2D19]/60" />
              <h2 className="mt-3 font-serif text-xl font-bold text-[#1C1917]">
                Chưa có chương nào được chọn
              </h2>
              <p className="mt-1 max-w-md text-xs text-[#605A52]">
                Hãy chọn một chương ở danh sách bên trái hoặc bấm &quot;Nhập Chương&quot; để tải thư mục .TXT, tệp .EPUB hoặc tách chương bằng Regex.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <button
                  onClick={() => setIsImportModalOpen(true)}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#8C2D19] px-4 py-2 text-xs font-semibold text-white hover:bg-[#722211]"
                >
                  <FolderUp className="h-4 w-4" />
                  Nhập Chương Truyện Ngay
                </button>
                <button
                  onClick={handleOpenLibraryModal}
                  className="inline-flex items-center gap-2 rounded-lg border border-[#C9B99A] bg-white px-4 py-2 text-xs font-semibold text-[#1C1917] hover:bg-[#F3EFE6]"
                >
                  <Library className="h-4 w-4 text-[#8C2D19]" />
                  Mở Thư Viện Truyện ({novels.length} bộ)
                </button>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* MODALS */}
      <NovelLibraryModal
        isOpen={isLibraryModalOpen}
        onClose={() => setIsLibraryModalOpen(false)}
        novels={novels}
        activeNovelId={activeNovelId}
        summaries={liveLibrarySummaries}
        instructions={instructions}
        onSelectNovel={async (novelId) => {
          await handleSelectNovel(novelId);
          const selected = novels.find((n) => n.id === novelId);
          if (selected) {
            showToast(`Đã chuyển sang bộ truyện "${selected.title}"!`);
          }
        }}
        onSelectNovelAndReadBookmark={async (novelId) => {
          await handleSelectNovel(novelId);
          const bm = loadReadingBookmark(novelId);
          if (bm) {
            setActiveChapterId(bm.chapterId);
            setWorkspaceMode('reader');
            setTimeout(() => {
              const container = readerScrollContainerRef.current;
              const ratio =
                bm.scrollRatio ?? (bm.scrollPercentage || 0) / 100;
              if (container && container.scrollHeight > container.clientHeight) {
                container.scrollTo({
                  top: ratio * (container.scrollHeight - container.clientHeight),
                  behavior: 'smooth',
                });
              }
            }, 150);
          }
        }}
        onSelectNovelAndImportChapters={async (novelId) => {
          if (novelId !== activeNovelId) {
            await handleSelectNovel(novelId);
          }
          setIsImportModalOpen(true);
        }}
        onSelectNovelAndExport={async (novelId) => {
          if (novelId !== activeNovelId) {
            await handleSelectNovel(novelId);
          }
          setIsExportModalOpen(true);
        }}
        onSaveNovel={async (targetNovel, isNew) => {
          await saveNovel(targetNovel);
          await refreshLibraryData();
          if (isNew) {
            await handleSelectNovel(targetNovel.id);
          }
        }}
        onDuplicateNovel={async (sourceNovel) => {
          const cloned = await duplicateNovelProject(sourceNovel, true);
          await refreshLibraryData();
          await handleSelectNovel(cloned.id);
        }}
        onDeleteNovel={async (novelId) => {
          await deleteNovelAndData(novelId);
          const remaining = await refreshLibraryData();
          if (remaining.length === 0) {
            setActiveNovelId('');
            saveActiveNovelId('');
            setChapters([]);
            setGlossary([]);
            setHighlights([]);
            setSavedBookmark(null);
            setActiveChapterId(null);
            setSelectedChapterIds(new Set());
          } else if (novelId === activeNovelId) {
            await handleSelectNovel(remaining[0].id);
          }
        }}
        onDeleteAllNovels={async () => {
          await deleteAllNovelsAndData();
          await refreshLibraryData();
          setActiveNovelId('');
          saveActiveNovelId('');
          setChapters([]);
          setGlossary([]);
          setHighlights([]);
          setSavedBookmark(null);
          setActiveChapterId(null);
          setSelectedChapterIds(new Set());
          showToast('Đã xóa toàn bộ truyện trong Thư viện!');
        }}
        onRestoreBackupProject={async (restored) => {
          await saveNovel(restored.novel);
          const scannedRestoredChapters = restored.chapters.map((c) => ({
            ...c,
            qaReport: scanChapterQA(
              c,
              modelConfig.customBannedWords,
              modelConfig.qaRules || DEFAULT_QA_VALIDATION_RULES
            ),
          }));
          await saveChaptersBulk(scannedRestoredChapters);
          await saveGlossaryEntriesBulk(restored.glossary);
          await saveHighlightsBulk(restored.highlights);
          for (const p of restored.instructions) {
            await saveInstructionProfile(p);
          }
          await refreshLibraryData();
          await handleSelectNovel(restored.novel.id);
        }}
      />
      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        novelId={activeNovelId || 'novel-auto'}
        existingChapterCount={chapters.length}
        onImportChapters={async (importedChapters, bookMetadata) => {
          let targetNovelId = activeNovelId;
          if (!targetNovelId || !activeNovel) {
            const now = Date.now();
            targetNovelId = `novel-${now}`;
            const autoCreatedNovel: NovelProject = {
              id: targetNovelId,
              title: bookMetadata?.title?.trim() || 'Truyện Mới Nhập',
              originalTitle: '',
              author: bookMetadata?.author?.trim() || 'Khuyết danh',
              description: '',
              instructionProfileId: DEFAULT_INSTRUCTION_ID,
              editorialProfileId: DEFAULT_EDITORIAL_INSTRUCTION_ID,
              includeGlossary: false,
              createdAt: now,
              updatedAt: now,
            };
            await saveNovel(autoCreatedNovel);
            setActiveNovelId(targetNovelId);
            saveActiveNovelId(targetNovelId);
          } else if (bookMetadata?.title) {
            const updatedNovel: NovelProject = {
              ...activeNovel,
              updatedAt: Date.now(),
            };
            await saveNovel(updatedNovel);
          }

          const scanned = importedChapters.map((c) => {
            const withNovelId: Chapter = {
              ...c,
              id: c.novelId === targetNovelId ? c.id : `ch-${targetNovelId}-${c.orderPrefix}-${Date.now()}`,
              novelId: targetNovelId,
            };
            return {
              ...withNovelId,
              qaReport: scanChapterQA(
                withNovelId,
                modelConfig.customBannedWords,
                modelConfig.qaRules || DEFAULT_QA_VALIDATION_RULES
              ),
            };
          });
          await saveChaptersBulk(scanned);
          await refreshLibraryData();
          const refreshed = await getChaptersByNovel(targetNovelId);
          const refreshedScanned = refreshed.map((c) => ({
            ...c,
            qaReport: scanChapterQA(
              c,
              modelConfig.customBannedWords,
              modelConfig.qaRules || DEFAULT_QA_VALIDATION_RULES
            ),
          }));
          setChapters(refreshedScanned);
          if (scanned.length > 0) {
            setActiveChapterId(scanned[0].id);
          }
          showToast(`Đã nhập thành công ${scanned.length} chương mới!`);
        }}
      />

      {activeChapter && (
        <TranslationImportModal
          isOpen={isTranslationImportModalOpen}
          onClose={() => setIsTranslationImportModalOpen(false)}
          chapter={activeChapter}
          onApplyTranslation={async (titleTranslated, translatedContent, alignment) => {
            pushEditorSnapshot(
              titleTranslated,
              translatedContent,
              'Nhập bản dịch ngoài (.TXT)'
            );
            await handleSaveEditorChanges(
              titleTranslated,
              translatedContent,
              false,
              alignment
            );
          }}
        />
      )}

      <ReaderAppearanceModal
        isOpen={isAppearanceModalOpen}
        onClose={() => setIsAppearanceModalOpen(false)}
        settings={readerSettings}
        customFonts={customFonts}
        onUpdateSettings={(next) => {
          setReaderSettings(next);
          saveReaderSettings(next);
        }}
        onUploadCustomFont={async (file: File) => {
          const dataBase64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
          });
          const cleanName =
            file.name
              .replace(/\.(ttf|otf|woff2|woff)$/i, '')
              .replace(/[^a-zA-Z0-9\s\-_]/g, '')
              .trim() || `CustomFont-${Date.now()}`;
          const fontRecord: CustomFontRecord = {
            id: `font-${Date.now()}`,
            name: cleanName,
            fileName: file.name,
            mimeType: file.type || 'font/ttf',
            dataBase64,
            createdAt: Date.now(),
          };
          try {
            const fontFace = new FontFace(cleanName, `url(${dataBase64})`);
            const loaded = await fontFace.load();
            document.fonts.add(loaded);
          } catch {
            // Ignore FontFace registration error if browser already loaded
          }
          await saveCustomFont(fontRecord);
          setCustomFonts((prev) => [...prev, fontRecord]);
          const nextSettings: ReaderSettings = {
            ...readerSettings,
            fontFamily: `"${cleanName}", serif`,
          };
          setReaderSettings(nextSettings);
          saveReaderSettings(nextSettings);
        }}
        onDeleteCustomFont={async (fontId) => {
          await deleteCustomFont(fontId);
          setCustomFonts((prev) => prev.filter((f) => f.id !== fontId));
        }}
      />

      <InstructionsGlossaryModal
        isOpen={isInstructionsModalOpen}
        onClose={() => setIsInstructionsModalOpen(false)}
        initialTab={instructionsModalTab}
        instructions={instructions}
        activeInstructionId={
          activeNovel?.instructionProfileId || DEFAULT_INSTRUCTION_ID
        }
        activeEditorialId={
          activeNovel?.editorialProfileId || DEFAULT_EDITORIAL_INSTRUCTION_ID
        }
        includeGlossaryForNovel={shouldSendGlossary}
        onToggleIncludeGlossaryForNovel={handleToggleNovelGlossary}
        onSelectInstruction={async (profileId) => {
          if (!activeNovel) return;
          const updatedNovel: NovelProject = {
            ...activeNovel,
            instructionProfileId: profileId,
            updatedAt: Date.now(),
          };
          await saveNovel(updatedNovel);
          setNovels((prev) =>
            prev.map((n) => (n.id === updatedNovel.id ? updatedNovel : n))
          );
        }}
        onSelectEditorialInstruction={async (editorialId) => {
          if (!activeNovel) return;
          const updatedNovel: NovelProject = {
            ...activeNovel,
            editorialProfileId: editorialId,
            updatedAt: Date.now(),
          };
          await saveNovel(updatedNovel);
          setNovels((prev) =>
            prev.map((n) => (n.id === updatedNovel.id ? updatedNovel : n))
          );
        }}
        onSaveInstruction={async (profile) => {
          await saveInstructionProfile(profile);
          setInstructions((prev) => {
            const exists = prev.some((p) => p.id === profile.id);
            return exists
              ? prev.map((p) => (p.id === profile.id ? profile : p))
              : [...prev, profile];
          });
        }}
        onDeleteInstruction={async (id) => {
          await deleteInstructionProfile(id);
          setInstructions((prev) => prev.filter((p) => p.id !== id));
        }}
        novelId={activeNovelId}
        glossary={glossary}
        onSaveGlossaryBulk={async (entries) => {
          await saveGlossaryEntriesBulk(entries);
          const refreshed = await getGlossaryByNovel(activeNovelId);
          setGlossary(refreshed);
        }}
        onDeleteGlossaryItem={async (id) => {
          await deleteGlossaryEntry(id);
          setGlossary((prev) => prev.filter((g) => g.id !== id));
        }}
        onDeleteGlossaryBulk={async (ids) => {
          await deleteGlossaryEntriesBulk(ids);
          const idSet = new Set(ids);
          setGlossary((prev) => prev.filter((g) => !idSet.has(g.id)));
        }}
        onSyncReplaceInTranslatedChapters={async (oldTerm, newTerm) => {
          const cleanOld = oldTerm.trim();
          const cleanNew = newTerm.trim();
          if (!cleanOld || cleanOld === cleanNew) return 0;
          const escaped = cleanOld.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(escaped, 'g');
          const updatedChapters: Chapter[] = [];

          for (const ch of chapters) {
            if (!ch.translatedContent.trim() && !ch.titleTranslated.trim()) {
              continue;
            }
            const nextTitle = ch.titleTranslated.replace(regex, cleanNew);
            const nextBody = ch.translatedContent.replace(regex, cleanNew);
            if (
              nextTitle !== ch.titleTranslated ||
              nextBody !== ch.translatedContent
            ) {
              const updatedCh: Chapter = {
                ...ch,
                titleTranslated: nextTitle,
                translatedContent: nextBody,
                updatedAt: Date.now(),
              };
              updatedCh.qaReport = scanChapterQA(
                updatedCh,
                modelConfig.customBannedWords,
                modelConfig.qaRules || DEFAULT_QA_VALIDATION_RULES
              );
              updatedChapters.push(updatedCh);
            }
          }

          if (updatedChapters.length > 0) {
            await saveChaptersBulk(updatedChapters);
            const map = new Map(updatedChapters.map((u) => [u.id, u]));
            setChapters((prev) => prev.map((c) => map.get(c.id) || c));
            if (activeChapterId && map.has(activeChapterId)) {
              const cur = map.get(activeChapterId)!;
              setEditorTitle(cur.titleTranslated);
              setEditorContent(cur.translatedContent);
            }
          }
          return updatedChapters.length;
        }}
        chapters={chapters}
        selectedChapterIds={selectedChapterIds}
        activeChapter={activeChapter}
        modelConfig={modelConfig}
        onChangeModelConfig={(next) => {
          setModelConfig(next);
          saveModelConfig(next);
        }}
        onOpenTerminal={() => setIsTerminalOpen(true)}
      />

      <FullTextSearchReplaceModal
        isOpen={isSearchReplaceModalOpen}
        onClose={() => setIsSearchReplaceModalOpen(false)}
        chapters={chapters}
        selectedChapterIds={selectedChapterIds}
        activeChapterId={activeChapterId}
        customBannedWords={modelConfig.customBannedWords}
        qaRules={modelConfig.qaRules || DEFAULT_QA_VALIDATION_RULES}
        glossary={activeNovel?.includeGlossary ? glossary : undefined}
        onJumpToChapter={(chId) => setActiveChapterId(chId)}
        onSelectMatchingChapters={(ids) => {
          setSelectedChapterIds(new Set(ids));
          showToast(`Đã tick chọn ${ids.length} chương khớp từ khóa!`);
        }}
        onUpdateChaptersBulk={async (updatedList) => {
          await saveChaptersBulk(updatedList);
          const map = new Map(updatedList.map((u) => [u.id, u]));
          setChapters((prev) => prev.map((c) => map.get(c.id) || c));
          if (activeChapterId && map.has(activeChapterId)) {
            const cur = map.get(activeChapterId)!;
            setEditorTitle(cur.titleTranslated);
            setEditorContent(cur.translatedContent);
          }
        }}
      />

      {activeNovel && (
        <ExportModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          novel={activeNovel}
          chapters={chapters}
          selectedChapterIds={selectedChapterIds}
          selectedModel={modelConfig.selectedModel}
          thinkingLevel={modelConfig.thinkingLevel || DEFAULT_THINKING_LEVEL}
          qaRules={modelConfig.qaRules || DEFAULT_QA_VALIDATION_RULES}
          glossary={glossary}
          instructions={instructions}
          highlights={highlights}
          customFonts={customFonts}
          readerSettings={readerSettings}
          customBannedWords={modelConfig.customBannedWords}
          onUpdateNovel={async (updatedNovel) => {
            await saveNovel(updatedNovel);
            setNovels((prev) =>
              prev.map((n) => (n.id === updatedNovel.id ? updatedNovel : n))
            );
          }}
          onUpdateChaptersBulk={async (updatedList) => {
            await saveChaptersBulk(updatedList);
            const map = new Map(updatedList.map((u) => [u.id, u]));
            setChapters((prev) => prev.map((c) => map.get(c.id) || c));
            if (activeChapterId && map.has(activeChapterId)) {
              const cur = map.get(activeChapterId)!;
              setEditorTitle(cur.titleTranslated);
            }
          }}
          onRestoreBackupProject={async (restored) => {
            await saveNovel(restored.novel);
            const scannedRestoredChapters = restored.chapters.map((c) => ({
              ...c,
              qaReport: scanChapterQA(
                c,
                modelConfig.customBannedWords,
                modelConfig.qaRules || DEFAULT_QA_VALIDATION_RULES
              ),
            }));
            await saveChaptersBulk(scannedRestoredChapters);
            await saveGlossaryEntriesBulk(restored.glossary);
            await saveHighlightsBulk(restored.highlights);
            for (const p of restored.instructions) {
              await saveInstructionProfile(p);
            }
            for (const f of restored.customFonts || []) {
              await saveCustomFont(f);
            }
            setNovels((prev) => [
              restored.novel,
              ...prev.filter((n) => n.id !== restored.novel.id),
            ]);
            await handleSelectNovel(restored.novel.id);
          }}
        />
      )}

      {/* Create New Novel Modal */}
      {isNewNovelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-[#E5DEC9] bg-[#FBF8F1] p-6 shadow-2xl">
            <h3 className="font-serif text-lg font-bold text-[#1C1917]">
              Tạo Dự Án Truyện Mới
            </h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                  Tên bộ truyện (Tiếng Việt)
                </label>
                <input
                  type="text"
                  placeholder="VD: Đại Phụng Đả Canh Nhân"
                  value={newNovelTitle}
                  onChange={(e) => setNewNovelTitle(e.target.value)}
                  className="w-full rounded-lg border border-[#E5DEC9] bg-white px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                  Tên nguyên tác (Tiếng Trung - Tùy chọn)
                </label>
                <input
                  type="text"
                  placeholder="VD: 大奉打更人"
                  value={newNovelOriginal}
                  onChange={(e) => setNewNovelOriginal(e.target.value)}
                  className="w-full rounded-lg border border-[#E5DEC9] bg-white px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                  Tác giả
                </label>
                <input
                  type="text"
                  placeholder="VD: Mại Báo Tiểu Lang Quân"
                  value={newNovelAuthor}
                  onChange={(e) => setNewNovelAuthor(e.target.value)}
                  className="w-full rounded-lg border border-[#E5DEC9] bg-white px-3 py-2 text-xs"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setIsNewNovelModalOpen(false)}
                className="rounded-lg px-4 py-2 text-xs font-medium text-[#605A52] hover:bg-[#E5DEC9]"
              >
                Hủy
              </button>
              <button
                onClick={handleCreateNovel}
                className="rounded-lg bg-[#8C2D19] px-4 py-2 text-xs font-semibold text-white hover:bg-[#722211]"
              >
                Tạo bộ truyện
              </button>
            </div>
          </div>
        </div>
      )}

      {/* In-App System Terminal & Diagnostic Console */}
      <SystemTerminalDrawer
        isOpen={isTerminalOpen}
        onClose={() => setIsTerminalOpen(false)}
        onOpen={() => setIsTerminalOpen(true)}
      />

      {/* Interactive User Guide Modal */}
      <UserGuideModal
        isOpen={isUserGuideOpen}
        onClose={() => setIsUserGuideOpen(false)}
      />
    </div>
  );
}
