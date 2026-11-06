'use client';

import React, { useMemo, useState } from 'react';
import {
  X,
  Search,
  Replace,
  CheckSquare,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { Chapter, GlossaryEntry, QAValidationRules } from '@/lib/types';
import { scanChapterQA } from '@/lib/qa-scanner';

interface FullTextSearchReplaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  chapters: Chapter[];
  selectedChapterIds: Set<string>;
  activeChapterId: string | null;
  customBannedWords: string[];
  qaRules?: QAValidationRules;
  glossary?: GlossaryEntry[];
  onJumpToChapter: (chapterId: string) => void;
  onSelectMatchingChapters: (chapterIds: string[]) => void;
  onUpdateChaptersBulk: (updated: Chapter[]) => Promise<void>;
}

interface SearchMatchResult {
  chapterId: string;
  orderPrefix: string;
  titleDisplay: string;
  matchCount: number;
  snippets: { lineNumber: number; text: string; field: 'raw' | 'vi' | 'title' }[];
}

export default function FullTextSearchReplaceModal({
  isOpen,
  onClose,
  chapters,
  selectedChapterIds,
  activeChapterId,
  customBannedWords,
  qaRules,
  glossary,
  onJumpToChapter,
  onSelectMatchingChapters,
  onUpdateChaptersBulk,
}: FullTextSearchReplaceModalProps) {
  const [activeTab, setActiveTab] = useState<'search' | 'replace'>('search');

  // Search / Replace common fields
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [targetField, setTargetField] = useState<'vi' | 'raw' | 'both'>('vi');
  const [scope, setScope] = useState<'all' | 'ticked' | 'active'>('all');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [replaceStatus, setReplaceStatus] = useState<string | null>(null);

  const scopedChapters = useMemo(() => {
    if (scope === 'active') {
      return chapters.filter((c) => c.id === activeChapterId);
    }
    if (scope === 'ticked') {
      return chapters.filter((c) => selectedChapterIds.has(c.id));
    }
    return chapters;
  }, [chapters, scope, activeChapterId, selectedChapterIds]);

  const { results, regexError, totalMatches } = useMemo(() => {
    if (!query.trim()) {
      return { results: [] as SearchMatchResult[], regexError: null, totalMatches: 0 };
    }

    let regex: RegExp;
    try {
      const flags = caseSensitive ? 'gu' : 'giu';
      const pattern = useRegex
        ? query
        : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      regex = new RegExp(pattern, flags);
    } catch (err) {
      return {
        results: [] as SearchMatchResult[],
        regexError: (err as Error).message,
        totalMatches: 0,
      };
    }

    const list: SearchMatchResult[] = [];
    let grandTotal = 0;

    for (const ch of scopedChapters) {
      let chapterMatches = 0;
      const snippets: { lineNumber: number; text: string; field: 'raw' | 'vi' | 'title' }[] =
        [];

      const checkLines = (content: string, field: 'raw' | 'vi' | 'title') => {
        const lines = content.split(/\r?\n/);
        lines.forEach((line, idx) => {
          regex.lastIndex = 0;
          const matches = line.match(regex);
          if (matches && matches.length > 0) {
            chapterMatches += matches.length;
            if (snippets.length < 5) {
              snippets.push({
                lineNumber: idx + 1,
                text: line.trim().slice(0, 160),
                field,
              });
            }
          }
        });
      };

      if (targetField === 'vi' || targetField === 'both') {
        if (ch.titleTranslated) checkLines(ch.titleTranslated, 'title');
        if (ch.translatedContent) checkLines(ch.translatedContent, 'vi');
      }
      if (targetField === 'raw' || targetField === 'both') {
        if (ch.titleRaw) checkLines(ch.titleRaw, 'title');
        if (ch.rawContent) checkLines(ch.rawContent, 'raw');
      }

      if (chapterMatches > 0) {
        grandTotal += chapterMatches;
        list.push({
          chapterId: ch.id,
          orderPrefix: ch.orderPrefix,
          titleDisplay: ch.titleTranslated || ch.titleRaw,
          matchCount: chapterMatches,
          snippets,
        });
      }
    }

    return { results: list, regexError: null, totalMatches: grandTotal };
  }, [query, scopedChapters, targetField, caseSensitive, useRegex]);

  if (!isOpen) return null;

  const handleExecuteBulkReplace = async () => {
    if (!query.trim() || regexError) return;
    const flags = caseSensitive ? 'gu' : 'giu';
    const pattern = useRegex
      ? query
      : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(pattern, flags);

    const updatedChapters: Chapter[] = [];
    let modifiedChaptersCount = 0;

    for (const ch of scopedChapters) {
      let changed = false;
      let nextTitleVi = ch.titleTranslated;
      let nextContentVi = ch.translatedContent;
      let nextTitleRaw = ch.titleRaw;
      let nextContentRaw = ch.rawContent;

      if (targetField === 'vi' || targetField === 'both') {
        if (nextTitleVi && regex.test(nextTitleVi)) {
          regex.lastIndex = 0;
          nextTitleVi = nextTitleVi.replace(regex, replacement);
          changed = true;
        }
        regex.lastIndex = 0;
        if (nextContentVi && regex.test(nextContentVi)) {
          regex.lastIndex = 0;
          nextContentVi = nextContentVi.replace(regex, replacement);
          changed = true;
        }
      }

      if (targetField === 'raw' || targetField === 'both') {
        regex.lastIndex = 0;
        if (nextTitleRaw && regex.test(nextTitleRaw)) {
          regex.lastIndex = 0;
          nextTitleRaw = nextTitleRaw.replace(regex, replacement);
          changed = true;
        }
        regex.lastIndex = 0;
        if (nextContentRaw && regex.test(nextContentRaw)) {
          regex.lastIndex = 0;
          nextContentRaw = nextContentRaw.replace(regex, replacement);
          changed = true;
        }
      }

      if (changed) {
        modifiedChaptersCount++;
        const nextStatus =
          ch.status === 'translated' ? 'edited' : ch.status;
        const nextChapter: Chapter = {
          ...ch,
          titleTranslated: nextTitleVi,
          translatedContent: nextContentVi,
          titleRaw: nextTitleRaw,
          rawContent: nextContentRaw,
          status: nextStatus,
          updatedAt: Date.now(),
        };
        nextChapter.qaReport = scanChapterQA(
          nextChapter,
          customBannedWords,
          qaRules,
          glossary
        );
        updatedChapters.push(nextChapter);
      }
    }

    if (updatedChapters.length > 0) {
      await onUpdateChaptersBulk(updatedChapters);
      setReplaceStatus(
        `Đã thay thế thành công trên ${modifiedChaptersCount} chương!`
      );
      setTimeout(() => setReplaceStatus(null), 3500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-[#E5DEC9] bg-[#FBF8F1] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E5DEC9] bg-[#F3EFE6] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#8C2D19] text-white">
              <Search className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold text-[#1C1917]">
                Tìm Kiếm Toàn Văn & Thay Thế Hàng Loạt Chương
              </h2>
              <p className="text-xs text-[#605A52]">
                Tra cứu từ khóa chữ Hán / tiếng Việt xuyên suốt toàn bộ các chương hoặc sửa tên nhân vật đồng loạt
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#605A52] hover:bg-[#E5DEC9]/60"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div className="flex border-b border-[#E5DEC9] bg-[#F3EFE6]/60 px-6">
          <button
            onClick={() => setActiveTab('search')}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold ${
              activeTab === 'search'
                ? 'border-[#8C2D19] text-[#8C2D19]'
                : 'border-transparent text-[#605A52]'
            }`}
          >
            <Search className="h-3.5 w-3.5" />
            Tìm kiếm nội dung xuyên chương
          </button>
          <button
            onClick={() => setActiveTab('replace')}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold ${
              activeTab === 'replace'
                ? 'border-[#8C2D19] text-[#8C2D19]'
                : 'border-transparent text-[#605A52]'
            }`}
          >
            <Replace className="h-3.5 w-3.5" />
            Tìm & Thay thế hàng loạt (Bulk Replace)
          </button>
        </div>

        {/* Controls */}
        <div className="space-y-3 border-b border-[#E5DEC9] bg-white p-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                Từ khóa hoặc biểu thức cần tìm
              </label>
              <input
                type="text"
                placeholder="Nhập cụm từ tiếng Việt, chữ Hán hoặc Regex..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-3 py-2 text-xs text-[#1C1917] focus:border-[#8C2D19] focus:outline-hidden"
              />
            </div>

            {activeTab === 'replace' && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                  Thay thế bằng
                </label>
                <input
                  type="text"
                  placeholder="Nhập cụm từ thay thế..."
                  value={replacement}
                  onChange={(e) => setReplacement(e.target.value)}
                  className="w-full rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-3 py-2 text-xs text-[#1C1917] focus:border-[#8C2D19] focus:outline-hidden"
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-[#605A52]">Phạm vi:</span>
                <select
                  value={scope}
                  onChange={(e) =>
                    setScope(e.target.value as 'all' | 'ticked' | 'active')
                  }
                  className="rounded border border-[#E5DEC9] bg-[#FBF8F1] px-2.5 py-1 text-xs"
                >
                  <option value="all">Toàn bộ truyện ({chapters.length} chương)</option>
                  <option value="ticked">
                    Các chương đang Tick ({selectedChapterIds.size} chương)
                  </option>
                  <option value="active">Chỉ chương đang mở</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-[#605A52]">Vùng văn bản:</span>
                <select
                  value={targetField}
                  onChange={(e) =>
                    setTargetField(e.target.value as 'vi' | 'raw' | 'both')
                  }
                  className="rounded border border-[#E5DEC9] bg-[#FBF8F1] px-2.5 py-1 text-xs"
                >
                  <option value="vi">Bản dịch Tiếng Việt</option>
                  <option value="raw">Nguyên bản Tiếng Trung (Raw)</option>
                  <option value="both">Cả hai (Việt + Trung)</option>
                </select>
              </div>

              <label className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={caseSensitive}
                  onChange={(e) => setCaseSensitive(e.target.checked)}
                  className="accent-[#8C2D19]"
                />
                Phân biệt HOA/thường
              </label>

              <label className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={useRegex}
                  onChange={(e) => setUseRegex(e.target.checked)}
                  className="accent-[#8C2D19]"
                />
                Dùng Regex
              </label>
            </div>

            <div className="flex items-center gap-2">
              {results.length > 0 && (
                <button
                  onClick={() =>
                    onSelectMatchingChapters(results.map((r) => r.chapterId))
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-3 py-1.5 text-xs font-semibold text-[#1C1917] hover:bg-[#F3EFE6]"
                >
                  <CheckSquare className="h-3.5 w-3.5 text-[#8C2D19]" />
                  Tick chọn {results.length} chương có kết quả
                </button>
              )}

              {activeTab === 'replace' && (
                <button
                  onClick={handleExecuteBulkReplace}
                  disabled={results.length === 0 || !!regexError}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#8C2D19] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#722211] disabled:opacity-40"
                >
                  <Replace className="h-3.5 w-3.5" />
                  Thay thế tất cả ({totalMatches} vị trí)
                </button>
              )}
            </div>
          </div>

          {regexError && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="h-4 w-4" />
              Lỗi biểu thức Regex: {regexError}
            </div>
          )}

          {replaceStatus && (
            <div className="flex items-center gap-2 rounded-lg bg-[#1E6F50]/15 px-3 py-2 text-xs font-semibold text-[#1E6F50]">
              <CheckCircle2 className="h-4 w-4" />
              {replaceStatus}
            </div>
          )}
        </div>

        {/* Results list */}
        <div className="flex-1 overflow-y-auto p-5">
          <div className="mb-3 flex items-center justify-between text-xs text-[#605A52]">
            <span>
              Tìm thấy <strong>{totalMatches}</strong> vị trí khớp trên{' '}
              <strong>{results.length}</strong> chương.
            </span>
          </div>

          <div className="space-y-3">
            {results.map((res) => (
              <div
                key={res.chapterId}
                className="rounded-xl border border-[#E5DEC9] bg-white p-3.5 shadow-2xs"
              >
                <div className="flex items-center justify-between gap-2 border-b border-[#E5DEC9]/60 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-[#F3EFE6] px-2 py-0.5 font-mono text-xs font-bold text-[#8C2D19]">
                      {res.orderPrefix}
                    </span>
                    <span className="text-xs font-bold text-[#1C1917]">
                      {res.titleDisplay}
                    </span>
                    <span className="rounded-full bg-[#8C2D19]/10 px-2 py-0.5 font-mono text-[10px] font-bold text-[#8C2D19]">
                      {res.matchCount} kết quả
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      onJumpToChapter(res.chapterId);
                      onClose();
                    }}
                    className="inline-flex items-center gap-1 rounded-md bg-[#F3EFE6] px-2.5 py-1 text-xs font-semibold text-[#8C2D19] hover:bg-[#E5DEC9]"
                  >
                    Mở chương này
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>

                <div className="mt-2 space-y-1.5">
                  {res.snippets.map((s, idx) => (
                    <div
                      key={idx}
                      className="rounded bg-[#FBF8F1] px-2.5 py-1.5 text-xs text-[#44403C]"
                    >
                      <span className="mr-2 font-mono text-[10px] font-semibold text-[#8C2D19]">
                        [{s.field === 'raw' ? 'RAW' : s.field === 'title' ? 'TIÊU ĐỀ' : 'VIỆT'} • Dòng {s.lineNumber}]
                      </span>
                      <span>{s.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {query.trim() && results.length === 0 && !regexError && (
              <div className="rounded-xl border border-dashed border-[#E5DEC9] py-12 text-center text-xs text-[#605A52]">
                Không tìm thấy chương nào chứa từ khóa &quot;{query}&quot;.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
