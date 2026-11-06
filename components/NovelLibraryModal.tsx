'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  Copy,
  Download,
  Edit3,
  FolderUp,
  Image as ImageIcon,
  Library,
  Loader2,
  Plus,
  Search,
  Sparkles,
  Star,
  Trash2,
  Upload,
  X,
  Bookmark,
  Filter,
  ArrowUpDown,
  PieChart,
  ChevronDown,
  ChevronUp,
  FileCheck2,
  Clock,
  AlertTriangle,
  LayoutGrid,
  BarChart3,
} from 'lucide-react';
import {
  Chapter,
  GlossaryEntry,
  InstructionProfile,
  NovelLibrarySummary,
  NovelProject,
  NovelProjectStatus,
  ReaderHighlight,
} from '@/lib/types';
import {
  DEFAULT_EDITORIAL_INSTRUCTION_ID,
  DEFAULT_INSTRUCTION_ID,
  NOVEL_GENRE_OPTIONS,
} from '@/lib/seed-data';
import { parseProjectBackupZipV5 } from '@/lib/file-engine';

interface NovelLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialShowDashboard?: boolean;
  novels: NovelProject[];
  activeNovelId: string;
  summaries: Record<string, NovelLibrarySummary>;
  instructions: InstructionProfile[];
  onSelectNovel: (novelId: string) => Promise<void>;
  onSelectNovelAndReadBookmark: (novelId: string) => Promise<void>;
  onSelectNovelAndImportChapters: (novelId: string) => Promise<void>;
  onSelectNovelAndExport: (novelId: string) => Promise<void>;
  onSaveNovel: (novel: NovelProject, isNew: boolean) => Promise<void>;
  onDuplicateNovel: (novel: NovelProject) => Promise<void>;
  onDeleteNovel: (novelId: string) => Promise<void>;
  onDeleteAllNovels?: () => Promise<void>;
  onRestoreBackupProject: (restored: {
    novel: NovelProject;
    chapters: Chapter[];
    glossary: GlossaryEntry[];
    instructions: InstructionProfile[];
    highlights: ReaderHighlight[];
  }) => Promise<void>;
}

const STATUS_META: Record<
  NovelProjectStatus,
  { label: string; badgeClass: string }
> = {
  ongoing: {
    label: 'Đang dịch',
    badgeClass: 'bg-[#1E6F50]/15 text-[#1E6F50] border-[#1E6F50]/30',
  },
  completed: {
    label: 'Hoàn thành',
    badgeClass: 'bg-sky-600/15 text-sky-800 border-sky-600/30',
  },
  paused: {
    label: 'Tạm dừng',
    badgeClass: 'bg-amber-500/15 text-amber-900 border-amber-500/30',
  },
};

type ProgressSegmentKey = 'all' | 'untranslated' | 'translated_only' | 'edited';

export default function NovelLibraryModal({
  isOpen,
  onClose,
  initialShowDashboard = true,
  novels,
  activeNovelId,
  summaries,
  instructions,
  onSelectNovel,
  onSelectNovelAndReadBookmark,
  onSelectNovelAndImportChapters,
  onSelectNovelAndExport,
  onSaveNovel,
  onDuplicateNovel,
  onDeleteNovel,
  onDeleteAllNovels,
  onRestoreBackupProject,
}: NovelLibraryModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'pinned' | NovelProjectStatus
  >('all');
  const [genreFilter, setGenreFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<
    'recent' | 'progress_desc' | 'chapters_desc' | 'title_asc'
  >('recent');

  // Progress Dashboard State
  const [isDashboardExpanded, setIsDashboardExpanded] = useState(
    initialShowDashboard
  );
  const [prevModalOpenKey, setPrevModalOpenKey] = useState(
    `${isOpen}:${initialShowDashboard}`
  );
  const currentModalOpenKey = `${isOpen}:${initialShowDashboard}`;
  if (currentModalOpenKey !== prevModalOpenKey) {
    setPrevModalOpenKey(currentModalOpenKey);
    if (isOpen) {
      setIsDashboardExpanded(initialShowDashboard);
    }
  }
  const [activeSegmentFilter, setActiveSegmentFilter] =
    useState<ProgressSegmentKey>('all');
  const [hoveredSegment, setHoveredSegment] =
    useState<ProgressSegmentKey | null>(null);
  const [chartStyle, setChartStyle] = useState<'donut' | 'pie'>('donut');
  const [viewMode, setViewMode] = useState<'cards' | 'matrix'>('cards');

  // Create / Edit Form Drawer State
  const [editingNovel, setEditingNovel] = useState<NovelProject | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formOriginalTitle, setFormOriginalTitle] = useState('');
  const [formAuthor, setFormAuthor] = useState('');
  const [formGenre, setFormGenre] = useState(NOVEL_GENRE_OPTIONS[0]);
  const [formStatus, setFormStatus] = useState<NovelProjectStatus>('ongoing');
  const [formDescription, setFormDescription] = useState('');
  const [formSourceUrl, setFormSourceUrl] = useState('');
  const [formPinned, setFormPinned] = useState(false);
  const [formInstructionId, setFormInstructionId] = useState(
    DEFAULT_INSTRUCTION_ID
  );
  const [formEditorialId, setFormEditorialId] = useState(
    DEFAULT_EDITORIAL_INSTRUCTION_ID
  );
  const [formIncludeGlossary, setFormIncludeGlossary] = useState(false);
  const [formCoverBase64, setFormCoverBase64] = useState<string | undefined>(
    undefined
  );
  const [formCoverMime, setFormCoverMime] = useState<string | undefined>(
    undefined
  );
  const [formCoverFileName, setFormCoverFileName] = useState<
    string | undefined
  >(undefined);

  // Inline Delete Confirmation State (avoids window.confirm)
  const [confirmDeleteNovelId, setConfirmDeleteNovelId] = useState<
    string | null
  >(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const backupZipInputRef = useRef<HTMLInputElement | null>(null);

  const translationPresets = useMemo(
    () => instructions.filter((i) => (i.role || 'translation') === 'translation'),
    [instructions]
  );
  const editorialPresets = useMemo(
    () => instructions.filter((i) => i.role === 'editorial'),
    [instructions]
  );

  // Aggregate Library-wide Metrics (Including Chưa dịch, Đã dịch, Đã duyệt)
  const libraryTotals = useMemo(() => {
    let totalChapters = 0;
    let totalTranslated = 0; // includes both 'translated' and 'edited'
    let totalEdited = 0; // 'edited' (Đã duyệt)
    let totalTranslatedOnly = 0; // 'translated' (Đã dịch • Chưa duyệt)
    let totalUntranslated = 0; // 'raw' + 'error' + 'queued' + 'translating' (Chưa dịch)
    let totalErrors = 0;
    let totalRawChars = 0;
    let totalTranslatedWords = 0;
    let totalGlossary = 0;
    let fullyCompletedNovels = 0;

    for (const n of novels) {
      const s = summaries[n.id];
      if (!s) continue;
      const chTotal = s.totalChapters || 0;
      const chEdited = Math.min(chTotal, s.editedChapters || 0);
      const chTransAll = Math.min(chTotal, Math.max(chEdited, s.translatedChapters || 0));
      const chTransOnly = Math.max(0, chTransAll - chEdited);
      const chUntranslated = Math.max(0, chTotal - chTransAll);

      totalChapters += chTotal;
      totalTranslated += chTransAll;
      totalEdited += chEdited;
      totalTranslatedOnly += chTransOnly;
      totalUntranslated += chUntranslated;
      totalErrors += s.errorChapters || 0;
      totalRawChars += s.totalRawChars || 0;
      totalTranslatedWords += s.totalTranslatedWords || 0;
      totalGlossary += s.glossaryCount || 0;

      if (chTotal > 0 && chTransAll === chTotal) {
        fullyCompletedNovels++;
      }
    }

    const safeTotal = totalChapters > 0 ? totalChapters : 1;
    const editedPct =
      totalChapters > 0 ? (totalEdited / safeTotal) * 100 : 0;
    const translatedOnlyPct =
      totalChapters > 0 ? (totalTranslatedOnly / safeTotal) * 100 : 0;
    const untranslatedPct =
      totalChapters > 0
        ? Math.max(0, 100 - editedPct - translatedOnlyPct)
        : 0;
    const overallDonePct =
      totalChapters > 0 ? (totalTranslated / safeTotal) * 100 : 0;

    return {
      novelCount: novels.length,
      fullyCompletedNovels,
      totalChapters,
      totalTranslated,
      totalEdited,
      totalTranslatedOnly,
      totalUntranslated,
      totalErrors,
      totalRawChars,
      totalTranslatedWords,
      totalGlossary,
      editedPct,
      translatedOnlyPct,
      untranslatedPct,
      overallDonePct,
    };
  }, [novels, summaries]);

  const filteredNovels = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = novels.filter((n) => {
      if (statusFilter === 'pinned' && !n.pinned) return false;
      if (
        statusFilter !== 'all' &&
        statusFilter !== 'pinned' &&
        (n.status || 'ongoing') !== statusFilter
      ) {
        return false;
      }
      if (genreFilter !== 'all' && (n.genre || NOVEL_GENRE_OPTIONS[0]) !== genreFilter) {
        return false;
      }
      if (activeSegmentFilter !== 'all') {
        const s = summaries[n.id];
        const chTotal = s?.totalChapters || 0;
        const chEdited = s?.editedChapters || 0;
        const chTransOnly = Math.max(0, (s?.translatedChapters || 0) - chEdited);
        const chUntranslated = Math.max(0, chTotal - (s?.translatedChapters || 0));
        if (activeSegmentFilter === 'edited' && chEdited === 0) return false;
        if (activeSegmentFilter === 'translated_only' && chTransOnly === 0) return false;
        if (activeSegmentFilter === 'untranslated' && chUntranslated === 0) return false;
      }
      if (q) {
        const matchTitle = n.title.toLowerCase().includes(q);
        const matchOrig = (n.originalTitle || '').toLowerCase().includes(q);
        const matchAuthor = (n.author || '').toLowerCase().includes(q);
        const matchDesc = (n.description || '').toLowerCase().includes(q);
        if (!matchTitle && !matchOrig && !matchAuthor && !matchDesc) {
          return false;
        }
      }
      return true;
    });

    list.sort((a, b) => {
      if (Boolean(a.pinned) !== Boolean(b.pinned)) {
        return a.pinned ? -1 : 1;
      }
      const sumA = summaries[a.id];
      const sumB = summaries[b.id];
      if (sortBy === 'progress_desc') {
        const pctA =
          sumA && sumA.totalChapters > 0
            ? sumA.translatedChapters / sumA.totalChapters
            : 0;
        const pctB =
          sumB && sumB.totalChapters > 0
            ? sumB.translatedChapters / sumB.totalChapters
            : 0;
        if (pctB !== pctA) return pctB - pctA;
      }
      if (sortBy === 'chapters_desc') {
        const chA = sumA?.totalChapters || 0;
        const chB = sumB?.totalChapters || 0;
        if (chB !== chA) return chB - chA;
      }
      if (sortBy === 'title_asc') {
        return a.title.localeCompare(b.title, 'vi');
      }
      return b.updatedAt - a.updatedAt;
    });

    return list;
  }, [
    novels,
    summaries,
    searchQuery,
    statusFilter,
    genreFilter,
    sortBy,
    activeSegmentFilter,
  ]);

  if (!isOpen) return null;

  const openCreateForm = () => {
    setIsCreatingNew(true);
    setEditingNovel(null);
    setFormTitle('');
    setFormOriginalTitle('');
    setFormAuthor('');
    setFormGenre(NOVEL_GENRE_OPTIONS[0]);
    setFormStatus('ongoing');
    setFormDescription('');
    setFormSourceUrl('');
    setFormPinned(false);
    setFormInstructionId(DEFAULT_INSTRUCTION_ID);
    setFormEditorialId(DEFAULT_EDITORIAL_INSTRUCTION_ID);
    setFormIncludeGlossary(false);
    setFormCoverBase64(undefined);
    setFormCoverMime(undefined);
    setFormCoverFileName(undefined);
  };

  const openEditForm = (novel: NovelProject) => {
    setIsCreatingNew(false);
    setEditingNovel(novel);
    setFormTitle(novel.title);
    setFormOriginalTitle(novel.originalTitle || '');
    setFormAuthor(novel.author || '');
    setFormGenre(novel.genre || NOVEL_GENRE_OPTIONS[0]);
    setFormStatus(novel.status || 'ongoing');
    setFormDescription(novel.description || '');
    setFormSourceUrl(novel.sourceUrl || '');
    setFormPinned(Boolean(novel.pinned));
    setFormInstructionId(novel.instructionProfileId || DEFAULT_INSTRUCTION_ID);
    setFormEditorialId(
      novel.editorialProfileId || DEFAULT_EDITORIAL_INSTRUCTION_ID
    );
    setFormIncludeGlossary(Boolean(novel.includeGlossary));
    setFormCoverBase64(novel.coverDataBase64);
    setFormCoverMime(novel.coverMimeType);
    setFormCoverFileName(novel.coverFileName);
  };

  const closeForm = () => {
    setIsCreatingNew(false);
    setEditingNovel(null);
  };

  const handleCoverUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setFormCoverBase64(String(reader.result || ''));
      setFormCoverMime(file.type || 'image/jpeg');
      setFormCoverFileName(file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) return;
    setIsBusy(true);
    try {
      const now = Date.now();
      const targetNovel: NovelProject = isCreatingNew
        ? {
            id: `novel-${now}`,
            title: formTitle.trim(),
            originalTitle: formOriginalTitle.trim(),
            author: formAuthor.trim() || 'Khuyết danh',
            genre: formGenre,
            status: formStatus,
            pinned: formPinned,
            sourceUrl: formSourceUrl.trim(),
            description: formDescription.trim(),
            instructionProfileId: formInstructionId,
            editorialProfileId: formEditorialId,
            includeGlossary: formIncludeGlossary,
            coverDataBase64: formCoverBase64,
            coverMimeType: formCoverMime,
            coverFileName: formCoverFileName,
            createdAt: now,
            updatedAt: now,
          }
        : {
            ...editingNovel!,
            title: formTitle.trim(),
            originalTitle: formOriginalTitle.trim(),
            author: formAuthor.trim() || 'Khuyết danh',
            genre: formGenre,
            status: formStatus,
            pinned: formPinned,
            sourceUrl: formSourceUrl.trim(),
            description: formDescription.trim(),
            instructionProfileId: formInstructionId,
            editorialProfileId: formEditorialId,
            includeGlossary: formIncludeGlossary,
            coverDataBase64: formCoverBase64,
            coverMimeType: formCoverMime,
            coverFileName: formCoverFileName,
            updatedAt: now,
          };

      await onSaveNovel(targetNovel, isCreatingNew);
      setStatusMessage(
        isCreatingNew
          ? `Đã tạo bộ truyện "${targetNovel.title}" thành công!`
          : `Đã cập nhật thông tin "${targetNovel.title}"!`
      );
      closeForm();
    } finally {
      setIsBusy(false);
    }
  };

  const handleTogglePin = async (novel: NovelProject) => {
    const updated: NovelProject = {
      ...novel,
      pinned: !novel.pinned,
      updatedAt: new Date().getTime(),
    };
    await onSaveNovel(updated, false);
  };

  const handleRestoreZipFile = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsBusy(true);
    setStatusMessage('Đang giải nén gói Backup .ZIP v5 vào Thư viện...');
    try {
      const restored = await parseProjectBackupZipV5(file);
      await onRestoreBackupProject(restored);
      setStatusMessage(
        `Đã khôi phục bộ truyện "${restored.novel.title}" (${restored.chapters.length} chương) vào Thư viện!`
      );
    } catch (err) {
      setStatusMessage(`Lỗi khôi phục .ZIP: ${(err as Error).message}`);
    } finally {
      setIsBusy(false);
      if (backupZipInputRef.current) {
        backupZipInputRef.current.value = '';
      }
    }
  };

  const isFormOpen = isCreatingNew || Boolean(editingNovel);

  // SVG Pie / Donut Chart Math
  const svgSize = 148;
  const center = svgSize / 2;
  const radius = chartStyle === 'donut' ? 54 : 35;
  const strokeWidth = chartStyle === 'donut' ? 20 : 70;
  const circumference = 2 * Math.PI * radius;

  const segments: Array<{
    key: Exclude<ProgressSegmentKey, 'all'>;
    label: string;
    shortLabel: string;
    count: number;
    pct: number;
    color: string;
    bgSoft: string;
    textClass: string;
    borderClass: string;
  }> = [
    {
      key: 'edited',
      label: 'Đã duyệt (Hoàn thiện)',
      shortLabel: 'Đã duyệt',
      count: libraryTotals.totalEdited,
      pct: libraryTotals.editedPct,
      color: '#1D4ED8',
      bgSoft: 'bg-[#1D4ED8]/10',
      textClass: 'text-[#1D4ED8]',
      borderClass: 'border-[#1D4ED8]/30',
    },
    {
      key: 'translated_only',
      label: 'Đã dịch (Chờ duyệt)',
      shortLabel: 'Đã dịch',
      count: libraryTotals.totalTranslatedOnly,
      pct: libraryTotals.translatedOnlyPct,
      color: '#1E6F50',
      bgSoft: 'bg-[#1E6F50]/10',
      textClass: 'text-[#1E6F50]',
      borderClass: 'border-[#1E6F50]/30',
    },
    {
      key: 'untranslated',
      label: 'Chưa dịch (Raw gốc)',
      shortLabel: 'Chưa dịch',
      count: libraryTotals.totalUntranslated,
      pct: libraryTotals.untranslatedPct,
      color: '#D97706',
      bgSoft: 'bg-amber-500/10',
      textClass: 'text-amber-800',
      borderClass: 'border-amber-500/30',
    },
  ];

  let cumulativePercent = 0;
  const chartArcs = segments.map((seg) => {
    const dashLength = (seg.pct / 100) * circumference;
    const dashOffset = -((cumulativePercent / 100) * circumference);
    cumulativePercent += seg.pct;
    return {
      ...seg,
      dashArray: `${Math.max(0, dashLength)} ${circumference}`,
      dashOffset,
    };
  });

  const activeCenterSegment = segments.find(
    (s) =>
      s.key ===
      (hoveredSegment ||
        (activeSegmentFilter !== 'all' ? activeSegmentFilter : null))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 backdrop-blur-xs sm:p-5">
      <div className="flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-[#C9B99A] bg-[#FBF8F1] text-[#1C1917] shadow-2xl">
        {/* TOP HEADER */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#E5DEC9] bg-[#F3EFE6] px-5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#8C2D19] text-white shadow-xs">
              <Library className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate font-serif text-lg font-bold text-[#1C1917] sm:text-xl">
                  Thư Viện Truyện &amp; Tổng Quan Tiến Độ
                </h2>
                <span className="shrink-0 font-mono text-xs font-semibold text-[#8C2D19]">
                  · {libraryTotals.novelCount} bộ ·{' '}
                  {libraryTotals.totalChapters.toLocaleString()} chương
                </span>
              </div>
              <p className="truncate text-xs text-[#605A52]">
                Theo dõi tỷ lệ hoàn thành toàn thư viện (Chưa dịch · Đã dịch · Đã duyệt) và quản lý độc lập từng bộ truyện
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsDashboardExpanded((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition ${
                isDashboardExpanded
                  ? 'border-[#8C2D19] bg-[#8C2D19]/10 text-[#8C2D19]'
                  : 'border-[#C9B99A] bg-white text-[#1C1917] hover:bg-[#F3EFE6]'
              }`}
              title="Ẩn/Hiện Bảng điều khiển biểu đồ tròn tiến độ dịch toàn thư viện"
            >
              <PieChart className="h-3.5 w-3.5 text-[#8C2D19]" />
              <span>Bảng Tiến Độ</span>
              {isDashboardExpanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>

            <input
              ref={backupZipInputRef}
              type="file"
              accept=".zip"
              onChange={handleRestoreZipFile}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => backupZipInputRef.current?.click()}
              disabled={isBusy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#C9B99A] bg-white px-3 py-2 text-xs font-semibold text-[#1C1917] shadow-2xs hover:bg-[#F3EFE6] disabled:opacity-50"
              title="Nhập một bộ truyện từ tệp .ZIP Backup v5 vào Thư viện"
            >
              <Upload className="h-3.5 w-3.5 text-[#8C2D19]" />
              Khôi Phục .ZIP
            </button>

            <button
              type="button"
              onClick={openCreateForm}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#8C2D19] px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#722211]"
            >
              <Plus className="h-4 w-4" />
              Tạo Bộ Truyện Mới
            </button>

            {novels.length > 0 && onDeleteAllNovels && (
              confirmDeleteAll ? (
                <div className="flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-2.5 py-1.5">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={async () => {
                      setIsBusy(true);
                      try {
                        await onDeleteAllNovels();
                        setConfirmDeleteAll(false);
                        setStatusMessage('Đã xóa toàn bộ truyện trong Thư viện.');
                      } finally {
                        setIsBusy(false);
                      }
                    }}
                    className="text-xs font-bold text-red-700 hover:underline disabled:opacity-50"
                  >
                    Xác nhận xóa hết ({novels.length})
                  </button>
                  <span className="text-red-300">|</span>
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteAll(false)}
                    className="text-xs text-[#605A52] hover:underline"
                  >
                    Hủy
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => setConfirmDeleteAll(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50/70 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                  title="Xóa toàn bộ truyện trong Thư viện để làm sạch hoàn toàn"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Xóa Tất Cả
                </button>
              )
            )}

            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-[#605A52] hover:bg-[#E5DEC9]/60 hover:text-[#1C1917]"
              title="Đóng Thư viện"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {statusMessage && (
          <div className="flex shrink-0 items-center justify-between border-b border-[#1E6F50]/30 bg-[#1E6F50]/10 px-5 py-2 text-xs font-semibold text-[#1E6F50]">
            <span className="truncate">{statusMessage}</span>
            <button
              type="button"
              onClick={() => setStatusMessage(null)}
              className="ml-3 shrink-0 text-xs underline"
            >
              Ẩn
            </button>
          </div>
        )}

        {/* MAIN BODY: SHELF LIST OR CREATE/EDIT DRAWER */}
        <div className="flex flex-1 overflow-hidden">
          {/* LEFT / MAIN AREA: STICKY FILTER BAR + SCROLLABLE DASHBOARD & NOVELS */}
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            {/* Search & Filter Toolbar */}
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#E5DEC9] bg-[#F3EFE6]/60 px-5 py-2.5">
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute top-2.5 left-3 h-3.5 w-3.5 text-[#605A52]" />
                <input
                  type="text"
                  placeholder="Tìm bộ truyện theo tên tiếng Việt, chữ Hán, tác giả, mô tả..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-lg border border-[#E5DEC9] bg-white py-1.5 pr-3 pl-8 text-xs text-[#1C1917] focus:border-[#8C2D19] focus:outline-hidden"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* View Switcher: Cards vs Table Matrix */}
                <div className="flex items-center rounded-lg border border-[#E5DEC9] bg-white p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setViewMode('cards')}
                    className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-semibold transition ${
                      viewMode === 'cards'
                        ? 'bg-[#8C2D19] text-white'
                        : 'text-[#605A52] hover:text-[#1C1917]'
                    }`}
                  >
                    <LayoutGrid className="h-3 w-3" />
                    Kệ Sách
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('matrix')}
                    className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-semibold transition ${
                      viewMode === 'matrix'
                        ? 'bg-[#8C2D19] text-white'
                        : 'text-[#605A52] hover:text-[#1C1917]'
                    }`}
                  >
                    <BarChart3 className="h-3 w-3" />
                    Bảng Chi Tiết
                  </button>
                </div>

                {/* Status Filter Pills */}
                <div className="flex items-center rounded-lg border border-[#E5DEC9] bg-white p-0.5 text-[11px]">
                  {[
                    { id: 'all', label: 'Tất cả' },
                    { id: 'pinned', label: '⭐ Đã ghim' },
                    { id: 'ongoing', label: 'Đang dịch' },
                    { id: 'completed', label: 'Hoàn thành' },
                    { id: 'paused', label: 'Tạm dừng' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() =>
                        setStatusFilter(
                          tab.id as 'all' | 'pinned' | NovelProjectStatus
                        )
                      }
                      className={`rounded-md px-2.5 py-1 font-semibold transition ${
                        statusFilter === tab.id
                          ? 'bg-[#8C2D19] text-white'
                          : 'text-[#605A52] hover:text-[#1C1917]'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Genre Filter */}
                <div className="flex items-center gap-1 rounded-lg border border-[#E5DEC9] bg-white px-2.5 py-1 text-xs">
                  <Filter className="h-3.5 w-3.5 text-[#605A52]" />
                  <select
                    value={genreFilter}
                    onChange={(e) => setGenreFilter(e.target.value)}
                    className="bg-transparent text-xs font-medium text-[#1C1917] focus:outline-hidden"
                  >
                    <option value="all">Mọi thể loại</option>
                    {NOVEL_GENRE_OPTIONS.map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sort Select */}
                <div className="flex items-center gap-1 rounded-lg border border-[#E5DEC9] bg-white px-2.5 py-1 text-xs">
                  <ArrowUpDown className="h-3.5 w-3.5 text-[#605A52]" />
                  <select
                    value={sortBy}
                    onChange={(e) =>
                      setSortBy(
                        e.target.value as
                          | 'recent'
                          | 'progress_desc'
                          | 'chapters_desc'
                          | 'title_asc'
                      )
                    }
                    className="bg-transparent text-xs font-medium text-[#1C1917] focus:outline-hidden"
                  >
                    <option value="recent">Sắp xếp: Cập nhật gần nhất</option>
                    <option value="progress_desc">Tiến độ dịch cao → thấp</option>
                    <option value="chapters_desc">Số chương nhiều → ít</option>
                    <option value="title_asc">Tên bộ truyện (A → Z)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Scrollable Content: Progress Dashboard + Novel Grid */}
            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              {/* LIBRARY-WIDE PROGRESS DASHBOARD (PIE / DONUT CHART + BREAKDOWN) */}
              {isDashboardExpanded && (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                  {/* Left 5 Cols: Interactive Pie/Donut Chart + Legend */}
                  <div className="flex min-w-0 flex-col justify-between overflow-hidden rounded-xl border border-[#E5DEC9] bg-[#F3EFE6]/70 p-4 lg:col-span-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-serif text-sm font-bold text-[#1C1917]">
                          Tỷ Lệ Hoàn Thành Toàn Thư Viện
                        </h3>
                        <p className="truncate text-[11px] text-[#605A52]">
                          Bấm vào lát cắt hoặc mục chú giải để lọc truyện
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center rounded-lg border border-[#E5DEC9] bg-white p-0.5 text-[11px]">
                        <button
                          type="button"
                          onClick={() => setChartStyle('donut')}
                          className={`rounded px-2 py-0.5 font-semibold transition ${
                            chartStyle === 'donut'
                              ? 'bg-[#8C2D19] text-white'
                              : 'text-[#605A52] hover:text-[#1C1917]'
                          }`}
                        >
                          Vòng
                        </button>
                        <button
                          type="button"
                          onClick={() => setChartStyle('pie')}
                          className={`rounded px-2 py-0.5 font-semibold transition ${
                            chartStyle === 'pie'
                              ? 'bg-[#8C2D19] text-white'
                              : 'text-[#605A52] hover:text-[#1C1917]'
                          }`}
                        >
                          Tròn đặc
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row">
                      {/* SVG Pie / Donut */}
                      <div className="relative flex h-[148px] w-[148px] shrink-0 items-center justify-center">
                        <svg
                          width={svgSize}
                          height={svgSize}
                          viewBox={`0 0 ${svgSize} ${svgSize}`}
                          className="-rotate-90 transform"
                          role="img"
                          aria-label="Biểu đồ tròn tiến độ dịch toàn thư viện"
                        >
                          <circle
                            cx={center}
                            cy={center}
                            r={radius}
                            fill="transparent"
                            stroke="#E5DEC9"
                            strokeWidth={strokeWidth}
                          />

                          {libraryTotals.totalChapters > 0 &&
                            chartArcs.map((arc) => {
                              if (arc.pct <= 0) return null;
                              const isHovered = hoveredSegment === arc.key;
                              const isSelected = activeSegmentFilter === arc.key;
                              return (
                                <circle
                                  key={arc.key}
                                  cx={center}
                                  cy={center}
                                  r={radius}
                                  fill="transparent"
                                  stroke={arc.color}
                                  strokeWidth={
                                    isHovered || isSelected
                                      ? strokeWidth + 3
                                      : strokeWidth
                                  }
                                  strokeDasharray={arc.dashArray}
                                  strokeDashoffset={arc.dashOffset}
                                  className="cursor-pointer transition-all duration-200"
                                  style={{
                                    opacity:
                                      activeSegmentFilter !== 'all' &&
                                      !isSelected
                                        ? 0.35
                                        : 1,
                                  }}
                                  onMouseEnter={() =>
                                    setHoveredSegment(arc.key)
                                  }
                                  onMouseLeave={() => setHoveredSegment(null)}
                                  onClick={() =>
                                    setActiveSegmentFilter((prev) =>
                                      prev === arc.key ? 'all' : arc.key
                                    )
                                  }
                                >
                                  <title>{`${arc.label}: ${arc.count.toLocaleString()} chương (${arc.pct.toFixed(1)}%)`}</title>
                                </circle>
                              );
                            })}
                        </svg>

                        {/* Center Readout constrained inside inner circle */}
                        <div
                          className={`pointer-events-none absolute inset-0 m-auto flex h-[82px] w-[82px] flex-col items-center justify-center overflow-hidden rounded-full px-1 text-center ${
                            chartStyle === 'pie'
                              ? 'border border-[#E5DEC9] bg-[#FBF8F1]/95 shadow-xs'
                              : ''
                          }`}
                        >
                          {activeCenterSegment ? (
                            <>
                              <span className="w-full truncate text-[10px] font-semibold text-[#605A52]">
                                {activeCenterSegment.shortLabel}
                              </span>
                              <span
                                className={`w-full truncate font-mono text-sm font-bold leading-tight ${activeCenterSegment.textClass}`}
                              >
                                {activeCenterSegment.pct.toFixed(1)}%
                              </span>
                              <span className="w-full truncate font-mono text-[10px] text-[#605A52]">
                                {activeCenterSegment.count.toLocaleString()} chg
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="w-full truncate text-[10px] font-semibold text-[#605A52]">
                                Hoàn thành
                              </span>
                              <span className="w-full truncate font-mono text-base font-bold leading-tight text-[#1E6F50]">
                                {libraryTotals.overallDonePct.toFixed(1)}%
                              </span>
                              <span className="w-full truncate font-mono text-[10px] text-[#605A52]">
                                {libraryTotals.totalTranslated.toLocaleString()}/
                                {libraryTotals.totalChapters.toLocaleString()}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Interactive 3-Segment Breakdown Legend (No multi-line overlap) */}
                      <div className="min-w-0 w-full flex-1 space-y-2">
                        {segments.map((seg) => {
                          const isSelected = activeSegmentFilter === seg.key;
                          return (
                            <button
                              key={seg.key}
                              type="button"
                              onMouseEnter={() => setHoveredSegment(seg.key)}
                              onMouseLeave={() => setHoveredSegment(null)}
                              onClick={() =>
                                setActiveSegmentFilter((prev) =>
                                  prev === seg.key ? 'all' : seg.key
                                )
                              }
                              className={`flex w-full min-w-0 items-center justify-between gap-2 overflow-hidden rounded-lg border px-3 py-2 text-left transition ${
                                isSelected
                                  ? `${seg.borderClass} ${seg.bgSoft} ring-1 ring-current`
                                  : 'border-[#E5DEC9] bg-white hover:border-[#C9B99A]'
                              }`}
                            >
                              <div className="flex min-w-0 flex-1 items-center gap-2">
                                <span
                                  className="h-3 w-3 shrink-0 rounded-xs"
                                  style={{ backgroundColor: seg.color }}
                                />
                                <span className="truncate text-xs font-bold text-[#1C1917]">
                                  {seg.shortLabel}
                                </span>
                              </div>
                              <div className="shrink-0 whitespace-nowrap text-right font-mono text-xs">
                                <span className={`font-bold ${seg.textClass}`}>
                                  {seg.pct.toFixed(1)}%
                                </span>
                                <span className="ml-1.5 text-[11px] text-[#605A52]">
                                  ({seg.count.toLocaleString()})
                                </span>
                              </div>
                            </button>
                          );
                        })}

                        {activeSegmentFilter !== 'all' && (
                          <button
                            type="button"
                            onClick={() => setActiveSegmentFilter('all')}
                            className="w-full truncate pt-0.5 text-center text-[11px] font-semibold text-[#8C2D19] hover:underline"
                          >
                            Bỏ lọc theo biểu đồ (Hiện tất cả)
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right 7 Cols: Key Metrics + Per-Novel Progress Comparison */}
                  <div className="flex min-w-0 flex-col justify-between overflow-hidden rounded-xl border border-[#E5DEC9] bg-[#F3EFE6]/70 p-4 lg:col-span-7">
                    {/* 4 Top Stat Boxes — Stacked lines so numbers never collide */}
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                      <div className="min-w-0 overflow-hidden rounded-lg border border-[#E5DEC9] bg-white p-2.5">
                        <div className="flex items-center justify-between gap-1 text-[11px] text-[#605A52]">
                          <span className="truncate font-medium">Đã duyệt</span>
                          <FileCheck2 className="h-3.5 w-3.5 shrink-0 text-[#1D4ED8]" />
                        </div>
                        <p className="mt-1 truncate font-mono text-base font-bold text-[#1D4ED8]">
                          {libraryTotals.totalEdited.toLocaleString()} chương
                        </p>
                        <p className="truncate font-mono text-[11px] text-[#605A52]">
                          Tỷ lệ: {libraryTotals.editedPct.toFixed(1)}%
                        </p>
                      </div>

                      <div className="min-w-0 overflow-hidden rounded-lg border border-[#E5DEC9] bg-white p-2.5">
                        <div className="flex items-center justify-between gap-1 text-[11px] text-[#605A52]">
                          <span className="truncate font-medium">
                            Đã dịch (Chờ duyệt)
                          </span>
                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#1E6F50]" />
                        </div>
                        <p className="mt-1 truncate font-mono text-base font-bold text-[#1E6F50]">
                          {libraryTotals.totalTranslatedOnly.toLocaleString()}{' '}
                          chương
                        </p>
                        <p className="truncate font-mono text-[11px] text-[#605A52]">
                          Tỷ lệ: {libraryTotals.translatedOnlyPct.toFixed(1)}%
                        </p>
                      </div>

                      <div className="min-w-0 overflow-hidden rounded-lg border border-[#E5DEC9] bg-white p-2.5">
                        <div className="flex items-center justify-between gap-1 text-[11px] text-[#605A52]">
                          <span className="truncate font-medium">
                            Chưa dịch (Raw)
                          </span>
                          <Clock className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                        </div>
                        <p className="mt-1 truncate font-mono text-base font-bold text-amber-800">
                          {libraryTotals.totalUntranslated.toLocaleString()}{' '}
                          chương
                        </p>
                        <p className="truncate font-mono text-[11px] text-[#605A52]">
                          Tỷ lệ: {libraryTotals.untranslatedPct.toFixed(1)}%
                        </p>
                      </div>

                      <div className="min-w-0 overflow-hidden rounded-lg border border-[#E5DEC9] bg-white p-2.5">
                        <div className="flex items-center justify-between gap-1 text-[11px] text-[#605A52]">
                          <span className="truncate font-medium">
                            Sản lượng dịch
                          </span>
                          <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#8C2D19]" />
                        </div>
                        <p className="mt-1 truncate font-mono text-base font-bold text-[#1C1917]">
                          {libraryTotals.totalTranslatedWords.toLocaleString()}{' '}
                          từ
                        </p>
                        <p className="truncate font-mono text-[11px] text-[#605A52]">
                          {libraryTotals.totalRawChars.toLocaleString()} chữ Hán
                        </p>
                      </div>
                    </div>

                    {/* Per-Novel Quick Progress Bars */}
                    <div className="mt-3.5 min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <span className="text-xs font-bold text-[#1C1917]">
                          Tiến Độ Từng Bộ Truyện ({novels.length} bộ)
                        </span>
                        <span className="font-mono text-[11px] text-[#605A52]">
                          Hoàn tất 100%: {libraryTotals.fullyCompletedNovels}/
                          {novels.length} bộ ·{' '}
                          {libraryTotals.totalGlossary.toLocaleString()} Glossary
                        </span>
                      </div>

                      <div className="max-h-[148px] space-y-2 overflow-y-auto pr-1">
                        {novels.length === 0 ? (
                          <p className="py-5 text-center text-xs text-[#605A52]">
                            Chưa có bộ truyện nào trong thư viện.
                          </p>
                        ) : (
                          novels.map((n) => {
                            const s = summaries[n.id];
                            const total = s?.totalChapters || 0;
                            const edited = Math.min(
                              total,
                              s?.editedChapters || 0
                            );
                            const transAll = Math.min(
                              total,
                              Math.max(edited, s?.translatedChapters || 0)
                            );
                            const transOnly = Math.max(0, transAll - edited);
                            const raw = Math.max(0, total - transAll);
                            const edPct =
                              total > 0 ? (edited / total) * 100 : 0;
                            const trPct =
                              total > 0 ? (transOnly / total) * 100 : 0;
                            const rwPct =
                              total > 0
                                ? Math.max(0, 100 - edPct - trPct)
                                : 0;
                            const donePct =
                              total > 0
                                ? Math.round((transAll / total) * 100)
                                : 0;

                            return (
                              <div
                                key={n.id}
                                onClick={async () => {
                                  await onSelectNovel(n.id);
                                  onClose();
                                }}
                                className="group cursor-pointer rounded-lg border border-[#E5DEC9] bg-white px-3 py-2 transition hover:border-[#8C2D19]"
                                title="Bấm để mở ngay bộ truyện này"
                              >
                                <div className="flex min-w-0 items-center justify-between gap-2 text-xs">
                                  <span className="min-w-0 flex-1 truncate font-serif font-bold text-[#1C1917] group-hover:text-[#8C2D19]">
                                    {n.pinned ? '⭐ ' : ''}
                                    {n.title}
                                  </span>
                                  <div className="flex shrink-0 items-center gap-2 whitespace-nowrap font-mono text-[11px] text-[#605A52]">
                                    <span>
                                      <strong className="text-[#1D4ED8]">
                                        {edited}
                                      </strong>{' '}
                                      duyệt
                                    </span>
                                    <span>·</span>
                                    <span>
                                      <strong className="text-[#1E6F50]">
                                        {transOnly}
                                      </strong>{' '}
                                      dịch
                                    </span>
                                    <span>·</span>
                                    <span className="text-amber-800">
                                      {raw} raw
                                    </span>
                                    <span className="font-bold text-[#1C1917]">
                                      ({donePct}%)
                                    </span>
                                    {s?.errorChapters ? (
                                      <span className="inline-flex items-center gap-0.5 font-bold text-red-700">
                                        <AlertTriangle className="h-3 w-3" />
                                        {s.errorChapters}
                                      </span>
                                    ) : null}
                                  </div>
                                </div>

                                {/* 3-segment stacked bar */}
                                <div className="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-[#E5DEC9]">
                                  {edPct > 0 && (
                                    <div
                                      className="h-full bg-[#1D4ED8] transition-all"
                                      style={{ width: `${edPct}%` }}
                                      title={`Đã duyệt: ${edited} chương (${edPct.toFixed(1)}%)`}
                                    />
                                  )}
                                  {trPct > 0 && (
                                    <div
                                      className="h-full bg-[#1E6F50] transition-all"
                                      style={{ width: `${trPct}%` }}
                                      title={`Đã dịch (chờ duyệt): ${transOnly} chương (${trPct.toFixed(1)}%)`}
                                    />
                                  )}
                                  {rwPct > 0 && (
                                    <div
                                      className="h-full bg-amber-500/45 transition-all"
                                      style={{ width: `${rwPct}%` }}
                                      title={`Chưa dịch: ${raw} chương (${rwPct.toFixed(1)}%)`}
                                    />
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {filteredNovels.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#C9B99A] bg-[#F3EFE6]/40 py-14 text-center">
                  <Library className="h-10 w-10 text-[#8C2D19]/60" />
                  <p className="mt-3 font-serif text-base font-bold text-[#1C1917]">
                    {novels.length === 0
                      ? 'Thư viện truyện hiện đang trống (0 bộ truyện)'
                      : 'Không tìm thấy bộ truyện nào khớp bộ lọc'}
                  </p>
                  <p className="mt-1 text-xs text-[#605A52]">
                    {novels.length === 0
                      ? 'Bạn có thể tạo một dự án truyện mới hoặc khôi phục từ gói .ZIP Backup v5.'
                      : 'Hãy thử đổi từ khóa tìm kiếm hoặc bấm "Tạo Bộ Truyện Mới" để thêm dự án mới vào kệ sách.'}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={openCreateForm}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#8C2D19] px-4 py-2 text-xs font-semibold text-white hover:bg-[#722211]"
                    >
                      <Plus className="h-4 w-4" />
                      Tạo Bộ Truyện Mới Ngay
                    </button>
                    <button
                      type="button"
                      onClick={() => backupZipInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#C9B99A] bg-white px-4 py-2 text-xs font-semibold text-[#1C1917] hover:bg-[#F3EFE6]"
                    >
                      <Upload className="h-3.5 w-3.5 text-[#8C2D19]" />
                      Khôi Phục Từ .ZIP Backup
                    </button>
                  </div>
                </div>
              ) : viewMode === 'matrix' ? (
                <div className="overflow-x-auto rounded-xl border border-[#E5DEC9] bg-white shadow-2xs">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-[#E5DEC9] bg-[#F3EFE6] text-[11px] font-bold text-[#605A52]">
                        <th className="px-3.5 py-2.5">Bộ truyện</th>
                        <th className="px-3 py-2.5 text-right">Tổng chương</th>
                        <th className="px-3 py-2.5 text-right text-[#1D4ED8]">
                          Đã duyệt
                        </th>
                        <th className="px-3 py-2.5 text-right text-[#1E6F50]">
                          Đã dịch (Chờ duyệt)
                        </th>
                        <th className="px-3 py-2.5 text-right text-amber-800">
                          Chưa dịch
                        </th>
                        <th className="w-48 px-3.5 py-2.5">
                          Tỷ lệ hoàn thành (3 lớp)
                        </th>
                        <th className="px-3 py-2.5 text-right">
                          Chữ Hán / Từ Việt
                        </th>
                        <th className="px-3.5 py-2.5 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E5DEC9]">
                      {filteredNovels.map((novel) => {
                        const isActive = novel.id === activeNovelId;
                        const sum = summaries[novel.id] || {
                          novelId: novel.id,
                          totalChapters: 0,
                          translatedChapters: 0,
                          editedChapters: 0,
                          rawChapters: 0,
                          errorChapters: 0,
                          totalRawChars: 0,
                          totalTranslatedWords: 0,
                          glossaryCount: 0,
                          highlightCount: 0,
                          bookmark: null,
                        };
                        const total = sum.totalChapters || 0;
                        const edited = Math.min(total, sum.editedChapters || 0);
                        const transAll = Math.min(
                          total,
                          Math.max(edited, sum.translatedChapters || 0)
                        );
                        const transOnly = Math.max(0, transAll - edited);
                        const untranslated = Math.max(0, total - transAll);

                        const edPct = total > 0 ? (edited / total) * 100 : 0;
                        const trPct = total > 0 ? (transOnly / total) * 100 : 0;
                        const unPct =
                          total > 0 ? Math.max(0, 100 - edPct - trPct) : 0;
                        const donePct =
                          total > 0 ? Math.round((transAll / total) * 100) : 0;

                        return (
                          <tr
                            key={novel.id}
                            className={`transition hover:bg-[#FBF8F1] ${
                              isActive ? 'bg-[#8C2D19]/[0.04]' : ''
                            }`}
                          >
                            <td className="px-3.5 py-3">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleTogglePin(novel)}
                                  className="text-[#605A52] hover:text-amber-600"
                                  title="Ghim / Bỏ ghim"
                                >
                                  <Star
                                    className={`h-3.5 w-3.5 ${
                                      novel.pinned
                                        ? 'fill-amber-500 text-amber-600'
                                        : ''
                                    }`}
                                  />
                                </button>
                                <div className="min-w-0">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      await onSelectNovel(novel.id);
                                      onClose();
                                    }}
                                    className="font-serif text-sm font-bold text-[#1C1917] hover:text-[#8C2D19]"
                                  >
                                    {novel.title}
                                  </button>
                                  <p className="text-[11px] text-[#605A52]">
                                    {novel.author || 'Khuyết danh'} ·{' '}
                                    {novel.genre || 'Tiên Hiệp'} ·{' '}
                                    {sum.glossaryCount} Glossary
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right font-mono font-bold text-[#1C1917]">
                              {total.toLocaleString()}
                            </td>
                            <td className="px-3 py-3 text-right font-mono">
                              <span className="font-bold text-[#1D4ED8]">
                                {edited.toLocaleString()}
                              </span>{' '}
                              <span className="text-[10px] text-[#605A52]">
                                ({edPct.toFixed(1)}%)
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right font-mono">
                              <span className="font-bold text-[#1E6F50]">
                                {transOnly.toLocaleString()}
                              </span>{' '}
                              <span className="text-[10px] text-[#605A52]">
                                ({trPct.toFixed(1)}%)
                              </span>
                            </td>
                            <td className="px-3 py-3 text-right font-mono">
                              <span className="font-bold text-amber-800">
                                {untranslated.toLocaleString()}
                              </span>{' '}
                              <span className="text-[10px] text-[#605A52]">
                                ({unPct.toFixed(1)}%)
                              </span>
                            </td>
                            <td className="px-3.5 py-3">
                              <div className="flex items-center justify-between font-mono text-[10px] text-[#605A52]">
                                <span>Hoàn thành: {donePct}%</span>
                                {sum.errorChapters > 0 && (
                                  <span className="font-bold text-red-700">
                                    {sum.errorChapters} lỗi
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 flex h-2 w-full overflow-hidden rounded-full bg-[#E5DEC9]">
                                {edPct > 0 && (
                                  <div
                                    className="h-full bg-[#1D4ED8]"
                                    style={{ width: `${edPct}%` }}
                                    title={`Đã duyệt: ${edited} (${edPct.toFixed(1)}%)`}
                                  />
                                )}
                                {trPct > 0 && (
                                  <div
                                    className="h-full bg-[#1E6F50]"
                                    style={{ width: `${trPct}%` }}
                                    title={`Đã dịch chờ duyệt: ${transOnly} (${trPct.toFixed(1)}%)`}
                                  />
                                )}
                                {unPct > 0 && (
                                  <div
                                    className="h-full bg-amber-500/45"
                                    style={{ width: `${unPct}%` }}
                                    title={`Chưa dịch: ${untranslated} (${unPct.toFixed(1)}%)`}
                                  />
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right font-mono text-[11px] text-[#605A52]">
                              <div>{sum.totalRawChars.toLocaleString()} Hán</div>
                              <div>
                                {sum.totalTranslatedWords.toLocaleString()} Việt
                              </div>
                            </td>
                            <td className="px-3.5 py-3 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await onSelectNovel(novel.id);
                                    onClose();
                                  }}
                                  className="rounded-lg bg-[#8C2D19] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#722211]"
                                >
                                  Mở
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openEditForm(novel)}
                                  className="rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-2 py-1 text-xs font-semibold text-[#1C1917] hover:bg-[#E5DEC9]/60"
                                >
                                  Sửa
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div
                  className={`grid gap-4 ${
                    isFormOpen
                      ? 'grid-cols-1 lg:grid-cols-2'
                      : 'grid-cols-1 md:grid-cols-2'
                  }`}
                >
                  {filteredNovels.map((novel) => {
                    const isActive = novel.id === activeNovelId;
                    const sum = summaries[novel.id] || {
                      novelId: novel.id,
                      totalChapters: 0,
                      translatedChapters: 0,
                      editedChapters: 0,
                      rawChapters: 0,
                      errorChapters: 0,
                      totalRawChars: 0,
                      totalTranslatedWords: 0,
                      glossaryCount: 0,
                      highlightCount: 0,
                      bookmark: null,
                    };
                    const total = sum.totalChapters || 0;
                    const editedCount = Math.min(total, sum.editedChapters || 0);
                    const transAllCount = Math.min(
                      total,
                      Math.max(editedCount, sum.translatedChapters || 0)
                    );
                    const translatedOnlyCount = Math.max(
                      0,
                      transAllCount - editedCount
                    );
                    const untranslatedCount = Math.max(0, total - transAllCount);

                    const pct =
                      total > 0 ? Math.round((transAllCount / total) * 100) : 0;
                    const edPct = total > 0 ? (editedCount / total) * 100 : 0;
                    const trPct =
                      total > 0 ? (translatedOnlyCount / total) * 100 : 0;
                    const unPct =
                      total > 0 ? Math.max(0, 100 - edPct - trPct) : 0;

                    const statusObj =
                      STATUS_META[novel.status || 'ongoing'] ||
                      STATUS_META.ongoing;
                    const transPreset = instructions.find(
                      (i) => i.id === novel.instructionProfileId
                    );

                    return (
                      <div
                        key={novel.id}
                        className={`group relative flex flex-col justify-between rounded-xl border p-4 transition shadow-2xs ${
                          isActive
                            ? 'border-[#8C2D19] bg-[#8C2D19]/[0.04] ring-1 ring-[#8C2D19]/40'
                            : 'border-[#E5DEC9] bg-white hover:border-[#C9B99A]'
                        }`}
                      >
                        {/* Top Section: Cover + Metadata */}
                        <div className="flex gap-3.5">
                          {/* Book Cover or Scholarly Spine */}
                          <div
                            onClick={async () => {
                              await onSelectNovel(novel.id);
                              onClose();
                            }}
                            className="relative h-32 w-24 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-[#C9B99A] bg-[#F3EFE6] shadow-xs"
                            title="Bấm để mở bộ truyện này"
                          >
                            {novel.coverDataBase64 ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={novel.coverDataBase64}
                                alt={novel.title}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full flex-col items-center justify-between bg-gradient-to-b from-[#F3EFE6] to-[#E5DEC9] p-2 text-center">
                                <span className="rounded bg-[#8C2D19]/15 px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#8C2D19]">
                                  {(novel.genre || 'Tiên Hiệp').split('/')[0].trim()}
                                </span>
                                <span className="line-clamp-3 font-serif text-xs font-bold leading-snug text-[#1C1917]">
                                  {novel.title}
                                </span>
                                <span className="font-serif text-[10px] text-[#605A52]">
                                  {novel.originalTitle
                                    ? novel.originalTitle.slice(0, 6)
                                    : '墨香阁'}
                                </span>
                              </div>
                            )}
                            {isActive && (
                              <span className="absolute top-1 left-1 rounded bg-[#8C2D19] px-1.5 py-0.5 text-[9px] font-bold text-white shadow-xs">
                                Đang mở
                              </span>
                            )}
                          </div>

                          {/* Novel Info */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-[#605A52]">
                                  <span className="font-bold text-[#8C2D19]">
                                    {statusObj.label}
                                  </span>
                                  <span aria-hidden="true">·</span>
                                  <span>
                                    {novel.genre || 'Tiên Hiệp / Huyền Huyễn'}
                                  </span>
                                  {novel.includeGlossary && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span className="font-bold text-[#1E6F50]">
                                        Glossary: BẬT
                                      </span>
                                    </>
                                  )}
                                </div>

                                <h3
                                  onClick={async () => {
                                    await onSelectNovel(novel.id);
                                    onClose();
                                  }}
                                  className="mt-1 cursor-pointer truncate font-serif text-base font-bold text-[#1C1917] hover:text-[#8C2D19]"
                                >
                                  {novel.title}
                                </h3>
                                <p className="truncate text-xs text-[#605A52]">
                                  {novel.originalTitle ? (
                                    <span className="font-medium text-[#1C1917]">
                                      {novel.originalTitle}
                                    </span>
                                  ) : null}
                                  {novel.originalTitle && novel.author
                                    ? ' · '
                                    : ''}
                                  <span>{novel.author || 'Khuyết danh'}</span>
                                </p>
                              </div>

                              {/* Pin Button */}
                              <button
                                type="button"
                                onClick={() => handleTogglePin(novel)}
                                className={`rounded-md p-1.5 transition ${
                                  novel.pinned
                                    ? 'bg-amber-400/25 text-amber-800'
                                    : 'text-[#605A52]/60 hover:bg-[#F3EFE6] hover:text-[#1C1917]'
                                }`}
                                title={
                                  novel.pinned
                                    ? 'Bỏ ghim khỏi đầu kệ'
                                    : 'Ghim bộ truyện này lên đầu kệ'
                                }
                              >
                                <Star
                                  className={`h-4 w-4 ${
                                    novel.pinned ? 'fill-amber-500 text-amber-600' : ''
                                  }`}
                                />
                              </button>
                            </div>

                            {novel.description ? (
                              <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-[#605A52]">
                                {novel.description}
                              </p>
                            ) : (
                              <p className="mt-1.5 italic text-[11px] text-[#605A52]/70">
                                Chưa có mô tả tóm tắt.
                              </p>
                            )}

                            {/* Active Preset Tag */}
                            {transPreset && (
                              <div className="mt-2 flex items-center gap-1 truncate text-[11px] text-[#605A52]">
                                <Sparkles className="h-3 w-3 shrink-0 text-[#8C2D19]" />
                                <span className="truncate">
                                  Preset: <strong>{transPreset.name}</strong>
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Middle Section: 3-Layer Progress Bar & Statistics */}
                        <div className="mt-3.5 rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] p-2.5">
                          <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
                            <span className="font-semibold text-[#1C1917]">
                              Hoàn thành:{' '}
                              <strong className="font-mono text-[#1E6F50]">
                                {transAllCount}/{total}
                              </strong>{' '}
                              chương ({pct}%)
                            </span>
                            <span className="font-mono text-[11px] text-[#605A52]">
                              <strong className="text-[#1D4ED8]">
                                Duyệt: {editedCount}
                              </strong>{' '}
                              ·{' '}
                              <strong className="text-[#1E6F50]">
                                Dịch: {translatedOnlyCount}
                              </strong>{' '}
                              ·{' '}
                              <span className="text-amber-800">
                                Chưa dịch: {untranslatedCount}
                              </span>
                            </span>
                          </div>

                          <div className="mt-1.5 flex h-2 w-full overflow-hidden rounded-full bg-[#E5DEC9]">
                            {edPct > 0 && (
                              <div
                                className="h-full bg-[#1D4ED8] transition-all"
                                style={{ width: `${edPct}%` }}
                                title={`Đã duyệt: ${editedCount} chương (${edPct.toFixed(1)}%)`}
                              />
                            )}
                            {trPct > 0 && (
                              <div
                                className="h-full bg-[#1E6F50] transition-all"
                                style={{ width: `${trPct}%` }}
                                title={`Đã dịch (chờ duyệt): ${translatedOnlyCount} chương (${trPct.toFixed(1)}%)`}
                              />
                            )}
                            {unPct > 0 && (
                              <div
                                className="h-full bg-amber-500/45 transition-all"
                                style={{ width: `${unPct}%` }}
                                title={`Chưa dịch: ${untranslatedCount} chương (${unPct.toFixed(1)}%)`}
                              />
                            )}
                          </div>

                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#605A52]">
                            <div className="flex flex-wrap items-center gap-2 font-mono">
                              <span>
                                {sum.totalRawChars.toLocaleString()} chữ Hán
                              </span>
                              <span>·</span>
                              <span>
                                {sum.totalTranslatedWords.toLocaleString()} từ Việt
                              </span>
                              <span>·</span>
                              <span>{sum.glossaryCount} Glossary</span>
                            </div>

                            {sum.bookmark && (
                              <button
                                type="button"
                                onClick={async () => {
                                  await onSelectNovelAndReadBookmark(novel.id);
                                  onClose();
                                }}
                                className="inline-flex items-center gap-1 rounded bg-[#8C2D19]/15 px-2 py-0.5 font-mono text-[10px] font-bold text-[#8C2D19] hover:bg-[#8C2D19]/25"
                                title="Mở bộ truyện và nhảy thẳng tới vị trí đang đọc dở"
                              >
                                <Bookmark className="h-3 w-3" />
                                Đọc tiếp #{sum.bookmark.orderPrefix || 'Đã lưu'} (
                                {sum.bookmark.scrollPercentage ??
                                  Math.round((sum.bookmark.scrollRatio || 0) * 100)}
                                %)
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Bottom Section: Action Bar */}
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-1.5 border-t border-[#E5DEC9] pt-2.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={async () => {
                                await onSelectNovel(novel.id);
                                onClose();
                              }}
                              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                                isActive
                                  ? 'bg-[#1E6F50] text-white'
                                  : 'bg-[#8C2D19] text-white hover:bg-[#722211]'
                              }`}
                            >
                              {isActive ? (
                                <>
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Đang Làm Việc
                                </>
                              ) : (
                                <>
                                  <BookOpen className="h-3.5 w-3.5" />
                                  Mở Bộ Này
                                </>
                              )}
                            </button>

                            <button
                              type="button"
                              onClick={async () => {
                                await onSelectNovelAndImportChapters(novel.id);
                                onClose();
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-2.5 py-1.5 text-xs font-semibold text-[#1C1917] hover:bg-[#E5DEC9]/60"
                              title="Chuyển sang bộ truyện này và mở cửa sổ Nhập Chương (.TXT / .EPUB / .ZIP)"
                            >
                              <FolderUp className="h-3.5 w-3.5 text-[#8C2D19]" />
                              Nhập Chương
                            </button>

                            <button
                              type="button"
                              onClick={() => openEditForm(novel)}
                              className="inline-flex items-center gap-1 rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-2.5 py-1.5 text-xs font-semibold text-[#1C1917] hover:bg-[#E5DEC9]/60"
                              title="Chỉnh sửa tên truyện, tác giả, thể loại, ảnh bìa EPUB và Preset mặc định"
                            >
                              <Edit3 className="h-3.5 w-3.5 text-[#8C2D19]" />
                              Sửa &amp; Bìa
                            </button>

                            <button
                              type="button"
                              onClick={async () => {
                                await onSelectNovelAndExport(novel.id);
                                onClose();
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-2.5 py-1.5 text-xs font-semibold text-[#1C1917] hover:bg-[#E5DEC9]/60"
                              title="Đóng gói EPUB 3.3 hoặc xuất gói .ZIP Backup v5 cho bộ truyện này"
                            >
                              <Download className="h-3.5 w-3.5 text-[#8C2D19]" />
                              EPUB / Backup
                            </button>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={async () => {
                                setIsBusy(true);
                                try {
                                  await onDuplicateNovel(novel);
                                  setStatusMessage(
                                    `Đã nhân bản cấu hình & Glossary của "${novel.title}"!`
                                  );
                                } finally {
                                  setIsBusy(false);
                                }
                              }}
                              className="rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] p-1.5 text-[#605A52] hover:bg-[#E5DEC9]/60 hover:text-[#1C1917]"
                              title="Nhân bản bộ truyện (Sao chép cấu hình & bảng Glossary sang bộ mới)"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>

                            {confirmDeleteNovelId === novel.id ? (
                              <div className="flex items-center gap-1 rounded-lg border border-red-300 bg-red-50 px-2 py-1">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    setIsBusy(true);
                                    try {
                                      await onDeleteNovel(novel.id);
                                      setConfirmDeleteNovelId(null);
                                      setStatusMessage(
                                        `Đã xóa bộ truyện "${novel.title}".`
                                      );
                                    } finally {
                                      setIsBusy(false);
                                    }
                                  }}
                                  className="text-[11px] font-bold text-red-700 hover:underline"
                                >
                                  Xác nhận xóa
                                </button>
                                <span className="text-red-300">|</span>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteNovelId(null)}
                                  className="text-[11px] text-[#605A52] hover:underline"
                                >
                                  Hủy
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteNovelId(novel.id)}
                                className="rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] p-1.5 text-red-600 hover:bg-red-50"
                                title="Xóa bộ truyện này cùng toàn bộ chương & Glossary của nó"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT DRAWER: CREATE OR EDIT NOVEL PROJECT */}
          {isFormOpen && (
            <aside className="flex w-full max-w-md shrink-0 flex-col border-l border-[#E5DEC9] bg-[#F3EFE6] overflow-y-auto">
              <div className="flex items-center justify-between border-b border-[#E5DEC9] px-5 py-3.5">
                <h3 className="font-serif text-base font-bold text-[#1C1917]">
                  {isCreatingNew
                    ? 'Tạo Dự Án Truyện Mới'
                    : `Chỉnh Sửa: ${editingNovel?.title}`}
                </h3>
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-lg p-1 text-[#605A52] hover:bg-[#E5DEC9]/60 hover:text-[#1C1917]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleSubmitForm} className="flex-1 space-y-3.5 p-5">
                {/* Cover Image Upload */}
                <div className="flex items-center gap-3.5 rounded-xl border border-[#E5DEC9] bg-[#FBF8F1] p-3">
                  <div className="flex h-24 w-18 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#C9B99A] bg-[#F3EFE6]">
                    {formCoverBase64 ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={formCoverBase64}
                        alt="Cover preview"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="h-6 w-6 text-[#605A52]/50" />
                    )}
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <p className="text-xs font-bold text-[#1C1917]">
                      Ảnh bìa sách &amp; EPUB 3.3
                    </p>
                    <p className="text-[11px] text-[#605A52]">
                      Tự động nhúng vào trang bìa khi đóng gói EPUB 3.3 và lưu trong gói .ZIP Backup.
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        ref={coverInputRef}
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleCoverUpload}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => coverInputRef.current?.click()}
                        className="rounded-lg border border-[#C9B99A] bg-white px-2.5 py-1 text-xs font-semibold text-[#1C1917] hover:bg-[#F3EFE6]"
                      >
                        Chọn ảnh bìa...
                      </button>
                      {formCoverBase64 && (
                        <button
                          type="button"
                          onClick={() => {
                            setFormCoverBase64(undefined);
                            setFormCoverMime(undefined);
                            setFormCoverFileName(undefined);
                          }}
                          className="text-xs font-medium text-red-600 hover:underline"
                        >
                          Xóa bìa
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-[#1C1917]">
                    Tên bộ truyện (Tiếng Việt) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Đại Phụng Đả Canh Nhân"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="w-full rounded-lg border border-[#E5DEC9] bg-white px-3 py-2 text-xs text-[#1C1917] focus:border-[#8C2D19] focus:outline-hidden"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-[#1C1917]">
                      Tên nguyên tác (Chữ Hán)
                    </label>
                    <input
                      type="text"
                      placeholder="VD: 大奉打更人"
                      value={formOriginalTitle}
                      onChange={(e) => setFormOriginalTitle(e.target.value)}
                      className="w-full rounded-lg border border-[#E5DEC9] bg-white px-3 py-2 text-xs text-[#1C1917] focus:border-[#8C2D19] focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-[#1C1917]">
                      Tác giả
                    </label>
                    <input
                      type="text"
                      placeholder="VD: Mại Báo Tiểu Lang Quân"
                      value={formAuthor}
                      onChange={(e) => setFormAuthor(e.target.value)}
                      className="w-full rounded-lg border border-[#E5DEC9] bg-white px-3 py-2 text-xs text-[#1C1917] focus:border-[#8C2D19] focus:outline-hidden"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-[#1C1917]">
                      Thể loại chính
                    </label>
                    <select
                      value={formGenre}
                      onChange={(e) => setFormGenre(e.target.value)}
                      className="w-full rounded-lg border border-[#E5DEC9] bg-white px-2.5 py-2 text-xs text-[#1C1917] focus:border-[#8C2D19] focus:outline-hidden"
                    >
                      {NOVEL_GENRE_OPTIONS.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-[#1C1917]">
                      Trạng thái dự án
                    </label>
                    <select
                      value={formStatus}
                      onChange={(e) =>
                        setFormStatus(e.target.value as NovelProjectStatus)
                      }
                      className="w-full rounded-lg border border-[#E5DEC9] bg-white px-2.5 py-2 text-xs text-[#1C1917] focus:border-[#8C2D19] focus:outline-hidden"
                    >
                      <option value="ongoing">Đang dịch</option>
                      <option value="completed">Đã hoàn thành</option>
                      <option value="paused">Tạm dừng</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-[#1C1917]">
                    Preset Dịch AI Mặc Định Cho Bộ Này
                  </label>
                  <select
                    value={formInstructionId}
                    onChange={(e) => setFormInstructionId(e.target.value)}
                    className="w-full rounded-lg border border-[#E5DEC9] bg-white px-2.5 py-2 text-xs text-[#1C1917] focus:border-[#8C2D19] focus:outline-hidden"
                  >
                    {translationPresets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-[#1C1917]">
                    Preset Biên Tập AI Mặc Định Cho Bộ Này
                  </label>
                  <select
                    value={formEditorialId}
                    onChange={(e) => setFormEditorialId(e.target.value)}
                    className="w-full rounded-lg border border-[#E5DEC9] bg-white px-2.5 py-2 text-xs text-[#1C1917] focus:border-[#8C2D19] focus:outline-hidden"
                  >
                    {editorialPresets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-[#1C1917]">
                    Mô tả / Văn án tóm tắt
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Tóm tắt cốt truyện, ghi chú hệ thống cảnh giới hoặc lưu ý xưng hô cho bộ truyện này..."
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="w-full rounded-lg border border-[#E5DEC9] bg-white px-3 py-2 text-xs text-[#1C1917] focus:border-[#8C2D19] focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-bold text-[#1C1917]">
                    Nguồn Raw / Ghi chú liên kết (Tùy chọn)
                  </label>
                  <input
                    type="text"
                    placeholder="VD: Qidian / 69shuba / Thư mục local..."
                    value={formSourceUrl}
                    onChange={(e) => setFormSourceUrl(e.target.value)}
                    className="w-full rounded-lg border border-[#E5DEC9] bg-white px-3 py-2 text-xs text-[#1C1917] focus:border-[#8C2D19] focus:outline-hidden"
                  />
                </div>

                <div className="space-y-2 rounded-xl border border-[#E5DEC9] bg-[#FBF8F1] p-3 text-xs">
                  <label className="flex cursor-pointer items-center justify-between">
                    <span className="font-semibold text-[#1C1917]">
                      ⭐ Ghim bộ truyện lên đầu Thư viện
                    </span>
                    <input
                      type="checkbox"
                      checked={formPinned}
                      onChange={(e) => setFormPinned(e.target.checked)}
                      className="h-4 w-4 accent-[#8C2D19]"
                    />
                  </label>
                  <label className="flex cursor-pointer items-center justify-between border-t border-[#E5DEC9] pt-2">
                    <div>
                      <span className="font-semibold text-[#1C1917]">
                        Bật gửi kèm bảng Glossary khi Dịch / Biên tập AI
                      </span>
                      <p className="text-[10px] text-[#605A52]">
                        Mặc định TẮT để tiết kiệm token và tránh nhiễu khi chưa cần
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={formIncludeGlossary}
                      onChange={(e) => setFormIncludeGlossary(e.target.checked)}
                      className="h-4 w-4 accent-[#1E6F50]"
                    />
                  </label>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={closeForm}
                    className="rounded-lg px-4 py-2 text-xs font-semibold text-[#605A52] hover:bg-[#E5DEC9]"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={isBusy}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#8C2D19] px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-[#722211] disabled:opacity-50"
                  >
                    {isBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {isCreatingNew ? 'Tạo & Mở Bộ Truyện' : 'Lưu Thay Đổi'}
                  </button>
                </div>
              </form>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
