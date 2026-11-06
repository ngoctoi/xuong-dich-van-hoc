export type ChapterStatus =
  | 'raw'
  | 'queued'
  | 'translating'
  | 'translated'
  | 'edited'
  | 'error';

export type GlossaryCategory =
  | 'character'
  | 'location'
  | 'cultivation'
  | 'skill'
  | 'organization'
  | 'item'
  | 'title'
  | 'pronoun'
  | 'other';

export type GlossaryPolicy = 'force' | 'prefer' | 'contextual' | 'keep_source';

export type GlossaryApprovalStatus = 'approved' | 'draft';

export type QAIssueType =
  | 'chinese_residual'
  | 'english_leak'
  | 'untranslated_title'
  | 'block_mismatch'
  | 'length_ratio'
  | 'repeated_paragraph'
  | 'abrupt_ending'
  | 'code_fence'
  | 'glossary_violation';

export interface QAIssue {
  id: string;
  type: QAIssueType;
  match: string;
  lineIndex: number; // -1 for title/chapter-level, >= 0 for block/paragraph index
  blockId?: string; // e.g., "TITLE", "P0001"
  contextSnippet: string;
}

export interface QAValidationRules {
  minLengthRatio: number; // default 0.35
  maxLengthRatio: number; // default 5.0
  maxHanCharacters: number; // default 0
  repeatedParagraphThreshold: number; // default 3
  checkAbruptEnding: boolean; // default false
}

export interface QAReport {
  hasIssues: boolean;
  residualChineseCount: number;
  leakedEnglishCount: number;
  untranslatedTitle: boolean;
  blockMismatch?: boolean;
  rawBlockCount?: number;
  translatedBlockCount?: number;
  lengthRatio?: number;
  lengthRatioAbnormal?: boolean;
  repeatedParagraphCount?: number;
  abruptEnding?: boolean;
  codeFenceFound?: boolean;
  glossaryViolationCount?: number;
  issues: QAIssue[];
  scannedAt: number;
}

export interface ChapterAlignment {
  version: 1;
  rawBlockCount: number;
  translatedBlockCount: number;
  isAligned: boolean;
  blockEnds: number[];
}

export interface TranslationBlock {
  id: string; // "TITLE" | "P0001" | "P0002"...
  source: string;
  translation?: string;
}

export type InstructionRole = 'translation' | 'editorial';

export interface InstructionProfile {
  id: string;
  name: string;
  description: string;
  role?: InstructionRole; // 'translation' (default) | 'editorial'
  genreTag: string;
  pronounRule: string;
  systemInstruction: string;
  includeGlossary: boolean; // Default FALSE per user requirement
  autoUpdate?: boolean; // false when imported or duplicated
  isDefault?: boolean;
  updatedAt: number;
}

export type NovelProjectStatus = 'ongoing' | 'completed' | 'paused';

export interface NovelProject {
  id: string;
  title: string;
  originalTitle: string;
  author: string;
  description: string;
  genre?: string; // e.g., 'Tiên Hiệp', 'Huyền Huyễn', 'Kiếm Hiệp', 'Đô Thị', 'Khoa Huyễn', 'Hệ Thống', 'Linh Dị', 'Cổ Đại'
  status?: NovelProjectStatus; // 'ongoing' | 'completed' | 'paused'
  pinned?: boolean;
  sourceUrl?: string;
  instructionProfileId: string; // Active Translation Preset ID
  editorialProfileId?: string; // Active Editorial AI Preset ID
  includeGlossary?: boolean; // Default FALSE: only send glossary when enabled
  coverDataBase64?: string; // Persistent EPUB cover data URL
  coverMimeType?: string;
  coverFileName?: string;
  createdAt: number;
  updatedAt: number;
}

export interface NovelLibrarySummary {
  novelId: string;
  totalChapters: number;
  translatedChapters: number;
  editedChapters: number;
  rawChapters: number;
  errorChapters: number;
  totalRawChars: number;
  totalTranslatedWords: number;
  glossaryCount: number;
  highlightCount: number;
  bookmark: ReadingBookmark | null;
}


export interface Chapter {
  id: string;
  novelId: string;
  orderPrefix: string; // e.g., "0000", "0001", "0013"
  chapterNumber: number; // e.g., 0, 1, 13
  fileNameOriginal: string; // e.g., "0001_第1章 他惊人的毅力并无观众.txt"
  titleRaw: string; // e.g., "第1章 他惊人的毅力并无观众"
  titleTranslated: string; // e.g., "Chương 1: Nghị lực kinh người của hắn không người chứng kiến"
  rawContent: string; // Full raw Chinese chapter prose
  translatedContent: string; // Full translated Vietnamese chapter prose
  charCount: number;
  status: ChapterStatus;
  lastError?: string;
  translatedByModel?: string; // Model ID that translated or AI-edited this chapter
  lastKeyUsed?: number; // Key index in pool that processed this chapter
  alignment?: ChapterAlignment;
  qaReport?: QAReport;
  updatedAt: number;
}

export interface GlossaryEntry {
  id: string;
  novelId: string;
  sourceTerm: string;
  targetTerm: string;
  category: GlossaryCategory;
  notes: string;
  aliases?: string[]; // Biến thể tiếng Trung / Phồn thể / Đạo hiệu / Biệt danh (cùng quy tắc dịch)
  policy?: GlossaryPolicy; // 'force' (mặc định) | 'prefer' | 'contextual' | 'keep_source'
  forbiddenTranslations?: string[]; // Các cách dịch cấm kỵ (VD: ["Thanh Vân Môn"])
  chapterFrom?: number; // Hiệu lực từ chương X (Temporal Terminology)
  chapterTo?: number; // Hiệu lực đến chương Y (Temporal Terminology)
  firstChapter?: number; // Chương xuất hiện lần đầu
  status?: GlossaryApprovalStatus; // 'approved' (mặc định) | 'draft' (chờ duyệt từ AI Pre-Scan)
  enabled?: boolean; // default true for individual entry; whole table is gated by includeGlossary (default FALSE)
  pinned?: boolean; // If true, always injected when includeGlossary is enabled (for main characters / core pronoun rules)
  source?: 'manual' | 'ai'; // Track whether term was added manually or discovered via Pre-Scan AI
  updatedAt?: number;
}

export interface ReaderThemePreset {
  id: string;
  name: string;
  bgHex: string;
  textHex: string;
  borderHex: string;
}

export interface ReaderSettings {
  presetId: string;
  bgHex: string;
  textHex: string;
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  paragraphSpacing: number;
  maxWidth: number;
  alwaysJustify: boolean;
}

export type HighlightColor = 'amber' | 'jade' | 'blue';

export interface ReaderHighlight {
  id: string;
  novelId: string;
  chapterId: string;
  color: HighlightColor;
  quote: string;
  selectedText?: string;
  note: string;
  blockId?: string;
  paragraphIndex: number;
  createdAt: number;
}

export interface ReadingBookmark {
  novelId: string;
  chapterId: string;
  orderPrefix?: string;
  scrollPercentage: number;
  scrollRatio?: number;
  updatedAt: number;
}

export interface CustomFontRecord {
  id: string;
  name: string;
  fileName: string;
  mimeType: string;
  dataBase64: string;
  createdAt: number;
}

export type ThinkingLevelOption = 'minimal' | 'low' | 'medium' | 'high';

export interface ThinkingLevelMeta {
  id: ThinkingLevelOption;
  label: string;
  badge: string;
  description: string;
  isDefault?: boolean;
  source?: string;
}

export const DEFAULT_THINKING_LEVEL: ThinkingLevelOption = 'high';

export const THINKING_LEVEL_OPTIONS: ThinkingLevelMeta[] = [
  {
    id: 'minimal',
    label: 'minimal — Tối thiểu (Siêu tốc)',
    badge: 'Chống ngắt 300s',
    description:
      'Gần như tắt bước suy nghĩ trung gian để trả kết quả nhanh nhất. Rất hữu ích khi chương quá dài hoặc cổng mạng dễ bị ngắt kết nối 300 giây.',
  },
  {
    id: 'low',
    label: 'low — Thấp (Nhanh & Ổn định)',
    badge: 'Tốc độ cao',
    description:
      'Suy luận nhanh các quy tắc cơ bản, giảm mạnh thời gian chờ phản hồi (TTFB) để tránh timeout 300s khi chạy đa luồng.',
  },
  {
    id: 'medium',
    label: 'medium — Trung bình (Cân bằng)',
    badge: 'Cân bằng',
    description:
      'Cân bằng giữa chiều sâu phân tích ngữ cảnh Hán-Việt và tốc độ phản hồi, phù hợp cho các chương dài vừa phải.',
  },
  {
    id: 'high',
    label: 'high — Cao (Mặc định • Sâu nhất)',
    badge: 'Mặc định',
    description:
      'Mức suy luận sâu nhất (mặc định khi không chỉnh): phân tích kỹ mạch văn, đại từ xưng hô và cấu trúc Block ID 1:1.',
    isDefault: true,
  },
];

export interface ModelConfigState {
  selectedModel: string; // e.g., 'gemini-flash-latest'
  thinkingLevel?: ThinkingLevelOption; // 'minimal' | 'low' | 'medium' | 'high' (Default: 'high')
  concurrency: number; // 1 to 10
  autoFallbackEnabled?: boolean; // Auto-switch to fallbackModel if all keys hit 429 on selectedModel
  fallbackModel?: string; // e.g., 'gemini-3.1-flash-lite-preview'
  customBannedWords: string[];
  qaRules?: QAValidationRules;
}

export interface EditorHistorySnapshot {
  titleTranslated: string;
  translatedContent: string;
  timestamp: number;
  label: string;
}


