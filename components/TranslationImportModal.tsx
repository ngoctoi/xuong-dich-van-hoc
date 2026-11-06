'use client';

import React, { useMemo, useRef, useState } from 'react';
import {
  X,
  FileUp,
  CheckCircle2,
  AlertTriangle,
  Columns,
  ClipboardPaste,
  Check,
} from 'lucide-react';
import { Chapter, ChapterAlignment } from '@/lib/types';
import {
  splitRawIntoBlocks,
  splitTranslatedBodyIntoParagraphs,
} from '@/lib/block-engine';
import { decodeSmartTextBuffer } from '@/lib/file-engine';

interface TranslationImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  chapter: Chapter;
  onApplyTranslation: (
    titleTranslated: string,
    translatedContent: string,
    alignment: ChapterAlignment
  ) => void;
}

export default function TranslationImportModal({
  isOpen,
  onClose,
  chapter,
  onApplyTranslation,
}: TranslationImportModalProps) {
  const [rawTextInput, setRawTextInput] = useState('');
  const [splitMode, setSplitMode] = useState<'auto' | 'blank_line' | 'single_line'>('auto');
  const [firstLineIsTitle, setFirstLineIsTitle] = useState(true);
  const [fileNameLoaded, setFileNameLoaded] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const rawBlocks = useMemo(() => {
    return splitRawIntoBlocks(chapter.titleRaw, chapter.rawContent);
  }, [chapter.titleRaw, chapter.rawContent]);

  const rawBodyBlocks = useMemo(
    () => rawBlocks.filter((b) => b.id !== 'TITLE'),
    [rawBlocks]
  );

  const previewResult = useMemo(() => {
    const trimmed = rawTextInput.replace(/\r\n/g, '\n').trim();
    if (!trimmed) {
      return {
        titleTranslated: chapter.titleTranslated || '',
        mappedBodyParagraphs: [] as string[],
        importedBodyCount: 0,
        rawBodyCount: rawBodyBlocks.length,
        missingCount: rawBodyBlocks.length,
        extraCount: 0,
        mergedTailCount: 0,
      };
    }

    const allParagraphs = splitTranslatedBodyIntoParagraphs(
      trimmed,
      undefined,
      splitMode
    );
    let candidateTitle = chapter.titleTranslated || '';
    let bodyList = allParagraphs;

    if (firstLineIsTitle && allParagraphs.length > 0) {
      candidateTitle = allParagraphs[0].trim();
      bodyList = allParagraphs.slice(1);
    }

    const importedBodyCount = bodyList.length;
    const rawBodyCount = rawBodyBlocks.length;
    const mappedBodyParagraphs: string[] = [];
    let mergedTailCount = 0;

    if (rawBodyCount === 0) {
      mappedBodyParagraphs.push(...bodyList);
    } else if (importedBodyCount <= rawBodyCount) {
      for (let i = 0; i < rawBodyCount; i++) {
        mappedBodyParagraphs.push(bodyList[i] || '');
      }
    } else {
      // More imported paragraphs than raw blocks: map 1..(N-1) and merge remaining into last slot so no text is lost
      for (let i = 0; i < rawBodyCount - 1; i++) {
        mappedBodyParagraphs.push(bodyList[i] || '');
      }
      const tailSlice = bodyList.slice(rawBodyCount - 1);
      mergedTailCount = tailSlice.length;
      mappedBodyParagraphs.push(tailSlice.join('\n\n'));
    }

    const missingCount = Math.max(0, rawBodyCount - importedBodyCount);
    const extraCount = Math.max(0, importedBodyCount - rawBodyCount);

    return {
      titleTranslated: candidateTitle,
      mappedBodyParagraphs,
      importedBodyCount,
      rawBodyCount,
      missingCount,
      extraCount,
      mergedTailCount,
    };
  }, [
    rawTextInput,
    splitMode,
    firstLineIsTitle,
    chapter.titleTranslated,
    rawBodyBlocks.length,
  ]);

  if (!isOpen) return null;

  const handleLoadTxtFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const decoded = decodeSmartTextBuffer(buffer);
    setRawTextInput(decoded);
    setFileNameLoaded(file.name);
    e.target.value = '';
  };

  const handlePasteClipboard = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip) {
        setRawTextInput(clip);
        setFileNameLoaded('Bộ nhớ tạm (Clipboard)');
      }
    } catch {
      // Fallback if clipboard permission denied
    }
  };

  const handleConfirmApply = () => {
    const cleanParagraphs = previewResult.mappedBodyParagraphs
      .map((p) => p.trim())
      .filter(Boolean);
    const finalContent = cleanParagraphs.join('\n\n');

    const blockEnds: number[] = [];
    let cursor = 0;
    cleanParagraphs.forEach((p, idx) => {
      cursor += p.length;
      blockEnds.push(cursor);
      if (idx < cleanParagraphs.length - 1) {
        cursor += 2;
      }
    });

    const alignment: ChapterAlignment = {
      version: 1,
      rawBlockCount: previewResult.rawBodyCount,
      translatedBlockCount: cleanParagraphs.length,
      isAligned: previewResult.rawBodyCount === cleanParagraphs.length,
      blockEnds,
    };

    onApplyTranslation(previewResult.titleTranslated, finalContent, alignment);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-[#E5DEC9] bg-[#FBF8F1] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E5DEC9] bg-[#F3EFE6] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#8C2D19] text-white">
              <FileUp className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold text-[#1C1917]">
                Nhập Bản Dịch Ngoài (.TXT) Vào Chương #{chapter.orderPrefix} Với Preview Ghép Đoạn
              </h2>
              <p className="text-xs text-[#605A52]">
                Tự động căn khớp từng đoạn dịch vào hệ thống Block ID (TITLE, P0001..P
                {String(rawBodyBlocks.length).padStart(4, '0')}) mà không làm mất chữ.
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

        {/* Body */}
        <div className="grid flex-1 grid-cols-1 gap-5 overflow-y-auto p-6 lg:grid-cols-12">
          {/* Left: File Upload / Textarea & Split Mode */}
          <div className="space-y-4 lg:col-span-5">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,text/plain"
                onChange={handleLoadTxtFile}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#8C2D19] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#722211]"
              >
                <FileUp className="h-3.5 w-3.5" />
                Chọn tệp bản dịch (.TXT)
              </button>
              <button
                onClick={handlePasteClipboard}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5DEC9] bg-white px-3 py-2 text-xs font-semibold text-[#1C1917] hover:bg-[#F3EFE6]"
              >
                <ClipboardPaste className="h-3.5 w-3.5 text-[#8C2D19]" />
                Dán từ Clipboard
              </button>
              {fileNameLoaded && (
                <span className="truncate font-mono text-[11px] font-semibold text-[#1E6F50]">
                  {fileNameLoaded}
                </span>
              )}
            </div>

            <div className="rounded-xl border border-[#E5DEC9] bg-white p-3.5 space-y-2.5">
              <div>
                <label className="mb-1 block text-xs font-bold text-[#1C1917]">
                  Chế độ tách đoạn văn bản nhập vào
                </label>
                <select
                  value={splitMode}
                  onChange={(e) =>
                    setSplitMode(
                      e.target.value as 'auto' | 'blank_line' | 'single_line'
                    )
                  }
                  className="w-full rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-2.5 py-1.5 text-xs text-[#1C1917]"
                >
                  <option value="auto">
                    Tự động thông minh (Ưu tiên dòng trống, tự tách dòng đơn nếu 1 khối)
                  </option>
                  <option value="blank_line">
                    Tách theo dòng trống (Blank Line: \n\n)
                  </option>
                  <option value="single_line">
                    Tách theo từng dòng đơn (Single Line: \n)
                  </option>
                </select>
              </div>

              <label className="flex items-center gap-2 text-xs font-medium text-[#1C1917]">
                <input
                  type="checkbox"
                  checked={firstLineIsTitle}
                  onChange={(e) => setFirstLineIsTitle(e.target.checked)}
                  className="h-4 w-4 accent-[#8C2D19]"
                />
                Dòng đầu tiên của văn bản là Tiêu đề chương (TITLE)
              </label>
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-[#1C1917]">
                Nội dung bản dịch ngoài (Có thể chỉnh sửa trực tiếp trước khi ghép)
              </label>
              <textarea
                rows={13}
                value={rawTextInput}
                onChange={(e) => setRawTextInput(e.target.value)}
                placeholder="Dán toàn bộ bản dịch tiếng Việt của chương vào đây hoặc bấm 'Chọn tệp bản dịch (.TXT)' ở trên..."
                className="w-full rounded-xl border border-[#E5DEC9] bg-white p-3 font-serif text-xs leading-relaxed text-[#1C1917] focus:border-[#8C2D19] focus:outline-hidden"
              />
            </div>
          </div>

          {/* Right: Live Block Alignment Preview */}
          <div className="flex flex-col space-y-3 lg:col-span-7">
            {/* Alignment Summary Banner */}
            <div className="rounded-xl border border-[#E5DEC9] bg-white p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Columns className="h-4 w-4 text-[#8C2D19]" />
                  <span className="text-xs font-bold text-[#1C1917]">
                    Preview Ghép Đoạn Theo Block ID:
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                  <span className="rounded bg-[#F3EFE6] px-2 py-0.5 font-semibold text-[#1C1917]">
                    Đoạn Raw gốc: {previewResult.rawBodyCount}
                  </span>
                  <span className="rounded bg-[#8C2D19]/12 px-2 py-0.5 font-bold text-[#8C2D19]">
                    Đoạn bản dịch: {previewResult.importedBodyCount}
                  </span>
                </div>
              </div>

              {rawTextInput.trim() && (
                <div className="mt-2 text-xs">
                  {previewResult.missingCount === 0 && previewResult.extraCount === 0 ? (
                    <p className="flex items-center gap-1.5 font-semibold text-[#1E6F50]">
                      <CheckCircle2 className="h-4 w-4" />
                      Khớp hoàn hảo 1:1 tất cả {previewResult.rawBodyCount} đoạn văn!
                    </p>
                  ) : (
                    <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-2 text-amber-950">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                      <div>
                        {previewResult.missingCount > 0 && (
                          <p className="font-semibold">
                            Bản dịch ít hơn nguyên tác {previewResult.missingCount} đoạn (các Block cuối sẽ để trống để bạn bổ sung).
                          </p>
                        )}
                        {previewResult.extraCount > 0 && (
                          <p className="font-semibold">
                            Bản dịch nhiều hơn nguyên tác {previewResult.extraCount} đoạn — Hệ thống tự động gộp {previewResult.mergedTailCount} đoạn cuối vào Block P
                            {String(previewResult.rawBodyCount).padStart(4, '0')} để bảo toàn 100% câu chữ!
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Scrollable Block Preview List */}
            <div className="max-h-[410px] flex-1 space-y-2.5 overflow-y-auto rounded-xl border border-[#E5DEC9] bg-[#F3EFE6]/60 p-3">
              {/* TITLE Block */}
              <div className="grid grid-cols-1 gap-3 rounded-lg border border-[#C9B99A] bg-white p-3 md:grid-cols-2">
                <div>
                  <span className="rounded bg-[#8C2D19] px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
                    TITLE (Gốc)
                  </span>
                  <p className="mt-1 font-serif text-xs font-bold text-[#1C1917]">
                    {chapter.titleRaw}
                  </p>
                </div>
                <div>
                  <span className="rounded bg-[#1E6F50] px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
                    TITLE (Bản dịch)
                  </span>
                  <p className="mt-1 font-serif text-xs font-bold text-[#8C2D19]">
                    {previewResult.titleTranslated || '(Chưa có tiêu đề dịch)'}
                  </p>
                </div>
              </div>

              {/* Body Blocks P0001..Pxxxx */}
              {rawBodyBlocks.map((rb, idx) => {
                const mappedVi = previewResult.mappedBodyParagraphs[idx] || '';
                const isLastAndMerged =
                  idx === rawBodyBlocks.length - 1 && previewResult.extraCount > 0;
                return (
                  <div
                    key={rb.id}
                    className={`grid grid-cols-1 gap-3 rounded-lg border p-3 md:grid-cols-2 ${
                      !mappedVi.trim()
                        ? 'border-amber-300 bg-amber-50/50'
                        : isLastAndMerged
                          ? 'border-blue-300 bg-blue-50/40'
                          : 'border-[#E5DEC9] bg-white'
                    }`}
                  >
                    <div>
                      <span className="rounded bg-[#E5DEC9] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#1C1917]">
                        {rb.id}
                      </span>
                      <p className="mt-1 font-serif text-xs leading-relaxed text-[#44403C]">
                        {rb.source}
                      </p>
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="rounded bg-[#8C2D19]/15 px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#8C2D19]">
                          {rb.id} → Việt
                        </span>
                        {isLastAndMerged && (
                          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-800">
                            Đã gộp {previewResult.mergedTailCount} đoạn cuối
                          </span>
                        )}
                      </div>
                      <p className="mt-1 font-serif text-xs leading-relaxed text-[#1C1917] whitespace-pre-line">
                        {mappedVi || (
                          <span className="italic text-amber-800">
                            (Trống — thiếu đoạn dịch)
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#E5DEC9] bg-[#F3EFE6] px-6 py-4">
          <span className="text-xs text-[#605A52]">
            Thao tác này sẽ nạp bản dịch vào Trình Biên Tập của chương #{chapter.orderPrefix} (Có thể bấm Undo Ctrl+Z để hoàn tác).
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-xs font-medium text-[#605A52] hover:bg-[#E5DEC9]"
            >
              Hủy
            </button>
            <button
              onClick={handleConfirmApply}
              disabled={!rawTextInput.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#8C2D19] px-5 py-2 text-xs font-semibold text-white hover:bg-[#722211] disabled:opacity-45"
            >
              <Check className="h-4 w-4" />
              Áp Dụng Bản Dịch Vào Chương
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
