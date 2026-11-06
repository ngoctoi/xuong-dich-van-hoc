'use client';

import React, { useState, useMemo, useRef } from 'react';
import {
  FolderUp,
  FileText,
  BookOpen,
  Globe,
  X,
  Check,
  AlertTriangle,
  Sparkles,
  Upload,
} from 'lucide-react';
import { Chapter } from '@/lib/types';
import {
  cleanRawChapterBody,
  decodeChineseTextBuffer,
  parseEpubFile,
  parseFolderTxtFiles,
  splitMergedTxtByRegex,
} from '@/lib/file-engine';
import { REGEX_SPLIT_PRESETS } from '@/lib/seed-data';
import { safeFetchJson } from '@/lib/logger';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  novelId: string;
  existingChapterCount: number;
  onImportChapters: (
    chapters: Chapter[],
    detectedBookMeta?: { title?: string; author?: string }
  ) => Promise<void>;
}

export default function ImportModal({
  isOpen,
  onClose,
  novelId,
  existingChapterCount,
  onImportChapters,
}: ImportModalProps) {
  const [activeTab, setActiveTab] = useState<
    'folder_txt' | 'epub' | 'merged_txt' | 'paste_url'
  >('folder_txt');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Tab 1: Folder / Multiple TXT files (XXXX_Title.txt)
  const [folderParsedChapters, setFolderParsedChapters] = useState<Chapter[]>([]);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const multiFilesInputRef = useRef<HTMLInputElement | null>(null);

  // Tab 2: EPUB
  const [epubParsedChapters, setEpubParsedChapters] = useState<Chapter[]>([]);
  const [epubMeta, setEpubMeta] = useState<{ title?: string; author?: string }>({});

  // Tab 3: Single Merged TXT with Custom Regex
  const [mergedRawText, setMergedRawText] = useState('');
  const [mergedFileName, setMergedFileName] = useState('');
  const [customRegex, setCustomRegex] = useState(REGEX_SPLIT_PRESETS[0].pattern);
  const [startOrderNumber, setStartOrderNumber] = useState(existingChapterCount + 1);

  // Tab 4: Paste Raw or URL
  const [pasteTitleRaw, setPasteTitleRaw] = useState('');
  const [pasteContentRaw, setPasteContentRaw] = useState('');
  const [pasteOrderPrefix, setPasteOrderPrefix] = useState(
    String(existingChapterCount + 1).padStart(4, '0')
  );
  const [chapterUrl, setChapterUrl] = useState('');
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);

  const regexPreview = useMemo(() => {
    if (!mergedRawText.trim()) return { items: [], error: undefined };
    return splitMergedTxtByRegex(mergedRawText, customRegex, startOrderNumber);
  }, [mergedRawText, customRegex, startOrderNumber]);

  if (!isOpen) return null;

  const handleFolderOrFilesSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    setIsProcessing(true);
    setErrorMessage(null);
    setStatusMessage(`Đang phân tích ${fileList.length} tệp từ thư mục...`);
    try {
      const files = Array.from(fileList);
      const parsed = await parseFolderTxtFiles(
        files,
        novelId,
        existingChapterCount
      );
      if (parsed.length === 0) {
        setErrorMessage('Không tìm thấy tệp .txt nào trong thư mục đã chọn.');
      } else {
        setFolderParsedChapters(parsed);
        setStatusMessage(
          `Đã nhận diện thành công ${parsed.length} chương theo thứ tự prefix XXXX.`
        );
      }
    } catch (err) {
      setErrorMessage((err as Error).message || 'Lỗi khi đọc thư mục .txt');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmFolderImport = async () => {
    if (folderParsedChapters.length === 0) return;
    setIsProcessing(true);
    try {
      await onImportChapters(folderParsedChapters);
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEpubSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    setErrorMessage(null);
    setStatusMessage(`Đang giải nén và phân tích cấu trúc EPUB "${file.name}"...`);
    try {
      const res = await parseEpubFile(file, novelId, existingChapterCount + 1);
      if (res.chapters.length === 0) {
        setErrorMessage('Không tìm thấy chương nội dung nào trong file EPUB.');
      } else {
        setEpubParsedChapters(res.chapters);
        setEpubMeta({ title: res.bookTitle, author: res.author });
        setStatusMessage(
          `Đã bóc tách ${res.chapters.length} chương từ sách "${
            res.bookTitle || file.name
          }".`
        );
      }
    } catch (err) {
      setErrorMessage((err as Error).message || 'Lỗi khi đọc file EPUB.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmEpubImport = async () => {
    if (epubParsedChapters.length === 0) return;
    setIsProcessing(true);
    try {
      await onImportChapters(epubParsedChapters, epubMeta);
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleMergedTxtSelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    setErrorMessage(null);
    try {
      const buffer = await file.arrayBuffer();
      const text = decodeChineseTextBuffer(buffer);
      setMergedRawText(text);
      setMergedFileName(file.name);
      setStatusMessage(
        `Đã tải file "${file.name}" (${text.length.toLocaleString()} ký tự). Hãy kiểm tra bảng Preview tách chương bên dưới.`
      );
    } catch (err) {
      setErrorMessage((err as Error).message || 'Không thể đọc file .txt');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmMergedTxtImport = async () => {
    if (regexPreview.items.length === 0) return;
    setIsProcessing(true);
    try {
      const chapters: Chapter[] = regexPreview.items.map((item, idx) => ({
        id: `ch-${novelId}-${item.orderPrefix}-${Date.now()}-${idx}`,
        novelId,
        orderPrefix: item.orderPrefix,
        chapterNumber: item.chapterNumber,
        fileNameOriginal: `${item.orderPrefix}_${item.titleRaw}.txt`,
        titleRaw: item.titleRaw,
        titleTranslated: '',
        rawContent: item.rawContent,
        translatedContent: '',
        charCount: item.charCount,
        status: 'raw',
        updatedAt: Date.now(),
      }));
      await onImportChapters(chapters);
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFetchFromUrl = async () => {
    if (!chapterUrl.trim()) return;
    setIsFetchingUrl(true);
    setErrorMessage(null);
    try {
      const res = await safeFetchJson<{
        titleRaw?: string;
        rawContent?: string;
        error?: string;
      }>(
        '/api/fetch-url',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: chapterUrl.trim() }),
        },
        {
          scope: 'FETCH_URL',
          label: `Tải chương từ URL (${chapterUrl.trim().slice(0, 60)})`,
        }
      );
      if (!res.ok || !res.data || res.data.error) {
        throw new Error(
          res.data?.error || res.errorMessage || 'Không thể lấy chương từ URL'
        );
      }
      setPasteTitleRaw(res.data.titleRaw || '第1章');
      setPasteContentRaw(res.data.rawContent || '');
      setStatusMessage('Đã tải thành công nội dung chương từ URL.');
    } catch (err) {
      setErrorMessage((err as Error).message);
    } finally {
      setIsFetchingUrl(false);
    }
  };

  const handleConfirmPasteImport = async () => {
    if (!pasteContentRaw.trim()) {
      setErrorMessage('Vui lòng dán nội dung chương tiếng Trung.');
      return;
    }
    setIsProcessing(true);
    try {
      const lines = pasteContentRaw.trim().split(/\r?\n/);
      const inferredTitle =
        pasteTitleRaw.trim() || lines[0]?.trim() || `第${existingChapterCount + 1}章`;
      const cleanedBody = cleanRawChapterBody(pasteContentRaw, inferredTitle);
      const prefix = pasteOrderPrefix.trim().padStart(4, '0');
      const num = parseInt(prefix, 10) || existingChapterCount + 1;

      const newChapter: Chapter = {
        id: `ch-${novelId}-${prefix}-${Date.now()}`,
        novelId,
        orderPrefix: prefix,
        chapterNumber: num,
        fileNameOriginal: `${prefix}_${inferredTitle}.txt`,
        titleRaw: inferredTitle,
        titleTranslated: '',
        rawContent: cleanedBody,
        translatedContent: '',
        charCount: cleanedBody.replace(/\s+/g, '').length,
        status: 'raw',
        updatedAt: Date.now(),
      };
      await onImportChapters([newChapter]);
      onClose();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-[#E4DFD7] bg-[#FAF8F5] text-[#1C1917] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E4DFD7] bg-[#F2EFE9] px-6 py-4">
          <div>
            <h2 className="font-display text-lg font-bold text-[#1C1917]">
              Nhập Chương Truyện Đa Nguồn
            </h2>
            <p className="text-xs text-[#6B635B]">
              Hỗ trợ Thư mục tệp .TXT định dạng XXXX_Tên_chương.txt · Sách .EPUB ·
              1 File .TXT gộp (Custom Regex) · Dán trực tiếp / URL
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#6B635B] hover:bg-[#E4DFD7] hover:text-[#1C1917]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-[#E4DFD7] bg-[#F2EFE9]/60 px-6 pt-2 gap-2 overflow-x-auto">
          <button
            onClick={() => {
              setActiveTab('folder_txt');
              setErrorMessage(null);
            }}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === 'folder_txt'
                ? 'border-[#C83E31] text-[#C83E31] bg-[#FAF8F5] rounded-t-lg'
                : 'border-transparent text-[#6B635B] hover:text-[#1C1917]'
            }`}
          >
            <FolderUp className="h-4 w-4" />
            1. Thư Mục .TXT (XXXX_Tên_chương.txt)
          </button>
          <button
            onClick={() => {
              setActiveTab('epub');
              setErrorMessage(null);
            }}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === 'epub'
                ? 'border-[#C83E31] text-[#C83E31] bg-[#FAF8F5] rounded-t-lg'
                : 'border-transparent text-[#6B635B] hover:text-[#1C1917]'
            }`}
          >
            <BookOpen className="h-4 w-4" />
            2. File .EPUB Nguyên Bộ
          </button>
          <button
            onClick={() => {
              setActiveTab('merged_txt');
              setErrorMessage(null);
            }}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === 'merged_txt'
                ? 'border-[#C83E31] text-[#C83E31] bg-[#FAF8F5] rounded-t-lg'
                : 'border-transparent text-[#6B635B] hover:text-[#1C1917]'
            }`}
          >
            <FileText className="h-4 w-4" />
            3. File .TXT Gộp (Custom Regex)
          </button>
          <button
            onClick={() => {
              setActiveTab('paste_url');
              setErrorMessage(null);
            }}
            className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors ${
              activeTab === 'paste_url'
                ? 'border-[#C83E31] text-[#C83E31] bg-[#FAF8F5] rounded-t-lg'
                : 'border-transparent text-[#6B635B] hover:text-[#1C1917]'
            }`}
          >
            <Globe className="h-4 w-4" />
            4. Dán Raw / Lấy Từ URL
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {errorMessage && (
            <div className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-xs text-red-800">
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {statusMessage && !errorMessage && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-900">
              <Check className="h-4 w-4 shrink-0 text-emerald-700" />
              <span>{statusMessage}</span>
            </div>
          )}

          {/* TAB 1: FOLDER / MULTI TXT */}
          {activeTab === 'folder_txt' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-dashed border-[#C83E31]/40 bg-[#F2EFE9]/50 p-6 text-center">
                <FolderUp className="mx-auto h-10 w-10 text-[#C83E31]" />
                <h3 className="mt-2 text-sm font-semibold text-[#1C1917]">
                  Chọn Thư Mục chứa các tệp chương .TXT (ví dụ: 0001_第1章 ....txt)
                </h3>
                <p className="mt-1 text-xs text-[#6B635B]">
                  Tự động bóc tách prefix số thứ tự (0000, 0001, 0002...) để sắp xếp
                  chính xác 100%, khử dòng tiêu đề lặp ở đầu file và hỗ trợ cả bảng mã
                  UTF-8 lẫn GB18030/GBK.
                </p>

                <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
                  <input
                    ref={folderInputRef}
                    type="file"
                    multiple
                    // @ts-expect-error webkitdirectory is standard for folder upload
                    webkitdirectory="true"
                    directory="true"
                    onChange={handleFolderOrFilesSelected}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => folderInputRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-lg bg-[#C83E31] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#B03226]"
                  >
                    <FolderUp className="h-4 w-4" />
                    Chọn Nguyên Thư Mục (Folder)
                  </button>

                  <input
                    ref={multiFilesInputRef}
                    type="file"
                    accept=".txt"
                    multiple
                    onChange={handleFolderOrFilesSelected}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => multiFilesInputRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-lg border border-[#D5CFC4] bg-white px-4 py-2.5 text-xs font-semibold text-[#1C1917] hover:bg-[#F2EFE9]"
                  >
                    <Upload className="h-4 w-4" />
                    Hoặc Chọn Nhiều File .TXT Lẻ
                  </button>
                </div>
              </div>

              {folderParsedChapters.length > 0 && (
                <div className="rounded-lg border border-[#E4DFD7] bg-white">
                  <div className="flex items-center justify-between border-b border-[#E4DFD7] bg-[#F2EFE9] px-4 py-2.5 text-xs font-semibold">
                    <span>
                      Xem trước danh sách chương ({folderParsedChapters.length.toLocaleString()}{' '}
                      chương)
                    </span>
                    <span className="font-mono-num text-[#6B635B]">
                      Prefix: {folderParsedChapters[0]?.orderPrefix} →{' '}
                      {folderParsedChapters[folderParsedChapters.length - 1]?.orderPrefix}
                    </span>
                  </div>
                  <div className="max-h-60 divide-y divide-[#E4DFD7] overflow-y-auto text-xs">
                    {folderParsedChapters.slice(0, 100).map((ch) => (
                      <div
                        key={ch.id}
                        className="flex items-center justify-between px-4 py-2 hover:bg-[#FAF8F5]"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="font-mono-num font-semibold text-[#C83E31]">
                            [{ch.orderPrefix}]
                          </span>
                          <span className="truncate font-medium text-[#1C1917]">
                            {ch.titleRaw}
                          </span>
                        </div>
                        <span className="font-mono-num text-[#6B635B] shrink-0 ml-3">
                          {ch.charCount.toLocaleString()} chữ
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: EPUB */}
          {activeTab === 'epub' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-dashed border-[#C83E31]/40 bg-[#F2EFE9]/50 p-6 text-center">
                <BookOpen className="mx-auto h-10 w-10 text-[#C83E31]" />
                <h3 className="mt-2 text-sm font-semibold text-[#1C1917]">
                  Tải lên sách điện tử .EPUB tiếng Trung
                </h3>
                <p className="mt-1 text-xs text-[#6B635B]">
                  Hệ thống tự động đọc mục lục OPF/NCX, trích xuất từng chương theo đúng
                  thứ tự và gán mã thứ tự XXXX đồng bộ.
                </p>
                <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#C83E31] px-4 py-2.5 text-xs font-semibold text-white hover:bg-[#B03226]">
                  <Upload className="h-4 w-4" />
                  <span>Chọn File .EPUB</span>
                  <input
                    type="file"
                    accept=".epub"
                    onChange={handleEpubSelected}
                    className="hidden"
                  />
                </label>
              </div>

              {epubParsedChapters.length > 0 && (
                <div className="rounded-lg border border-[#E4DFD7] bg-white">
                  <div className="flex items-center justify-between border-b border-[#E4DFD7] bg-[#F2EFE9] px-4 py-2.5 text-xs font-semibold">
                    <span>
                      {epubMeta.title || 'Sách EPUB'} · {epubParsedChapters.length} chương
                    </span>
                    <span className="text-[#6B635B]">{epubMeta.author}</span>
                  </div>
                  <div className="max-h-60 divide-y divide-[#E4DFD7] overflow-y-auto text-xs">
                    {epubParsedChapters.slice(0, 100).map((ch) => (
                      <div
                        key={ch.id}
                        className="flex items-center justify-between px-4 py-2"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="font-mono-num font-semibold text-[#C83E31]">
                            [{ch.orderPrefix}]
                          </span>
                          <span className="truncate font-medium">{ch.titleRaw}</span>
                        </div>
                        <span className="font-mono-num text-[#6B635B] shrink-0">
                          {ch.charCount.toLocaleString()} chữ
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: MERGED TXT WITH CUSTOM REGEX */}
          {activeTab === 'merged_txt' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#E4DFD7] bg-[#F2EFE9]/60 p-4">
                <div>
                  <h3 className="text-xs font-bold text-[#1C1917]">
                    Tải 1 File .TXT Gộp Toàn Truyện + Tùy Chỉnh Regex Tách Chương
                  </h3>
                  <p className="text-xs text-[#6B635B]">
                    Dành cho các bản raw gộp 1 file bị lỗi định dạng tiêu đề chương. Xem
                    trước ngay số chương tách ra trước khi lưu.
                  </p>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#C83E31] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B03226]">
                  <Upload className="h-4 w-4" />
                  <span>{mergedFileName ? 'Đổi File .TXT Khác' : 'Chọn 1 File .TXT Gộp'}</span>
                  <input
                    type="file"
                    accept=".txt"
                    onChange={handleMergedTxtSelected}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Regex Configuration */}
              <div className="rounded-lg border border-[#E4DFD7] bg-white p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-[#1C1917]">
                    Biểu thức chính quy (Regex) nhận diện dòng Tiêu đề chương:
                  </label>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-[#6B635B]">Đánh số bắt đầu từ:</span>
                    <input
                      type="number"
                      value={startOrderNumber}
                      onChange={(e) =>
                        setStartOrderNumber(Math.max(0, parseInt(e.target.value, 10) || 0))
                      }
                      className="w-20 rounded border border-[#D5CFC4] px-2 py-1 font-mono-num text-xs"
                    />
                  </div>
                </div>

                <input
                  type="text"
                  value={customRegex}
                  onChange={(e) => setCustomRegex(e.target.value)}
                  placeholder="Nhập biểu thức Regex..."
                  className="w-full rounded-lg border border-[#D5CFC4] bg-[#FAF8F5] px-3 py-2 font-mono-num text-xs text-[#1C1917] focus:border-[#C83E31] focus:outline-none"
                />

                <div className="space-y-1.5">
                  <span className="text-[11px] font-medium text-[#6B635B]">
                    Chọn nhanh mẫu Regex trị raw lỗi:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {REGEX_SPLIT_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setCustomRegex(preset.pattern)}
                        className={`text-left rounded-lg border p-2.5 transition-colors ${
                          customRegex === preset.pattern
                            ? 'border-[#C83E31] bg-[#C83E31]/5'
                            : 'border-[#E4DFD7] hover:bg-[#FAF8F5]'
                        }`}
                      >
                        <div className="text-xs font-semibold text-[#1C1917]">
                          {preset.label}
                        </div>
                        <div className="mt-0.5 text-[11px] text-[#6B635B]">
                          {preset.description}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Live Split Preview */}
              {mergedRawText && (
                <div className="rounded-lg border border-[#E4DFD7] bg-white">
                  <div className="flex items-center justify-between border-b border-[#E4DFD7] bg-[#F2EFE9] px-4 py-2.5 text-xs font-semibold">
                    <span>
                      Kết quả Test Regex trực tiếp:{' '}
                      <strong className="text-[#C83E31]">
                        {regexPreview.items.length.toLocaleString()} chương
                      </strong>
                    </span>
                    <span className="text-[#6B635B]">
                      Cảnh báo bất thường:{' '}
                      {regexPreview.items.filter((i) => i.warning).length} chương
                    </span>
                  </div>
                  {regexPreview.error ? (
                    <div className="p-4 text-xs text-red-600">{regexPreview.error}</div>
                  ) : (
                    <div className="max-h-56 divide-y divide-[#E4DFD7] overflow-y-auto text-xs">
                      {regexPreview.items.slice(0, 120).map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between px-4 py-2 hover:bg-[#FAF8F5]"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono-num font-semibold text-[#C83E31]">
                                [{item.orderPrefix}]
                              </span>
                              <span className="truncate font-medium">
                                {item.titleRaw}
                              </span>
                            </div>
                            {item.warning && (
                              <div className="mt-0.5 text-[11px] text-amber-700">
                                ⚠ {item.warning}
                              </div>
                            )}
                          </div>
                          <span className="font-mono-num text-[#6B635B] ml-3 shrink-0">
                            {item.charCount.toLocaleString()} chữ
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: PASTE RAW OR FETCH URL */}
          {activeTab === 'paste_url' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-[#E4DFD7] bg-white p-4 space-y-3">
                <label className="block text-xs font-semibold text-[#1C1917]">
                  Lấy tự động từ URL trang truyện tiếng Trung (Tùy chọn):
                </label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={chapterUrl}
                    onChange={(e) => setChapterUrl(e.target.value)}
                    placeholder="https://..."
                    className="flex-1 rounded-lg border border-[#D5CFC4] bg-[#FAF8F5] px-3 py-2 text-xs focus:border-[#C83E31] focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={isFetchingUrl || !chapterUrl.trim()}
                    onClick={handleFetchFromUrl}
                    className="rounded-lg bg-[#1C1917] px-4 py-2 text-xs font-semibold text-white hover:bg-[#332E2A] disabled:opacity-50"
                  >
                    {isFetchingUrl ? 'Đang tải...' : 'Lấy Nội Dung'}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[#1C1917] mb-1">
                    Mã thứ tự (Prefix XXXX)
                  </label>
                  <input
                    type="text"
                    value={pasteOrderPrefix}
                    onChange={(e) => setPasteOrderPrefix(e.target.value)}
                    placeholder="0006"
                    className="w-full rounded-lg border border-[#D5CFC4] bg-white px-3 py-2 font-mono-num text-xs"
                  />
                </div>
                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-[#1C1917] mb-1">
                    Tiêu đề chương tiếng Trung (Để trống sẽ tự lấy dòng đầu tiên)
                  </label>
                  <input
                    type="text"
                    value={pasteTitleRaw}
                    onChange={(e) => setPasteTitleRaw(e.target.value)}
                    placeholder="Ví dụ: 第6章 信任非错"
                    className="w-full rounded-lg border border-[#D5CFC4] bg-white px-3 py-2 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1C1917] mb-1">
                  Nội dung chương tiếng Trung (Raw):
                </label>
                <textarea
                  rows={9}
                  value={pasteContentRaw}
                  onChange={(e) => setPasteContentRaw(e.target.value)}
                  placeholder="Dán toàn bộ văn bản chữ Hán của chương vào đây..."
                  className="w-full rounded-lg border border-[#D5CFC4] bg-white p-3 text-sm leading-relaxed focus:border-[#C83E31] focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-[#E4DFD7] bg-[#F2EFE9] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#D5CFC4] bg-white px-4 py-2 text-xs font-semibold text-[#1C1917] hover:bg-[#FAF8F5]"
          >
            Đóng
          </button>

          {activeTab === 'folder_txt' && (
            <button
              type="button"
              disabled={isProcessing || folderParsedChapters.length === 0}
              onClick={handleConfirmFolderImport}
              className="inline-flex items-center gap-2 rounded-lg bg-[#C83E31] px-5 py-2 text-xs font-semibold text-white hover:bg-[#B03226] disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              <span>
                Nạp {folderParsedChapters.length.toLocaleString()} Chương Vào Truyện
              </span>
            </button>
          )}

          {activeTab === 'epub' && (
            <button
              type="button"
              disabled={isProcessing || epubParsedChapters.length === 0}
              onClick={handleConfirmEpubImport}
              className="inline-flex items-center gap-2 rounded-lg bg-[#C83E31] px-5 py-2 text-xs font-semibold text-white hover:bg-[#B03226] disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              <span>
                Nạp {epubParsedChapters.length.toLocaleString()} Chương EPUB
              </span>
            </button>
          )}

          {activeTab === 'merged_txt' && (
            <button
              type="button"
              disabled={isProcessing || regexPreview.items.length === 0}
              onClick={handleConfirmMergedTxtImport}
              className="inline-flex items-center gap-2 rounded-lg bg-[#C83E31] px-5 py-2 text-xs font-semibold text-white hover:bg-[#B03226] disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              <span>
                Xác Nhận Tách & Nạp {regexPreview.items.length.toLocaleString()} Chương
              </span>
            </button>
          )}

          {activeTab === 'paste_url' && (
            <button
              type="button"
              disabled={isProcessing || !pasteContentRaw.trim()}
              onClick={handleConfirmPasteImport}
              className="inline-flex items-center gap-2 rounded-lg bg-[#C83E31] px-5 py-2 text-xs font-semibold text-white hover:bg-[#B03226] disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              <span>Thêm Chương Mới</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
