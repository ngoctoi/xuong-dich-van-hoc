'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Sliders,
  BookMarked,
  Cpu,
  Plus,
  Trash2,
  Copy,
  Check,
  Sparkles,
  RefreshCw,
  ShieldCheck,
  KeyRound,
  Search,
  Download,
  Upload,
  Wand2,
  FileDown,
  FileUp,
  ToggleLeft,
  ToggleRight,
  Activity,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Save,
  Pin,
  Edit3,
  Replace,
  Play,
  Pause,
  XCircle,
  Layers,
  Terminal,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  Chapter,
  GlossaryCategory,
  GlossaryEntry,
  GlossaryPolicy,
  InstructionProfile,
  InstructionRole,
  ModelConfigState,
  ThinkingLevelMeta,
  ThinkingLevelOption,
} from '@/lib/types';
import {
  DEFAULT_QA_VALIDATION_RULES,
  DEFAULT_THINKING_LEVEL,
  MODEL_ALIAS_OPTIONS,
  THINKING_LEVEL_OPTIONS,
} from '@/lib/seed-data';
import {
  loadProjectKeysLocal,
  saveProjectKeysLocal,
} from '@/lib/storage';
import {
  filterContextualGlossary,
  getEntrySourceForms,
} from '@/lib/block-engine';
import { logger, safeFetchJson } from '@/lib/logger';

interface InstructionsGlossaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'instructions' | 'glossary' | 'model_keys';
  instructions: InstructionProfile[];
  activeInstructionId: string;
  activeEditorialId: string;
  includeGlossaryForNovel: boolean;
  onToggleIncludeGlossaryForNovel: (enabled: boolean) => Promise<void>;
  onSelectInstruction: (id: string) => void;
  onSelectEditorialInstruction: (id: string) => void;
  onSaveInstruction: (profile: InstructionProfile) => Promise<void>;
  onDeleteInstruction: (id: string) => Promise<void>;
  novelId: string;
  glossary: GlossaryEntry[];
  onSaveGlossaryBulk: (entries: GlossaryEntry[]) => Promise<void>;
  onDeleteGlossaryItem: (id: string) => Promise<void>;
  onDeleteGlossaryBulk?: (ids: string[]) => Promise<void>;
  onSyncReplaceInTranslatedChapters?: (
    oldTerm: string,
    newTerm: string
  ) => Promise<number>;
  chapters?: Chapter[];
  selectedChapterIds?: Set<string>;
  activeChapter: Chapter | null;
  modelConfig: ModelConfigState;
  onChangeModelConfig: (next: ModelConfigState) => void;
  onOpenTerminal?: () => void;
}

const CATEGORY_LABELS: Record<GlossaryCategory, string> = {
  character: 'Nhân vật',
  location: 'Địa danh',
  cultivation: 'Cảnh giới',
  skill: 'Công pháp / Chiêu thức',
  organization: 'Tông môn / Thế lực',
  item: 'Đan dược / Pháp bảo',
  title: 'Chức vị / Danh hiệu',
  pronoun: 'Đại từ xưng hô',
  other: 'Thuật ngữ khác',
};

const POLICY_LABELS: Record<GlossaryPolicy, { label: string; badgeClass: string }> = {
  force: {
    label: 'Bắt buộc (Force)',
    badgeClass: 'bg-[#8C2D19]/12 text-[#8C2D19]',
  },
  prefer: {
    label: 'Ưu tiên (Prefer)',
    badgeClass: 'bg-sky-100 text-sky-800',
  },
  contextual: {
    label: 'Tùy ngữ cảnh',
    badgeClass: 'bg-amber-100 text-amber-900',
  },
  keep_source: {
    label: 'Giữ nguyên gốc',
    badgeClass: 'bg-purple-100 text-purple-800',
  },
};

export default function InstructionsGlossaryModal({
  isOpen,
  onClose,
  initialTab = 'instructions',
  instructions,
  activeInstructionId,
  activeEditorialId,
  includeGlossaryForNovel,
  onToggleIncludeGlossaryForNovel,
  onSelectInstruction,
  onSelectEditorialInstruction,
  onSaveInstruction,
  onDeleteInstruction,
  novelId,
  glossary,
  onSaveGlossaryBulk,
  onDeleteGlossaryItem,
  onDeleteGlossaryBulk,
  onSyncReplaceInTranslatedChapters,
  chapters = [],
  selectedChapterIds,
  activeChapter,
  modelConfig,
  onChangeModelConfig,
  onOpenTerminal,
}: InstructionsGlossaryModalProps) {
  const [activeTab, setActiveTab] = useState<'instructions' | 'glossary' | 'model_keys'>(
    initialTab
  );
  const [roleSubTab, setRoleSubTab] = useState<InstructionRole>('translation');

  // Instructions state
  const [editingProfile, setEditingProfile] = useState<InstructionProfile | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const mdFileInputRef = useRef<HTMLInputElement | null>(null);

  // Glossary & Pre-Scan state
  const [glossarySearch, setGlossarySearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [glossaryScopeFilter, setGlossaryScopeFilter] = useState<
    'all' | 'in_active_chapter' | 'pinned' | 'ai_scanned' | 'draft'
  >('all');
  const [newSource, setNewSource] = useState('');
  const [newTarget, setNewTarget] = useState('');
  const [newCategory, setNewCategory] = useState<GlossaryCategory>('character');
  const [newPolicy, setNewPolicy] = useState<GlossaryPolicy>('force');
  const [newAliases, setNewAliases] = useState('');
  const [newForbidden, setNewForbidden] = useState('');
  const [newChapterFrom, setNewChapterFrom] = useState('');
  const [newChapterTo, setNewChapterTo] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newPinned, setNewPinned] = useState(false);
  const [showAdvancedAddRow, setShowAdvancedAddRow] = useState(false);
  const [bulkGlossaryText, setBulkGlossaryText] = useState('');
  const [showBulkBox, setShowBulkBox] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [glossaryToast, setGlossaryToast] = useState<string | null>(null);
  const [isPreScanExpanded, setIsPreScanExpanded] = useState(true);
  const [isManualAddExpanded, setIsManualAddExpanded] = useState(true);
  const glossaryFileInputRef = useRef<HTMLInputElement | null>(null);

  // Multi-Chapter Pre-Scan Builder state
  const [preScanScope, setPreScanScope] = useState<
    'raw' | 'selected' | 'active' | 'range' | 'all'
  >('raw');
  const [preScanChunkSize, setPreScanChunkSize] = useState<number>(5);
  const [preScanFromNum, setPreScanFromNum] = useState<string>('1');
  const [preScanToNum, setPreScanToNum] = useState<string>('20');
  const [preScanStatus, setPreScanStatus] = useState<'idle' | 'running' | 'paused'>('idle');
  const [preScanProgress, setPreScanProgress] = useState<{
    completedChunks: number;
    totalChunks: number;
    totalChapters: number;
    newTermsAdded: number;
    activeWorkers: number;
    lastModelUsed?: string;
    lastKeyUsed?: number;
  }>({
    completedChunks: 0,
    totalChunks: 0,
    totalChapters: 0,
    newTermsAdded: 0,
    activeWorkers: 0,
  });
  const preScanStatusRef = useRef<'idle' | 'running' | 'paused'>('idle');
  const preScanChunksRef = useRef<Chapter[][]>([]);
  const preScanCursorRef = useRef<number>(0);
  const preScanCompletedRef = useRef<number>(0);
  const preScanAddedCountRef = useRef<number>(0);
  const preScanKnownTermsRef = useRef<Set<string>>(new Set());
  const preScanAbortMapRef = useRef<Map<number, AbortController>>(new Map());

  // Inline Editing state for Glossary rows
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editSourceTerm, setEditSourceTerm] = useState('');
  const [editTargetTerm, setEditTargetTerm] = useState('');
  const [editCategory, setEditCategory] = useState<GlossaryCategory>('character');
  const [editPolicy, setEditPolicy] = useState<GlossaryPolicy>('force');
  const [editAliases, setEditAliases] = useState('');
  const [editForbidden, setEditForbidden] = useState('');
  const [editChapterFrom, setEditChapterFrom] = useState('');
  const [editChapterTo, setEditChapterTo] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editPinned, setEditPinned] = useState(false);
  const [syncingEntryId, setSyncingEntryId] = useState<string | null>(null);

  // Model & Key Pool state
  const [liveModels, setLiveModels] = useState<string[]>([]);
  const [thinkingLevels, setThinkingLevels] = useState<ThinkingLevelMeta[]>(
    THINKING_LEVEL_OPTIONS
  );
  const [poolStats, setPoolStats] = useState<{
    totalKeys: number;
    activeKeys: number;
    idleReadyKeys?: number;
    inUseKeys?: number;
    coolingDownKeys: number;
    invalidKeys?: number;
    hasProjectSavedKeys?: boolean;
    projectSavedKeyCount?: number;
  } | null>(null);
  const [slotsSummary, setSlotsSummary] = useState<
    Array<{
      index: number;
      sourceEnv: string;
      maskedKey: string;
      status: 'ready' | 'in_use' | 'cooldown' | 'invalid';
      activeRequests: number;
      cooldownRemainingSec: number;
      totalRequests: number;
      rateLimitHits: number;
      lastLatencyMs?: number;
      lastError?: string;
    }>
  >([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [savingKeysToProject, setSavingKeysToProject] = useState(false);
  const [savedKeysToast, setSavedKeysToast] = useState<string | null>(null);
  const [checkingAllApis, setCheckingAllApis] = useState(false);
  const [apiCheckReport, setApiCheckReport] = useState<{
    testedAt: number;
    modelTested: string;
    keyResults: Array<{
      index: number;
      sourceEnv: string;
      maskedKey: string;
      status: 'ready' | 'cooldown' | 'invalid';
      latencyMs: number;
      modelTested: string;
      flashLiteReady?: boolean;
      message: string;
    }>;
    endpointResults: Array<{
      endpoint: string;
      method: 'GET' | 'POST';
      name: string;
      description: string;
      status: 'ok' | 'warning' | 'error';
      latencyMs: number;
      detail: string;
    }>;
  } | null>(null);
  const [customModelInput, setCustomModelInput] = useState('');
  const [newBannedWord, setNewBannedWord] = useState('');
  const [rawMultilineKeys, setRawMultilineKeys] = useState('');
  const [copiedEnvFormat, setCopiedEnvFormat] = useState(false);
  const keyFileInputRef = useRef<HTMLInputElement | null>(null);

  const [prevSyncKey, setPrevSyncKey] = useState('');
  const currentSyncKey = `${isOpen}-${initialTab}-${roleSubTab}-${activeInstructionId}-${activeEditorialId}-${instructions.length}`;
  if (currentSyncKey !== prevSyncKey) {
    setPrevSyncKey(currentSyncKey);
    setActiveTab(initialTab);
    const roleFiltered = instructions.filter(
      (i) => (i.role || 'translation') === roleSubTab
    );
    const targetActiveId =
      roleSubTab === 'editorial' ? activeEditorialId : activeInstructionId;
    const found =
      roleFiltered.find((i) => i.id === targetActiveId) ||
      roleFiltered[0] ||
      instructions[0] ||
      null;
    if (found) {
      setEditingProfile({ ...found });
    }
  }

  const fetchLiveModelsAndPool = async () => {
    setLoadingModels(true);
    try {
      const res = await safeFetchJson<{
        liveModels?: string[];
        thinkingLevels?: ThinkingLevelMeta[];
        defaultThinkingLevel?: ThinkingLevelOption;
        poolStats?: typeof poolStats;
        poolStatus?: { slotsSummary?: typeof slotsSummary };
        savedRawKeys?: string;
      }>(
        `/api/models?model=${encodeURIComponent(modelConfig.selectedModel)}`,
        { method: 'GET' },
        {
          scope: 'MODELS_API',
          label: `Lấy danh sách Model, Thinking Levels & Bể Key (${modelConfig.selectedModel})`,
        }
      );
      const data = res.data || {};
      if (Array.isArray(data.liveModels)) {
        setLiveModels(data.liveModels);
      }
      if (
        Array.isArray(data.thinkingLevels) &&
        data.thinkingLevels.length > 0
      ) {
        setThinkingLevels(data.thinkingLevels);
      }
      if (data.poolStats) {
        setPoolStats(data.poolStats);
      }
      if (Array.isArray(data.poolStatus?.slotsSummary)) {
        setSlotsSummary(data.poolStatus.slotsSummary);
      }
      const localSaved = loadProjectKeysLocal().trim();
      if (localSaved) {
        setRawMultilineKeys(localSaved);
      } else {
        setRawMultilineKeys('');
      }
    } catch {
      // Ignore error
    } finally {
      setLoadingModels(false);
    }
  };

  const handleSaveKeysToProject = async (overrideRawKeys?: string) => {
    const textToSave =
      overrideRawKeys !== undefined ? overrideRawKeys : rawMultilineKeys;
    setSavingKeysToProject(true);
    setSavedKeysToast(null);
    try {
      saveProjectKeysLocal(textToSave);
      const res = await safeFetchJson<{
        savedCount?: number;
        totalPoolKeys?: number;
        savedRawKeys?: string;
        poolStats?: typeof poolStats;
        poolStatus?: { slotsSummary?: typeof slotsSummary };
      }>(
        '/api/models',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'save_keys',
            rawKeys: textToSave,
            model: modelConfig.selectedModel,
          }),
        },
        {
          scope: 'KEY_POOL',
          label: 'Lưu / Xóa danh sách Key vào dự án',
        }
      );
      if (!res.ok || !res.data) {
        throw new Error(res.errorMessage || 'Không thể lưu Key');
      }
      const data = res.data;
      if (data.poolStats) {
        setPoolStats(data.poolStats);
      }
      if (Array.isArray(data.poolStatus?.slotsSummary)) {
        setSlotsSummary(data.poolStatus.slotsSummary);
      }
      if (typeof data.savedRawKeys === 'string') {
        setRawMultilineKeys(data.savedRawKeys);
        saveProjectKeysLocal(data.savedRawKeys);
      }
      setSavedKeysToast(
        (data.savedCount || 0) > 0
          ? `Đã lưu riêng tư ${data.savedCount} Key trên trình duyệt của bạn (Tổng bể: ${data.totalPoolKeys} Key). Hệ thống không tích hợp sẵn hay chia sẻ Key sang người dùng khác!`
          : `Đã xóa sạch toàn bộ Key khỏi trình duyệt (Tổng bể: 0 Key — Ai muốn dùng phải tự thêm Key!).`
      );
    } catch (err) {
      setSavedKeysToast(`Lỗi khi lưu Key: ${(err as Error).message}`);
    } finally {
      setSavingKeysToProject(false);
    }
  };

  const handleResetCooldowns = async () => {
    try {
      const res = await safeFetchJson<{
        poolStats?: typeof poolStats;
        poolStatus?: { slotsSummary?: typeof slotsSummary };
      }>(
        '/api/models',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'reset_cooldowns',
            model: modelConfig.selectedModel,
          }),
        },
        {
          scope: 'KEY_POOL',
          label: 'Xóa Cooldown 429 cho toàn bộ Key',
        }
      );
      const data = res.data || {};
      if (data.poolStats) setPoolStats(data.poolStats);
      if (Array.isArray(data.poolStatus?.slotsSummary)) {
        setSlotsSummary(data.poolStatus.slotsSummary);
      }
      setSavedKeysToast('Đã xóa toàn bộ trạng thái Cooldown 429 & đặt lại Bể Key!');
    } catch {
      // Ignore
    }
  };

  const handleCheckAllApisAndKeys = async () => {
    setCheckingAllApis(true);
    setSavedKeysToast(null);
    try {
      // First save any unpersisted keys in the textarea so they are included in the check
      const localTrimmed = rawMultilineKeys.trim();
      saveProjectKeysLocal(localTrimmed);
      await safeFetchJson(
        '/api/models',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'save_keys',
            rawKeys: localTrimmed,
            model: modelConfig.selectedModel,
          }),
        },
        {
          scope: 'KEY_POOL',
          label: 'Đồng bộ Key trước khi Chẩn đoán Toàn diện',
          silentSuccessLog: true,
        }
      );

      const res = await safeFetchJson<{
        testedAt?: number;
        modelTested?: string;
        poolStats?: typeof poolStats;
        poolStatus?: { slotsSummary?: typeof slotsSummary };
        keyResults?: NonNullable<typeof apiCheckReport>['keyResults'];
        endpointResults?: NonNullable<typeof apiCheckReport>['endpointResults'];
      }>(
        '/api/models',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'check_all',
            model: modelConfig.selectedModel,
          }),
        },
        {
          scope: 'KEY_POOL',
          label: `Chẩn đoán Toàn diện Key & API (${modelConfig.selectedModel})`,
        }
      );
      if (!res.ok || !res.data) {
        throw new Error(res.errorMessage || 'Lỗi khi kiểm tra API');
      }
      const data = res.data;
      if (data.poolStats) setPoolStats(data.poolStats);
      if (Array.isArray(data.poolStatus?.slotsSummary)) {
        setSlotsSummary(data.poolStatus.slotsSummary);
      }
      if (Array.isArray(data.keyResults) && Array.isArray(data.endpointResults)) {
        setApiCheckReport({
          testedAt: data.testedAt || Date.now(),
          modelTested: data.modelTested || modelConfig.selectedModel,
          keyResults: data.keyResults,
          endpointResults: data.endpointResults,
        });
      }
    } catch (err) {
      setSavedKeysToast(`Lỗi khi kiểm tra API: ${(err as Error).message}`);
    } finally {
      setCheckingAllApis(false);
    }
  };

  const handleImportKeysFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setRawMultilineKeys(text);
    await handleSaveKeysToProject(text);
    e.target.value = '';
  };

  useEffect(() => {
    if (!isOpen || activeTab !== 'model_keys') return;
    let cancelled = false;
    (async () => {
      try {
        const res = await safeFetchJson<{
          liveModels?: string[];
          thinkingLevels?: ThinkingLevelMeta[];
          defaultThinkingLevel?: ThinkingLevelOption;
          poolStats?: typeof poolStats;
          poolStatus?: { slotsSummary?: typeof slotsSummary };
          savedRawKeys?: string;
        }>(
          `/api/models?model=${encodeURIComponent(modelConfig.selectedModel)}`,
          { method: 'GET' },
          {
            scope: 'MODELS_API',
            label: `Auto-load Model, Thinking Levels & Key Pool (${modelConfig.selectedModel})`,
            silentSuccessLog: true,
          }
        );
        if (cancelled || !res.data) return;
        const data = res.data;
        if (Array.isArray(data.liveModels)) {
          setLiveModels(data.liveModels);
        }
        if (
          Array.isArray(data.thinkingLevels) &&
          data.thinkingLevels.length > 0
        ) {
          setThinkingLevels(data.thinkingLevels);
        }
        if (data.poolStats) {
          setPoolStats(data.poolStats);
        }
        if (Array.isArray(data.poolStatus?.slotsSummary)) {
          setSlotsSummary(data.poolStatus.slotsSummary);
        }
        const localSaved = loadProjectKeysLocal().trim();
        if (localSaved) {
          setRawMultilineKeys(localSaved);
        } else {
          setRawMultilineKeys('');
        }
      } catch {
        // Ignore error
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, activeTab, modelConfig.selectedModel]);

  if (!isOpen) return null;

  const profilesForCurrentRole = instructions.filter(
    (i) => (i.role || 'translation') === roleSubTab
  );

  const handleCreateNewProfile = async () => {
    const isEditorial = roleSubTab === 'editorial';
    const newProfile: InstructionProfile = {
      id: `inst-${roleSubTab}-${Date.now()}`,
      name: isEditorial ? 'Preset Biên Tập AI mới' : 'Preset Instruction Dịch mới',
      description: isEditorial
        ? 'Tùy chỉnh quy tắc biên tập AI, dọn lỗi Hán tự/English leak và chuốt văn phong.'
        : 'Tùy chỉnh văn phong, xưng hô và quy tắc dịch chương riêng.',
      genreTag: isEditorial ? 'Biên tập AI' : 'Tùy chỉnh',
      role: roleSubTab,
      pronounRule: 'Ta - Ngươi / Hắn - Nàng',
      includeGlossary: false,
      autoUpdate: false,
      updatedAt: Date.now(),
      systemInstruction: isEditorial
        ? `Bạn là Biên tập viên tiểu thuyết Trung - Việt cao cấp.\n\nNGUYÊN TẮC BẮT BUỘC:\n1. Quét sạch 100% chữ Hán còn sót và các từ tiếng Anh lọt câu ("but", "and", "the", "with", "however"...).\n2. Giữ nguyên 100% số lượng đoạn văn và mạch sự kiện gốc, không cắt gộp hay thêm thắt.\n3. Không xuất lời bình luận hay markdown thừa.`
        : `Bạn là dịch giả tiểu thuyết Trung - Việt chuyên nghiệp.\n\nNGUYÊN TẮC BẮT BUỘC:\n1. Bắt buộc dịch tiêu đề chương sang tiếng Việt hoàn chỉnh ("Chương X: ...").\n2. Dịch trọn vẹn 100% nội dung từng Block ID (TITLE, P0001..Pxxxx), không cắt gộp hay tóm tắt bất kỳ đoạn nào.\n3. Tuyệt đối không để sót chữ Hán (Trung Quốc) hoặc lọt các từ nối tiếng Anh ("but", "and", "the", "with", "however"...) vào câu tiếng Việt.`,
    };
    await onSaveInstruction(newProfile);
    if (isEditorial) {
      onSelectEditorialInstruction(newProfile.id);
    } else {
      onSelectInstruction(newProfile.id);
    }
    setEditingProfile(newProfile);
  };

  const handleDuplicateProfile = async () => {
    if (!editingProfile) return;
    const role = editingProfile.role || roleSubTab;
    const dup: InstructionProfile = {
      ...editingProfile,
      id: `inst-dup-${Date.now()}`,
      name: `${editingProfile.name} (Bản sao)`,
      role,
      isDefault: false,
      autoUpdate: false,
      updatedAt: Date.now(),
    };
    await onSaveInstruction(dup);
    if (role === 'editorial') {
      onSelectEditorialInstruction(dup.id);
    } else {
      onSelectInstruction(dup.id);
    }
    setEditingProfile(dup);
  };

  const handleSaveCurrentProfile = async () => {
    if (!editingProfile) return;
    const role = editingProfile.role || roleSubTab;
    const updated: InstructionProfile = {
      ...editingProfile,
      role,
      autoUpdate: false,
      updatedAt: Date.now(),
    };
    await onSaveInstruction(updated);
    if (role === 'editorial') {
      onSelectEditorialInstruction(updated.id);
    } else {
      onSelectInstruction(updated.id);
    }
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 1800);
  };

  const handleExportProfileMarkdown = () => {
    if (!editingProfile) return;
    const mdContent = editingProfile.systemInstruction;
    const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = editingProfile.name
      .replace(/[\\/:*?"<>|]/g, '-')
      .replace(/\s+/g, '_');
    a.download = `${safeName}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportProfileMarkdown = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const baseName = file.name.replace(/\.(md|txt)$/i, '');
    const imported: InstructionProfile = {
      id: `inst-import-${Date.now()}`,
      name: baseName || 'Preset nhập từ file .MD',
      description: `Nhập từ tệp ${file.name}`,
      genreTag: roleSubTab === 'editorial' ? 'Biên tập .MD' : 'Dịch thuật .MD',
      role: roleSubTab,
      pronounRule: editingProfile?.pronounRule || 'Ta - Ngươi / Hắn - Nàng',
      systemInstruction: text.trim(),
      includeGlossary: false,
      autoUpdate: false,
      updatedAt: Date.now(),
    };
    await onSaveInstruction(imported);
    if (roleSubTab === 'editorial') {
      onSelectEditorialInstruction(imported.id);
    } else {
      onSelectInstruction(imported.id);
    }
    setEditingProfile(imported);
    e.target.value = '';
  };

  const triggerGlossaryToast = (msg: string) => {
    setGlossaryToast(msg);
    setTimeout(() => {
      setGlossaryToast((prev) => (prev === msg ? null : prev));
    }, 4500);
  };

  const parseCommaOrPipeList = (raw: string): string[] =>
    (raw || '')
      .split(/[,;|／/]/)
      .map((s) => s.normalize('NFC').trim())
      .filter(Boolean);

  const normalizeImportedPolicy = (raw?: string): GlossaryPolicy => {
    if (!raw) return 'force';
    const v = raw.trim().toLowerCase();
    if (v === 'prefer' || v.includes('ưu tiên') || v.includes('uu tien')) {
      return 'prefer';
    }
    if (
      v === 'contextual' ||
      v === 'context' ||
      v.includes('ngữ cảnh') ||
      v.includes('ngu canh')
    ) {
      return 'contextual';
    }
    if (
      v === 'keep_source' ||
      v === 'keep' ||
      v.includes('giữ nguyên') ||
      v.includes('giu nguyen')
    ) {
      return 'keep_source';
    }
    return 'force';
  };

  const handleAddGlossaryEntry = async () => {
    if (!newSource.trim() || !newTarget.trim()) return;
    const rawParts = newSource
      .normalize('NFC')
      .split(/[|／/]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const canonicalSrc = rawParts[0] || newSource.trim();
    const mergedAliases = Array.from(
      new Set([...rawParts.slice(1), ...parseCommaOrPipeList(newAliases)])
    ).filter((a) => a !== canonicalSrc);
    const forbiddenList = parseCommaOrPipeList(newForbidden);
    const chFrom = parseInt(newChapterFrom, 10);
    const chTo = parseInt(newChapterTo, 10);

    const entry: GlossaryEntry = {
      id: `gl-${novelId}-${Date.now()}`,
      novelId,
      sourceTerm: canonicalSrc,
      targetTerm: newTarget.normalize('NFC').trim(),
      category: newCategory,
      policy: newPolicy,
      aliases: mergedAliases.length > 0 ? mergedAliases : undefined,
      forbiddenTranslations: forbiddenList.length > 0 ? forbiddenList : undefined,
      chapterFrom: !Number.isNaN(chFrom) && chFrom > 0 ? chFrom : undefined,
      chapterTo: !Number.isNaN(chTo) && chTo > 0 ? chTo : undefined,
      notes: newNotes.trim(),
      status: 'approved',
      enabled: true,
      pinned: newPinned,
      source: 'manual',
      updatedAt: new Date().getTime(),
    };
    await onSaveGlossaryBulk([entry]);
    setNewSource('');
    setNewTarget('');
    setNewAliases('');
    setNewForbidden('');
    setNewChapterFrom('');
    setNewChapterTo('');
    setNewNotes('');
    setNewPinned(false);
    triggerGlossaryToast(`Đã thêm "${entry.sourceTerm} = ${entry.targetTerm}" vào Từ điển!`);
  };

  const handleToggleGlossaryEntryEnabled = async (entry: GlossaryEntry) => {
    const updated: GlossaryEntry = {
      ...entry,
      enabled: entry.enabled === false ? true : false,
      updatedAt: new Date().getTime(),
    };
    await onSaveGlossaryBulk([updated]);
  };

  const handleToggleGlossaryEntryPinned = async (entry: GlossaryEntry) => {
    const updated: GlossaryEntry = {
      ...entry,
      pinned: !entry.pinned,
      status: 'approved',
      updatedAt: new Date().getTime(),
    };
    await onSaveGlossaryBulk([updated]);
    triggerGlossaryToast(
      updated.pinned
        ? `Đã ghim cố định "${entry.sourceTerm}" (Luôn gửi kèm khi BẬT Glossary)!`
        : `Đã bỏ ghim "${entry.sourceTerm}".`
    );
  };

  const handleApproveSingleEntry = async (entry: GlossaryEntry) => {
    const updated: GlossaryEntry = {
      ...entry,
      status: 'approved',
      updatedAt: new Date().getTime(),
    };
    await onSaveGlossaryBulk([updated]);
    triggerGlossaryToast(`Đã duyệt mục từ "${entry.sourceTerm} => ${entry.targetTerm}"!`);
  };

  const handleApproveAllDraftEntries = async () => {
    const drafts = glossary.filter((g) => g.status === 'draft');
    if (drafts.length === 0) return;
    const now = new Date().getTime();
    const approvedList = drafts.map((g) => ({
      ...g,
      status: 'approved' as const,
      updatedAt: now,
    }));
    await onSaveGlossaryBulk(approvedList);
    triggerGlossaryToast(`Đã duyệt chính thức toàn bộ ${approvedList.length} mục từ do AI quét!`);
  };

  const handleStartInlineEdit = (entry: GlossaryEntry) => {
    setEditingEntryId(entry.id);
    setEditSourceTerm(entry.sourceTerm);
    setEditTargetTerm(entry.targetTerm);
    setEditCategory(entry.category);
    setEditPolicy(entry.policy || 'force');
    setEditAliases((entry.aliases || []).join(', '));
    setEditForbidden((entry.forbiddenTranslations || []).join(', '));
    setEditChapterFrom(entry.chapterFrom ? String(entry.chapterFrom) : '');
    setEditChapterTo(entry.chapterTo ? String(entry.chapterTo) : '');
    setEditNotes(entry.notes || '');
    setEditPinned(Boolean(entry.pinned));
  };

  const handleSaveInlineEdit = async (
    originalEntry: GlossaryEntry,
    syncToTranslatedChapters = false
  ) => {
    const rawParts = editSourceTerm
      .normalize('NFC')
      .split(/[|／/]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const cleanSrc = rawParts[0] || editSourceTerm.trim();
    const cleanTgt = editTargetTerm.normalize('NFC').trim();
    if (!cleanSrc || !cleanTgt) return;

    const mergedAliases = Array.from(
      new Set([...rawParts.slice(1), ...parseCommaOrPipeList(editAliases)])
    ).filter((a) => a !== cleanSrc);
    const forbiddenList = parseCommaOrPipeList(editForbidden);
    const chFrom = parseInt(editChapterFrom, 10);
    const chTo = parseInt(editChapterTo, 10);

    const oldTarget = originalEntry.targetTerm.trim();
    const updated: GlossaryEntry = {
      ...originalEntry,
      sourceTerm: cleanSrc,
      targetTerm: cleanTgt,
      category: editCategory,
      policy: editPolicy,
      aliases: mergedAliases.length > 0 ? mergedAliases : undefined,
      forbiddenTranslations: forbiddenList.length > 0 ? forbiddenList : undefined,
      chapterFrom: !Number.isNaN(chFrom) && chFrom > 0 ? chFrom : undefined,
      chapterTo: !Number.isNaN(chTo) && chTo > 0 ? chTo : undefined,
      notes: editNotes.trim(),
      status: 'approved',
      pinned: editPinned,
      updatedAt: new Date().getTime(),
    };
    await onSaveGlossaryBulk([updated]);
    setEditingEntryId(null);

    if (
      syncToTranslatedChapters &&
      onSyncReplaceInTranslatedChapters &&
      oldTarget &&
      oldTarget !== cleanTgt
    ) {
      setSyncingEntryId(originalEntry.id);
      try {
        const replacedChapters = await onSyncReplaceInTranslatedChapters(
          oldTarget,
          cleanTgt
        );
        triggerGlossaryToast(
          `Đã lưu "${cleanSrc} => ${cleanTgt}" & đồng bộ thay thế "${oldTarget}" → "${cleanTgt}" trong ${replacedChapters} chương đã dịch!`
        );
      } finally {
        setSyncingEntryId(null);
      }
    } else {
      triggerGlossaryToast(`Đã lưu & duyệt mục từ "${cleanSrc} => ${cleanTgt}"!`);
    }
  };

  const handleSyncSourceTermToTranslated = async (entry: GlossaryEntry) => {
    if (!onSyncReplaceInTranslatedChapters) return;
    setSyncingEntryId(entry.id);
    try {
      const forms = getEntrySourceForms(entry);
      let totalReplaced = 0;
      for (const f of forms) {
        const count = await onSyncReplaceInTranslatedChapters(
          f,
          entry.targetTerm.trim()
        );
        totalReplaced = Math.max(totalReplaced, count);
      }
      triggerGlossaryToast(
        totalReplaced > 0
          ? `Đã thay thế toàn bộ chữ Hán "${forms.join(' / ')}" → "${entry.targetTerm}" trong ${totalReplaced} chương đã dịch!`
          : `Không phát hiện chữ Hán "${forms.join(' / ')}" nào còn sót trong các chương đã dịch.`
      );
    } finally {
      setSyncingEntryId(null);
    }
  };

  const normalizeImportedCategory = (raw?: string): GlossaryCategory => {
    if (!raw) return 'character';
    const v = raw.trim().toLowerCase();
    if (
      v === 'character' ||
      v.includes('nhân vật') ||
      v.includes('nhan vat') ||
      v === 'name' ||
      v === 'person'
    ) {
      return 'character';
    }
    if (v === 'location' || v.includes('địa danh') || v.includes('dia danh') || v === 'place') {
      return 'location';
    }
    if (
      v === 'cultivation' ||
      v.includes('cảnh giới') ||
      v.includes('canh gioi') ||
      v === 'realm' ||
      v === 'power_system'
    ) {
      return 'cultivation';
    }
    if (
      v === 'skill' ||
      v.includes('công pháp') ||
      v.includes('chiêu thức') ||
      v.includes('chieu thuc') ||
      v === 'technique'
    ) {
      return 'skill';
    }
    if (
      v === 'organization' ||
      v.includes('tông môn') ||
      v.includes('thế lực') ||
      v.includes('the luc') ||
      v.includes('tổ chức') ||
      v === 'sect' ||
      v === 'faction'
    ) {
      return 'organization';
    }
    if (
      v === 'item' ||
      v.includes('pháp bảo') ||
      v.includes('đan dược') ||
      v.includes('vật phẩm') ||
      v.includes('vũ khí') ||
      v.includes('tài nguyên')
    ) {
      return 'item';
    }
    if (
      v === 'title' ||
      v.includes('danh hiệu') ||
      v.includes('chức vị') ||
      v.includes('chuc vi') ||
      v.includes('danh xưng')
    ) {
      return 'title';
    }
    if (v === 'pronoun' || v.includes('xưng hô') || v.includes('đại từ')) {
      return 'pronoun';
    }
    if (v === 'other' || v.includes('khác')) {
      return 'other';
    }
    return 'character';
  };

  const parseExternalGlossaryContent = (rawText: string): GlossaryEntry[] => {
    const trimmed = rawText.normalize('NFC').trim();
    if (!trimmed) return [];
    const now = Date.now();
    const existingMap = new Map<string, GlossaryEntry>();
    glossary.forEach((g) => existingMap.set(g.sourceTerm.normalize('NFC').trim(), g));

    const resultsMap = new Map<string, GlossaryEntry>();

    // 1. Try parsing as JSON (Array or { glossary: [...] } or { fixed_terms: [...] } or Key-Value dictionary)
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        const list = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.glossary)
            ? parsed.glossary
            : Array.isArray(parsed?.terms)
              ? parsed.terms
              : Array.isArray(parsed?.fixed_terms)
                ? parsed.fixed_terms
                : null;

        if (list) {
          list.forEach((item: Record<string, unknown>, idx: number) => {
            const rawSrc = String(
              item.sourceTerm ??
                item.source_zh ??
                item.headword_zh ??
                item.han ??
                item.source ??
                item.raw ??
                item.original ??
                ''
            ).trim();
            const rawTgt = String(
              item.targetTerm ??
                item.target_vi ??
                item.translation_vi ??
                item.viet ??
                item.target ??
                item.translation ??
                ''
            ).trim();
            const srcParts = rawSrc
              .split(/[|／/]/)
              .map((s) => s.trim())
              .filter(Boolean);
            const src = srcParts[0] || rawSrc;
            const tgt = rawTgt.split('/')[0].trim();
            if (!src || !tgt) return;

            const prev = existingMap.get(src);
            const cat = normalizeImportedCategory(
              typeof item.category === 'string'
                ? item.category
                : typeof item.type === 'string'
                  ? item.type
                  : prev?.category
            );
            const policy = normalizeImportedPolicy(
              typeof item.policy === 'string' ? item.policy : prev?.policy
            );
            const rawAliases = Array.isArray(item.aliases)
              ? item.aliases.map((a) => String(a || '').trim())
              : typeof item.aliases === 'string'
                ? parseCommaOrPipeList(item.aliases)
                : [];
            const mergedAliases = Array.from(
              new Set([...srcParts.slice(1), ...rawAliases, ...(prev?.aliases || [])])
            ).filter((a) => a && a !== src);

            const rawForbidden = Array.isArray(item.forbiddenTranslations)
              ? item.forbiddenTranslations.map((f) => String(f || '').trim())
              : Array.isArray(item.forbidden)
                ? item.forbidden.map((f) => String(f || '').trim())
                : typeof item.forbidden_translations === 'string'
                  ? parseCommaOrPipeList(item.forbidden_translations)
                  : [];
            const mergedForbidden = Array.from(
              new Set([...rawForbidden, ...(prev?.forbiddenTranslations || [])])
            ).filter(Boolean);

            const noteParts = [
              item.notes ?? item.note ?? item.pronoun ?? item.definition ?? item.definition_vi ?? '',
              item.usage_condition ?? item.when_context ?? item.context ?? '',
            ]
              .map((s) => String(s || '').trim())
              .filter(Boolean);
            const notes = noteParts.join(' • ') || prev?.notes || '';

            const chFrom = Number(item.chapterFrom ?? item.chapter_from ?? prev?.chapterFrom ?? 0);
            const chTo = Number(item.chapterTo ?? item.chapter_to ?? prev?.chapterTo ?? 0);
            const firstCh = Number(
              item.firstChapter ?? item.first_chapter ?? prev?.firstChapter ?? 0
            );

            const pinned =
              typeof item.pinned === 'boolean' ? item.pinned : Boolean(prev?.pinned);
            const enabled =
              typeof item.enabled === 'boolean' ? item.enabled : prev?.enabled !== false;

            resultsMap.set(src, {
              id: prev?.id || `gl-imp-json-${novelId}-${now}-${idx}`,
              novelId,
              sourceTerm: src,
              targetTerm: tgt,
              category: cat,
              policy,
              aliases: mergedAliases.length > 0 ? mergedAliases : undefined,
              forbiddenTranslations:
                mergedForbidden.length > 0 ? mergedForbidden : undefined,
              chapterFrom: chFrom > 0 ? chFrom : undefined,
              chapterTo: chTo > 0 ? chTo : undefined,
              firstChapter: firstCh > 0 ? firstCh : undefined,
              notes,
              status: item.status === 'draft' ? 'draft' : 'approved',
              pinned,
              enabled,
              source: item.source === 'ai' ? 'ai' : 'manual',
              updatedAt: now,
            });
          });
          return Array.from(resultsMap.values());
        } else if (parsed && typeof parsed === 'object') {
          // Simple {"姜望": "Khương Vọng"} dictionary JSON
          Object.entries(parsed).forEach(([k, v], idx) => {
            const src = k.trim();
            const tgt = String(v ?? '')
              .split('/')[0]
              .trim();
            if (!src || !tgt) return;
            const prev = existingMap.get(src);
            resultsMap.set(src, {
              id: prev?.id || `gl-imp-dict-${novelId}-${now}-${idx}`,
              novelId,
              sourceTerm: src,
              targetTerm: tgt,
              category: prev?.category || 'character',
              policy: prev?.policy || 'force',
              aliases: prev?.aliases,
              forbiddenTranslations: prev?.forbiddenTranslations,
              notes: prev?.notes || '',
              status: 'approved',
              pinned: Boolean(prev?.pinned),
              enabled: prev?.enabled !== false,
              source: 'manual',
              updatedAt: now,
            });
          });
          return Array.from(resultsMap.values());
        }
      } catch {
        // Fall through to line-by-line parser
      }
    }

    // 2. Line-by-line parser (.TXT QuickTranslator Hán=Việt, TSV, Pipe-delimited, or CSV including 10-col ISO CSV)
    const lines = trimmed
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#') && !l.startsWith('//'));

    let isIsoCsvHeader = false;
    lines.forEach((line, idx) => {
      if (idx === 0) {
        if (/^source_zh\s*,/i.test(line)) {
          isIsoCsvHeader = true;
          return;
        }
        if (/^(sourceTerm|chữ hán|han|nguyên bản)[,\t|]/i.test(line)) {
          return;
        }
      }

      let src = '';
      let tgt = '';
      let catRaw = '';
      let notes = '';
      let aliases: string[] = [];
      let forbidden: string[] = [];
      let policy: GlossaryPolicy = 'force';
      let pinned = false;

      if (line.includes('=') && !isIsoCsvHeader) {
        // Format: Hán=Việt or Hán=Việt\tPhân_loại\tGhi_chú\tpin\taliases\tpolicy\tforbidden
        const eqIdx = line.indexOf('=');
        const rawLeft = line.slice(0, eqIdx).trim();
        const leftParts = rawLeft
          .split(/[|／/]/)
          .map((s) => s.trim())
          .filter(Boolean);
        src = leftParts[0] || rawLeft;
        aliases = leftParts.slice(1);

        const rest = line.slice(eqIdx + 1).trim();
        const subParts = rest.includes('\t')
          ? rest.split('\t')
          : rest.includes('|')
            ? rest.split('|')
            : [rest];
        tgt = (subParts[0] || '').split('/')[0].trim();
        if (subParts.length === 2) {
          const second = subParts[1].trim();
          if (
            /^(character|location|cultivation|skill|organization|item|title|pronoun|other|nhân vật|địa danh|cảnh giới|công pháp|tông môn|pháp bảo|danh hiệu|xưng hô)$/i.test(
              second
            )
          ) {
            catRaw = second;
          } else {
            notes = second;
          }
        } else if (subParts.length >= 3) {
          catRaw = subParts[1].trim();
          notes = subParts[2].trim();
          if (subParts[3] && /^(true|1|pin|ghim)$/i.test(subParts[3].trim())) {
            pinned = true;
          }
          if (subParts[4]) {
            aliases = Array.from(
              new Set([...aliases, ...parseCommaOrPipeList(subParts[4])])
            );
          }
          if (subParts[5]) {
            policy = normalizeImportedPolicy(subParts[5]);
          }
          if (subParts[6]) {
            forbidden = parseCommaOrPipeList(subParts[6]);
          }
        }
      } else if (line.includes('\t') || (line.includes('|') && !line.includes(','))) {
        const parts = line.includes('\t') ? line.split('\t') : line.split('|');
        src = (parts[0] || '').trim();
        tgt = (parts[1] || '').split('/')[0].trim();
        if (parts.length === 3) {
          notes = parts[2].trim();
        } else if (parts.length >= 4) {
          catRaw = parts[2].trim();
          notes = parts[3].trim();
          if (parts[4] && /^(true|1|pin|ghim)$/i.test(parts[4].trim())) {
            pinned = true;
          }
        }
      } else if (line.includes('->')) {
        const parts = line.split('->');
        src = (parts[0] || '').trim();
        tgt = (parts[1] || '').split('/')[0].trim();
        notes = (parts[2] || '').trim();
      } else if (line.includes(',')) {
        // CSV support (handles both 5-col standard CSV and 10-col ISO Reference CSV:
        // source_zh,target_vi,category,subcategory,genre,definition,usage_condition,aliases,forbidden_translations,status)
        const parts = line
          .split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
          .map((s) => s.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
        src = parts[0] || '';
        tgt = (parts[1] || '').split('/')[0].trim();
        catRaw = parts[2] || '';
        if (isIsoCsvHeader || parts.length >= 8) {
          const def = parts[5] || '';
          const usage = parts[6] || '';
          notes = [def, usage].filter(Boolean).join(' • ');
          aliases = parseCommaOrPipeList(parts[7] || '');
          forbidden = parseCommaOrPipeList(parts[8] || '');
        } else {
          notes = parts[3] || '';
          if (parts[4] && /^(true|1|pin|ghim)$/i.test(parts[4])) {
            pinned = true;
          }
        }
      }

      if (src && tgt) {
        const prev = existingMap.get(src);
        const mergedAliases = Array.from(
          new Set([...aliases, ...(prev?.aliases || [])])
        ).filter((a) => a && a !== src);
        const mergedForbidden = Array.from(
          new Set([...forbidden, ...(prev?.forbiddenTranslations || [])])
        ).filter(Boolean);

        resultsMap.set(src, {
          id: prev?.id || `gl-bulk-${novelId}-${now}-${idx}`,
          novelId,
          sourceTerm: src,
          targetTerm: tgt,
          category: catRaw
            ? normalizeImportedCategory(catRaw)
            : prev?.category || 'character',
          policy: policy || prev?.policy || 'force',
          aliases: mergedAliases.length > 0 ? mergedAliases : undefined,
          forbiddenTranslations:
            mergedForbidden.length > 0 ? mergedForbidden : undefined,
          notes: notes || prev?.notes || '',
          status: 'approved',
          pinned: pinned || Boolean(prev?.pinned),
          enabled: prev?.enabled !== false,
          source: 'manual',
          updatedAt: now,
        });
      }
    });

    return Array.from(resultsMap.values());
  };

  const handleBulkGlossaryImport = async () => {
    const entries = parseExternalGlossaryContent(bulkGlossaryText);
    if (entries.length > 0) {
      await onSaveGlossaryBulk(entries);
      setBulkGlossaryText('');
      setShowBulkBox(false);
      triggerGlossaryToast(
        `Đã nhập/cập nhật thành công ${entries.length} thuật ngữ vào Từ điển!`
      );
    } else {
      setExtractError(
        'Không nhận diện được thuật ngữ hợp lệ. Hãy kiểm tra lại định dạng JSON hoặc Hán=Việt.'
      );
    }
  };

  const handleImportGlossaryFile = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const entries = parseExternalGlossaryContent(text);
      if (entries.length > 0) {
        await onSaveGlossaryBulk(entries);
        triggerGlossaryToast(
          `Đã nhập thành công ${entries.length} thuật ngữ từ file "${file.name}"!`
        );
      } else {
        setExtractError(
          `File "${file.name}" không có mục từ hợp lệ. Hỗ trợ .JSON, .TXT (Hán=Việt) và .CSV.`
        );
      }
    } catch (err) {
      setExtractError(`Lỗi đọc file Glossary: ${(err as Error).message}`);
    } finally {
      e.target.value = '';
    }
  };

  const handleExportGlossaryText = () => {
    const content = glossary
      .map((g) => {
        const left =
          g.aliases && g.aliases.length > 0
            ? `${g.sourceTerm}|${g.aliases.join('|')}`
            : g.sourceTerm;
        return `${left}=${g.targetTerm}\t${g.category || 'character'}\t${
          g.notes || ''
        }\t${g.pinned ? 'pin' : ''}\t${(g.aliases || []).join(',')}\t${
          g.policy || 'force'
        }\t${(g.forbiddenTranslations || []).join(',')}`;
      })
      .join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `glossary_${novelId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportGlossaryJson = () => {
    const cleanPayload = glossary.map((g) => ({
      sourceTerm: g.sourceTerm,
      targetTerm: g.targetTerm,
      aliases: g.aliases || [],
      policy: g.policy || 'force',
      forbiddenTranslations: g.forbiddenTranslations || [],
      chapterFrom: g.chapterFrom,
      chapterTo: g.chapterTo,
      firstChapter: g.firstChapter,
      category: g.category,
      notes: g.notes || '',
      status: g.status || 'approved',
      pinned: Boolean(g.pinned),
      enabled: g.enabled !== false,
    }));
    const blob = new Blob([JSON.stringify(cleanPayload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `glossary_${novelId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Resolve target chapters for Pre-Scan Builder based on chosen scope
  const getPreScanTargetChapters = (): Chapter[] => {
    if (preScanScope === 'active') {
      return activeChapter && activeChapter.rawContent.trim() ? [activeChapter] : [];
    }
    if (preScanScope === 'selected') {
      return chapters.filter(
        (c) => selectedChapterIds?.has(c.id) && c.rawContent.trim()
      );
    }
    if (preScanScope === 'raw') {
      return chapters.filter((c) => c.status === 'raw' && c.rawContent.trim());
    }
    if (preScanScope === 'range') {
      const min = Math.min(
        parseInt(preScanFromNum, 10) || 1,
        parseInt(preScanToNum, 10) || 99999
      );
      const max = Math.max(
        parseInt(preScanFromNum, 10) || 1,
        parseInt(preScanToNum, 10) || 99999
      );
      return chapters.filter((c) => {
        if (!c.rawContent.trim()) return false;
        const pNum = parseInt(c.orderPrefix, 10);
        return (
          (c.chapterNumber >= min && c.chapterNumber <= max) ||
          (!Number.isNaN(pNum) && pNum >= min && pNum <= max)
        );
      });
    }
    return chapters.filter((c) => c.rawContent.trim());
  };

  const runPreScanWorkerLoop = async () => {
    const chunks = preScanChunksRef.current;
    const concurrency = Math.min(10, Math.max(1, modelConfig.concurrency));
    const effectiveFallback =
      modelConfig.autoFallbackEnabled !== false &&
      modelConfig.fallbackModel &&
      modelConfig.fallbackModel !== modelConfig.selectedModel
        ? modelConfig.fallbackModel
        : undefined;

    const worker = async () => {
      while (preScanStatusRef.current === 'running') {
        if (preScanCursorRef.current >= chunks.length) break;
        const chunkIdx = preScanCursorRef.current++;
        const chunkChapters = chunks[chunkIdx];
        if (!chunkChapters || chunkChapters.length === 0) break;

        const controller = new AbortController();
        preScanAbortMapRef.current.set(chunkIdx, controller);

        setPreScanProgress((prev) => ({
          ...prev,
          activeWorkers: prev.activeWorkers + 1,
        }));

        const combinedRaw = chunkChapters
          .map(
            (ch) =>
              `=== [CHƯƠNG #${ch.orderPrefix}: ${ch.titleRaw}] ===\n${ch.rawContent}`
          )
          .join('\n\n')
          .slice(0, 44000);

        const firstChapterNum = chunkChapters[0]?.chapterNumber || 1;
        const chapterRangeLabel =
          chunkChapters.length === 1
            ? `Ch.#${chunkChapters[0].orderPrefix}`
            : `Ch.#${chunkChapters[0].orderPrefix}..#${chunkChapters[chunkChapters.length - 1].orderPrefix}`;

        logger.info(
          'GLOSSARY_SCAN',
          `[Worker] Bắt đầu quét gói ${chunkIdx + 1}/${chunks.length} (${chapterRangeLabel} • ${chunkChapters.length} chương • ${combinedRaw.length} ký tự)`,
          {
            chunkIndex: chunkIdx + 1,
            totalChunks: chunks.length,
            chapterRangeLabel,
            chaptersInChunk: chunkChapters.map((c) => c.orderPrefix),
            combinedRawLength: combinedRaw.length,
            existingKnownTermsCount: preScanKnownTermsRef.current.size,
            primaryModel: modelConfig.selectedModel,
            fallbackModel: effectiveFallback,
          }
        );

        try {
          const res = await safeFetchJson<{
            terms?: Array<{
              sourceTerm?: string;
              targetTerm?: string;
              aliases?: string[];
              policy?: GlossaryPolicy;
              category?: GlossaryCategory;
              notes?: string;
            }>;
            modelUsed?: string;
            keyUsed?: number;
            didFallback?: boolean;
            poolExhausted429?: boolean;
            error?: string;
          }>(
            '/api/glossary/extract',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              signal: controller.signal,
              body: JSON.stringify({
                rawContent: combinedRaw,
                model: modelConfig.selectedModel,
                fallbackModel: effectiveFallback,
                thinkingLevel:
                  modelConfig.thinkingLevel || DEFAULT_THINKING_LEVEL,
                existingTerms: Array.from(preScanKnownTermsRef.current).slice(0, 350),
              }),
            },
            {
              scope: 'GLOSSARY_SCAN',
              label: `Quét Gói ${chunkIdx + 1}/${chunks.length} (${chapterRangeLabel} • ${combinedRaw.length} chars)`,
            }
          );

          const data = res.data || {};
          if (!res.ok || !res.data) {
            if (res.status === 429 || data.poolExhausted429) {
              // Put chunk back and Auto-Pause Pre-Scan
              preScanCursorRef.current = Math.min(preScanCursorRef.current, chunkIdx);
              if (preScanStatusRef.current === 'running') {
                preScanStatusRef.current = 'paused';
                setPreScanStatus('paused');
                const pauseMsg = `Tất cả Key đã chạm giới hạn 429 khi đang quét gói ${chunkIdx + 1}/${
                  chunks.length
                }. Hệ thống đã TẠM DỪNG — hãy đổi sang gemini-3.1-flash-lite hoặc thêm Key rồi bấm Tiếp tục quét!`;
                logger.warn('GLOSSARY_SCAN', pauseMsg, {
                  chunkIndex: chunkIdx + 1,
                  totalChunks: chunks.length,
                  debugTrace: res.debugTrace,
                });
                setExtractError(pauseMsg);
              }
              break;
            }
            throw new Error(
              data.error || res.errorMessage || 'Lỗi khi quét cụm chương.'
            );
          }

          // Principle #5: AI never overwrites approved terms or known aliases
          const uniqueBatch: GlossaryEntry[] = [];
          const returnedTerms = Array.isArray(data.terms) ? data.terms : [];
          returnedTerms.forEach(
            (
              t: {
                sourceTerm?: string;
                targetTerm?: string;
                aliases?: string[];
                policy?: GlossaryPolicy;
                category?: GlossaryCategory;
                notes?: string;
              },
              i: number
            ) => {
              const src = (t.sourceTerm || '').normalize('NFC').trim();
              const tgt = (t.targetTerm || '').normalize('NFC').trim();
              if (!src || !tgt) return;
              if (preScanKnownTermsRef.current.has(src)) return;

              const cleanAliases = Array.isArray(t.aliases)
                ? t.aliases
                    .map((a) => String(a || '').normalize('NFC').trim())
                    .filter((a) => a && a !== src && !preScanKnownTermsRef.current.has(a))
                : [];

              preScanKnownTermsRef.current.add(src);
              cleanAliases.forEach((a) => preScanKnownTermsRef.current.add(a));

              uniqueBatch.push({
                id: `gl-prescan-${Date.now()}-${chunkIdx}-${i}`,
                novelId,
                sourceTerm: src,
                targetTerm: tgt,
                aliases: cleanAliases.length > 0 ? cleanAliases : undefined,
                policy: t.policy || 'force',
                firstChapter: firstChapterNum,
                category: t.category || 'character',
                notes: (t.notes || '').trim(),
                status: 'draft',
                enabled: true,
                source: 'ai',
                updatedAt: Date.now(),
              });
            }
          );

          if (uniqueBatch.length > 0) {
            preScanAddedCountRef.current += uniqueBatch.length;
            await onSaveGlossaryBulk(uniqueBatch);
          }

          logger.info(
            'GLOSSARY_SCAN',
            `[Worker] Gói ${chunkIdx + 1}/${chunks.length} (${chapterRangeLabel}) hoàn tất: AI trả ${returnedTerms.length} mục → lọc trùng còn +${uniqueBatch.length} mục mới`,
            {
              chunkIndex: chunkIdx + 1,
              returnedCount: returnedTerms.length,
              addedUniqueCount: uniqueBatch.length,
              totalAddedSoFar: preScanAddedCountRef.current,
              modelUsed: data.modelUsed,
              keyUsed: data.keyUsed,
              durationMs: res.durationMs,
            },
            res.reqId
          );

          preScanCompletedRef.current += 1;
          setPreScanProgress((prev) => ({
            ...prev,
            completedChunks: preScanCompletedRef.current,
            newTermsAdded: preScanAddedCountRef.current,
            lastModelUsed: data.modelUsed || modelConfig.selectedModel,
            lastKeyUsed:
              typeof data.keyUsed === 'number' ? data.keyUsed : prev.lastKeyUsed,
          }));
        } catch (err) {
          const isAborted =
            controller.signal.aborted ||
            (err instanceof Error && err.name === 'AbortError');
          if (isAborted) {
            logger.warn(
              'GLOSSARY_SCAN',
              `[Worker] Đã hủy (Abort) gói ${chunkIdx + 1}/${chunks.length}`
            );
            break;
          }
          logger.error(
            'GLOSSARY_SCAN',
            `[Worker] Gói ${chunkIdx + 1}/${chunks.length} (${chapterRangeLabel}) gặp lỗi: ${(err as Error).message}`,
            err
          );
          setExtractError((err as Error).message);
        } finally {
          preScanAbortMapRef.current.delete(chunkIdx);
          setPreScanProgress((prev) => ({
            ...prev,
            activeWorkers: Math.max(0, prev.activeWorkers - 1),
          }));
        }
      }
    };

    const remaining = Math.max(
      0,
      chunks.length - preScanCursorRef.current
    );
    if (remaining <= 0) {
      preScanStatusRef.current = 'idle';
      setPreScanStatus('idle');
      return;
    }

    const workers = Array.from(
      { length: Math.min(concurrency, remaining) },
      () => worker()
    );
    await Promise.all(workers);

    if (
      preScanStatusRef.current === 'running' &&
      preScanCursorRef.current >= chunks.length
    ) {
      preScanStatusRef.current = 'idle';
      setPreScanStatus('idle');
      logger.info(
        'GLOSSARY_SCAN',
        `Hoàn tất toàn bộ tiến trình Quét Dựng Từ Điển! Đã thêm +${preScanAddedCountRef.current} thuật ngữ mới trên ${chunks.length} gói.`
      );
      triggerGlossaryToast(
        `Hoàn tất Quét Dựng Từ Điển Trước Khi Dịch! Đã bổ sung +${preScanAddedCountRef.current} thuật ngữ mới (Không ghi đè dữ liệu đã duyệt).`
      );
    }
  };

  const handleStartPreScanGlossary = async () => {
    if (preScanStatusRef.current === 'running') return;
    const targets = getPreScanTargetChapters();
    if (targets.length === 0) {
      setExtractError(
        'Không có chương nào có nội dung tiếng Trung trong phạm vi bạn chọn để quét.'
      );
      return;
    }

    const size = Math.max(1, Math.min(10, preScanChunkSize));
    const chunks: Chapter[][] = [];
    for (let i = 0; i < targets.length; i += size) {
      chunks.push(targets.slice(i, i + size));
    }

    logger.info(
      'GLOSSARY_SCAN',
      `Khởi chạy Quét Dựng Từ Điển Trước Khi Dịch: ${targets.length} chương chia thành ${chunks.length} gói (${size} chương/gói, ${modelConfig.concurrency} luồng song song, model=${modelConfig.selectedModel})`,
      {
        scope: preScanScope,
        totalChapters: targets.length,
        chunkSize: size,
        totalChunks: chunks.length,
        concurrency: modelConfig.concurrency,
        selectedModel: modelConfig.selectedModel,
        fallbackModel: modelConfig.fallbackModel,
      }
    );

    preScanChunksRef.current = chunks;
    preScanCursorRef.current = 0;
    preScanCompletedRef.current = 0;
    preScanAddedCountRef.current = 0;
    const knownSet = new Set<string>();
    glossary.forEach((g) => {
      getEntrySourceForms(g).forEach((f) => knownSet.add(f));
    });
    preScanKnownTermsRef.current = knownSet;
    setExtractError(null);
    preScanStatusRef.current = 'running';
    setPreScanStatus('running');
    setPreScanProgress({
      completedChunks: 0,
      totalChunks: chunks.length,
      totalChapters: targets.length,
      newTermsAdded: 0,
      activeWorkers: 0,
    });

    await runPreScanWorkerLoop();
  };

  const handlePausePreScan = () => {
    if (preScanStatusRef.current !== 'running') return;
    preScanStatusRef.current = 'paused';
    setPreScanStatus('paused');
    logger.info('GLOSSARY_SCAN', 'Người dùng tạm dừng tiến trình Quét Từ Điển');
    triggerGlossaryToast('Đã tạm dừng tiến trình Quét Từ Điển. Bấm Tiếp tục khi sẵn sàng!');
  };

  const handleResumePreScan = async () => {
    if (preScanStatusRef.current !== 'paused') return;
    setExtractError(null);
    preScanStatusRef.current = 'running';
    setPreScanStatus('running');
    logger.info(
      'GLOSSARY_SCAN',
      `Tiếp tục tiến trình Quét Từ Điển từ gói ${preScanCursorRef.current + 1}/${preScanChunksRef.current.length}`
    );
    await runPreScanWorkerLoop();
  };

  const handleHardStopPreScan = () => {
    preScanStatusRef.current = 'idle';
    setPreScanStatus('idle');
    for (const [, ctrl] of preScanAbortMapRef.current.entries()) {
      try {
        ctrl.abort();
      } catch {
        // Ignore
      }
    }
    preScanAbortMapRef.current.clear();
    logger.warn(
      'GLOSSARY_SCAN',
      `Dừng hẳn (Hard Stop) tiến trình Quét Từ Điển. Đã lưu được +${preScanAddedCountRef.current} thuật ngữ.`
    );
    triggerGlossaryToast(
      `Đã dừng hẳn tiến trình quét (Giữ lại +${preScanAddedCountRef.current} thuật ngữ đã quét được).`
    );
  };

  // Compute local 0.5ms contextual match for currently open chapter (including Temporal chapterNumber & aliases)
  const activeChapterContextualMatch = filterContextualGlossary(
    glossary,
    activeChapter ? `${activeChapter.titleRaw}\n${activeChapter.rawContent}` : '',
    activeChapter?.translatedContent || '',
    activeChapter?.chapterNumber
  );

  const pinnedGlossaryCount = glossary.filter((g) => g.pinned).length;
  const aiScannedGlossaryCount = glossary.filter((g) => g.source === 'ai').length;
  const draftGlossaryCount = glossary.filter((g) => g.status === 'draft').length;
  const rawChaptersCount = chapters.filter((c) => c.status === 'raw').length;
  const preScanTargetPreviewCount = getPreScanTargetChapters().length;

  const filteredGlossary = glossary.filter((g) => {
    if (
      glossaryScopeFilter === 'in_active_chapter' &&
      !activeChapterContextualMatch.matchedInTextIds.has(g.id)
    ) {
      return false;
    }
    if (glossaryScopeFilter === 'pinned' && !g.pinned) {
      return false;
    }
    if (glossaryScopeFilter === 'ai_scanned' && g.source !== 'ai') {
      return false;
    }
    if (glossaryScopeFilter === 'draft' && g.status !== 'draft') {
      return false;
    }
    if (categoryFilter !== 'all' && g.category !== categoryFilter) return false;
    if (!glossarySearch.trim()) return true;
    const q = glossarySearch.toLowerCase();
    const aliasMatch = (g.aliases || []).some((a) => a.toLowerCase().includes(q));
    const forbiddenMatch = (g.forbiddenTranslations || []).some((f) =>
      f.toLowerCase().includes(q)
    );
    return (
      g.sourceTerm.toLowerCase().includes(q) ||
      g.targetTerm.toLowerCase().includes(q) ||
      g.notes.toLowerCase().includes(q) ||
      aliasMatch ||
      forbiddenMatch
    );
  });

  const qaRules = modelConfig.qaRules || DEFAULT_QA_VALIDATION_RULES;

  // Format multi-line raw keys into numbered .env lines (1 line = 1 variable)
  const formattedEnvLines = rawMultilineKeys
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .slice(0, 50)
    .map((line, index) => {
      const eqIdx = line.indexOf('=');
      const cleanVal =
        eqIdx !== -1
          ? line
              .slice(eqIdx + 1)
              .trim()
              .replace(/^["']|["']$/g, '')
          : line.replace(/^["']|["']$/g, '');
      return `GEMINI_API_KEY_${index + 1}=${cleanVal}`;
    })
    .join('\n');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-[#E5DEC9] bg-[#FBF8F1] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E5DEC9] bg-[#F3EFE6] px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#8C2D19] text-white">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold text-[#1C1917]">
                Quản Lý Preset Dịch &amp; Biên Tập AI, Glossary (Mặc Định Tắt) &amp; Model Alias
              </h2>
              <p className="text-xs text-[#605A52]">
                Structured Output theo Block ID (TITLE, P0001..Pxxxx) • 1 Request = 1 Chương • Chỉ gửi Glossary khi bạn bật công tắc
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#605A52] hover:bg-[#E5DEC9]/60 hover:text-[#1C1917]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center justify-between border-b border-[#E5DEC9] bg-[#F3EFE6]/60 px-6">
          <div className="flex">
            <button
              onClick={() => setActiveTab('instructions')}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition ${
                activeTab === 'instructions'
                  ? 'border-[#8C2D19] text-[#8C2D19]'
                  : 'border-transparent text-[#605A52] hover:text-[#1C1917]'
              }`}
            >
              <Sliders className="h-4 w-4" />
              1. Preset Dịch &amp; Preset Biên Tập AI ({instructions.length})
            </button>
            <button
              onClick={() => setActiveTab('glossary')}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition ${
                activeTab === 'glossary'
                  ? 'border-[#8C2D19] text-[#8C2D19]'
                  : 'border-transparent text-[#605A52] hover:text-[#1C1917]'
              }`}
            >
              <BookMarked className="h-4 w-4" />
              2. Bảng Glossary ({glossary.length}) —{' '}
              <span
                className={
                  includeGlossaryForNovel
                    ? 'font-bold text-[#1E6F50]'
                    : 'font-bold text-[#605A52]'
                }
              >
                {includeGlossaryForNovel ? 'ĐANG BẬT' : 'MẶC ĐỊNH TẮT'}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('model_keys')}
              className={`flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition ${
                activeTab === 'model_keys'
                  ? 'border-[#8C2D19] text-[#8C2D19]'
                  : 'border-transparent text-[#605A52] hover:text-[#1C1917]'
              }`}
            >
              <Cpu className="h-4 w-4" />
              3. Chọn Model Alias, Ngưỡng QA &amp; Xoay 50 Key
            </button>
          </div>

          {/* Global Glossary Send Toggle Pill */}
          <button
            onClick={() => onToggleIncludeGlossaryForNovel(!includeGlossaryForNovel)}
            className={`my-1.5 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold transition ${
              includeGlossaryForNovel
                ? 'border-[#1E6F50] bg-[#1E6F50]/15 text-[#1E6F50]'
                : 'border-[#C9B99A] bg-white text-[#605A52]'
            }`}
            title="Mặc định TẮT khi dịch hoặc biên tập AI. Chỉ khi BẬT công tắc này thì bảng Glossary mới được gửi đi trong request."
          >
            {includeGlossaryForNovel ? (
              <ToggleRight className="h-4 w-4 text-[#1E6F50]" />
            ) : (
              <ToggleLeft className="h-4 w-4 text-[#605A52]" />
            )}
            Gửi Glossary trong Request:{' '}
            <span>{includeGlossaryForNovel ? 'BẬT' : 'TẮT (Mặc định)'}</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* TAB 1: SYSTEM INSTRUCTIONS (TRANSLATION PRESETS & EDITORIAL PRESETS) */}
          {activeTab === 'instructions' && (
            <div className="space-y-4">
              {/* Role Sub-Tabs: Preset Dịch vs Preset Biên Tập AI */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E5DEC9] bg-white p-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setRoleSubTab('translation')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition ${
                      roleSubTab === 'translation'
                        ? 'bg-[#8C2D19] text-white shadow-2xs'
                        : 'bg-[#F3EFE6] text-[#605A52] hover:text-[#1C1917]'
                    }`}
                  >
                    <Sliders className="h-3.5 w-3.5" />
                    Thư Viện Preset Dịch Chương (Phụ lục A)
                  </button>
                  <button
                    onClick={() => setRoleSubTab('editorial')}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold transition ${
                      roleSubTab === 'editorial'
                        ? 'bg-[#8C2D19] text-white shadow-2xs'
                        : 'bg-[#F3EFE6] text-[#605A52] hover:text-[#1C1917]'
                    }`}
                  >
                    <Wand2 className="h-3.5 w-3.5" />
                    Thư Viện Preset Biên Tập AI (Phụ lục B)
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    ref={mdFileInputRef}
                    type="file"
                    accept=".md,.txt,text/markdown,text/plain"
                    onChange={handleImportProfileMarkdown}
                    className="hidden"
                  />
                  <button
                    onClick={() => mdFileInputRef.current?.click()}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-2.5 py-1.5 text-xs font-semibold text-[#1C1917] hover:bg-[#F3EFE6]"
                  >
                    <FileUp className="h-3.5 w-3.5 text-[#8C2D19]" />
                    Nhập file .MD
                  </button>
                  <button
                    onClick={handleExportProfileMarkdown}
                    className="inline-flex items-center gap-1 rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-2.5 py-1.5 text-xs font-semibold text-[#1C1917] hover:bg-[#F3EFE6]"
                  >
                    <FileDown className="h-3.5 w-3.5 text-[#8C2D19]" />
                    Xuất file .MD
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                {/* Left list of profiles for active role */}
                <div className="space-y-3 lg:col-span-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold tracking-wider text-[#605A52] uppercase">
                      {roleSubTab === 'editorial'
                        ? `Preset Biên Tập AI (${profilesForCurrentRole.length})`
                        : `Preset Dịch Thuật (${profilesForCurrentRole.length})`}
                    </span>
                    <button
                      onClick={handleCreateNewProfile}
                      className="inline-flex items-center gap-1 rounded-md bg-[#8C2D19] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#722211]"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Tạo mới
                    </button>
                  </div>

                  <div className="space-y-2">
                    {profilesForCurrentRole.map((inst) => {
                      const isSelected = editingProfile?.id === inst.id;
                      const isActiveForNovel =
                        roleSubTab === 'editorial'
                          ? activeEditorialId === inst.id
                          : activeInstructionId === inst.id;
                      return (
                        <div
                          key={inst.id}
                          onClick={() => {
                            setEditingProfile({ ...inst });
                            if (roleSubTab === 'editorial') {
                              onSelectEditorialInstruction(inst.id);
                            } else {
                              onSelectInstruction(inst.id);
                            }
                          }}
                          className={`cursor-pointer rounded-lg border p-3 transition ${
                            isSelected
                              ? 'border-[#8C2D19] bg-[#8C2D19]/8 shadow-xs'
                              : 'border-[#E5DEC9] bg-white hover:border-[#C9B99A]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="text-xs font-bold text-[#1C1917]">{inst.name}</h4>
                            {isActiveForNovel && (
                              <span className="shrink-0 rounded bg-[#1E6F50]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#1E6F50]">
                                Đang áp dụng
                              </span>
                            )}
                          </div>
                          <p className="mt-1 line-clamp-2 text-[11px] text-[#605A52]">
                            {inst.description}
                          </p>
                          <div className="mt-2 flex items-center gap-2 text-[10px] text-[#8C2D19]">
                            <span className="rounded bg-[#F3EFE6] px-1.5 py-0.5 font-medium">
                              {inst.genreTag}
                            </span>
                            {inst.autoUpdate === false && (
                              <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-900">
                                Đã khóa sửa đổi tự động
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right editor for selected profile */}
                <div className="space-y-4 lg:col-span-8">
                  {editingProfile && (
                    <div className="rounded-xl border border-[#E5DEC9] bg-white p-5 shadow-xs">
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[#E5DEC9] pb-3">
                        <div>
                          <span className="text-xs font-bold text-[#8C2D19] uppercase">
                            {roleSubTab === 'editorial'
                              ? 'CHỈNH SỬA PRESET BIÊN TẬP AI'
                              : 'CHỈNH SỬA PRESET SYSTEM INSTRUCTIONS DỊCH'}
                          </span>
                          <p className="text-[11px] text-[#605A52]">
                            Nội dung bên dưới được truyền vào{' '}
                            <code className="font-mono text-[#8C2D19]">
                              config.systemInstruction
                            </code>{' '}
                            cùng Structured Output theo Block ID.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleDuplicateProfile}
                            className="inline-flex items-center gap-1 rounded-md border border-[#E5DEC9] bg-[#FBF8F1] px-2.5 py-1.5 text-xs font-medium text-[#1C1917] hover:bg-[#F3EFE6]"
                          >
                            <Copy className="h-3.5 w-3.5" />
                            Nhân bản
                          </button>
                          {!editingProfile.isDefault &&
                            profilesForCurrentRole.length > 1 && (
                              <button
                                onClick={() => onDeleteInstruction(editingProfile.id)}
                                className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Xóa
                              </button>
                            )}
                          <button
                            onClick={handleSaveCurrentProfile}
                            className="inline-flex items-center gap-1.5 rounded-md bg-[#8C2D19] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#722211]"
                          >
                            <Check className="h-3.5 w-3.5" />
                            {savedNotice ? 'Đã lưu & Áp dụng!' : 'Lưu & Áp dụng Preset'}
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                            Tên Preset
                          </label>
                          <input
                            type="text"
                            value={editingProfile.name}
                            onChange={(e) =>
                              setEditingProfile({
                                ...editingProfile,
                                name: e.target.value,
                              })
                            }
                            className="w-full rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-3 py-2 text-xs text-[#1C1917] focus:border-[#8C2D19] focus:outline-hidden"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                            Nhãn thể loại / Vai trò
                          </label>
                          <input
                            type="text"
                            value={editingProfile.genreTag}
                            onChange={(e) =>
                              setEditingProfile({
                                ...editingProfile,
                                genreTag: e.target.value,
                              })
                            }
                            className="w-full rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-3 py-2 text-xs text-[#1C1917] focus:border-[#8C2D19] focus:outline-hidden"
                          />
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                            Quy tắc đại từ nhân xưng chủ đạo
                          </label>
                          <input
                            type="text"
                            value={editingProfile.pronounRule}
                            onChange={(e) =>
                              setEditingProfile({
                                ...editingProfile,
                                pronounRule: e.target.value,
                              })
                            }
                            className="w-full rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-3 py-2 text-xs text-[#1C1917] focus:border-[#8C2D19] focus:outline-hidden"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                            Mô tả ngắn
                          </label>
                          <input
                            type="text"
                            value={editingProfile.description}
                            onChange={(e) =>
                              setEditingProfile({
                                ...editingProfile,
                                description: e.target.value,
                              })
                            }
                            className="w-full rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-3 py-2 text-xs text-[#1C1917] focus:border-[#8C2D19] focus:outline-hidden"
                          />
                        </div>
                      </div>

                      <div className="mt-4">
                        <label className="mb-1.5 block text-xs font-semibold text-[#1C1917]">
                          Nội dung System Instructions gửi cho AI (Toàn quyền biên soạn)
                        </label>
                        <textarea
                          rows={13}
                          value={editingProfile.systemInstruction}
                          onChange={(e) =>
                            setEditingProfile({
                              ...editingProfile,
                              systemInstruction: e.target.value,
                            })
                          }
                          className="w-full rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] p-3 font-mono text-xs leading-relaxed text-[#1C1917] focus:border-[#8C2D19] focus:outline-hidden"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: GLOSSARY MANAGER (DEFAULT OFF + 2-PHASE PRE-SCAN BEFORE PARALLEL TRANSLATION) */}
          {activeTab === 'glossary' && (
            <div className="space-y-4">
              {/* Top Status & Explicit Default-OFF Toggle Banner */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E5DEC9] bg-white p-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-[#1C1917]">
                      Từ Điển Tiền Kỳ &amp; Ma Trận Xưng Hô ({glossary.length} mục)
                    </h3>
                    <button
                      type="button"
                      onClick={() => onToggleIncludeGlossaryForNovel(!includeGlossaryForNovel)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
                        includeGlossaryForNovel
                          ? 'border-[#1E6F50] bg-[#1E6F50]/15 text-[#1E6F50]'
                          : 'border-[#C9B99A] bg-[#FBF8F1] text-[#605A52] hover:text-[#1C1917]'
                      }`}
                      title="Bấm để Bật hoặc Tắt gửi kèm bảng Glossary khi dịch và biên tập AI"
                    >
                      {includeGlossaryForNovel ? (
                        <ToggleRight className="h-4 w-4 text-[#1E6F50]" />
                      ) : (
                        <ToggleLeft className="h-4 w-4 text-[#605A52]" />
                      )}
                      Glossary: {includeGlossaryForNovel ? 'ĐANG BẬT' : 'ĐANG TẮT'}
                    </button>
                    {activeChapter && (
                      <span className="rounded bg-[#F3EFE6] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#8C2D19]">
                        Khớp Chương #{activeChapter.orderPrefix}:{' '}
                        {activeChapterContextualMatch.matchedInTextCount} từ +{' '}
                        {activeChapterContextualMatch.pinnedCount} ghim
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#605A52]">
                    Quy trình chuẩn cho <strong>Dịch Song Song Đa Luồng</strong>: Mặc định Glossary{' '}
                    <strong>TẮT</strong>. Khi cần đồng bộ tên riêng tuyệt đối, hãy dùng{' '}
                    <strong>Pha 1 (Quét Dựng Trước Đa Chương)</strong> bên dưới để gom sạch nhân vật/địa danh trước, duyệt lại rồi bật công tắc để{' '}
                    <strong>Pha 2 (Dịch Song Song)</strong> tự động lọc đúng các từ xuất hiện trong từng chương!
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    ref={glossaryFileInputRef}
                    type="file"
                    accept=".json,.txt,.csv,.tsv"
                    onChange={handleImportGlossaryFile}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => glossaryFileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#8C2D19]/30 bg-[#8C2D19]/10 px-3 py-2 text-xs font-semibold text-[#8C2D19] hover:bg-[#8C2D19]/20"
                    title="Chọn file .JSON, .TXT (Names.txt / Hán=Việt) hoặc .CSV từ máy tính"
                  >
                    <FileUp className="h-3.5 w-3.5" />
                    Nhập File (.JSON / .TXT / .CSV)
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowBulkBox(!showBulkBox)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-3 py-2 text-xs font-medium text-[#1C1917] hover:bg-[#F3EFE6]"
                  >
                    <Upload className="h-3.5 w-3.5 text-[#8C2D19]" />
                    Dán nhanh (Hán=Việt / JSON)
                  </button>
                  <button
                    type="button"
                    onClick={handleExportGlossaryJson}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-3 py-2 text-xs font-medium text-[#1C1917] hover:bg-[#F3EFE6]"
                    title="Xuất toàn bộ từ điển ra chuẩn .JSON (Giữ đầy đủ Phân loại, Ghi chú xưng hô & trạng thái Ghim)"
                  >
                    <FileDown className="h-3.5 w-3.5 text-[#1E6F50]" />
                    Xuất .JSON
                  </button>
                  <button
                    type="button"
                    onClick={handleExportGlossaryText}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-3 py-2 text-xs font-medium text-[#1C1917] hover:bg-[#F3EFE6]"
                    title="Xuất file .TXT dạng Hán=Việt tương thích QuickTranslator"
                  >
                    <Download className="h-3.5 w-3.5 text-[#8C2D19]" />
                    Xuất .TXT
                  </button>
                </div>
              </div>

              {/* PHASE 1: MULTI-CHAPTER PARALLEL PRE-SCAN BUILDER (COLLAPSIBLE) */}
              <div className="rounded-xl border border-[#C9B99A] bg-[#F3EFE6]/70 p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPreScanExpanded((prev) => !prev)}
                    className="flex items-center gap-2 text-left"
                  >
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#8C2D19] text-white">
                      <Layers className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold tracking-wider text-[#1C1917] uppercase">
                          Pha 1: AI Quét Gộp Đa Chương Dựng Từ Điển Trước Khi Dịch
                        </h4>
                        <span className="inline-flex items-center gap-0.5 rounded border border-[#C9B99A] bg-white px-1.5 py-0.5 text-[10px] font-semibold text-[#605A52]">
                          {isPreScanExpanded ? (
                            <>
                              Thu gọn <ChevronUp className="h-3 w-3" />
                            </>
                          ) : (
                            <>
                              Mở rộng ({preScanTargetPreviewCount} ch • {preScanChunkSize} ch/lô){' '}
                              <ChevronDown className="h-3 w-3" />
                            </>
                          )}
                        </span>
                      </div>
                      {isPreScanExpanded && (
                        <p className="text-[11px] text-[#605A52]">
                          Gộp nhiều chương/request + chạy song song qua Bể 50 Key ({modelConfig.concurrency} luồng) để dựng Ma trận Nhân vật, Xưng hô &amp; Địa danh trước khi dịch hàng loạt.
                        </p>
                      )}
                    </div>
                  </button>

                  {/* Action Controls for Pre-Scan */}
                  <div className="flex flex-wrap items-center gap-2">
                    {preScanStatus === 'idle' && (
                      <button
                        type="button"
                        onClick={handleStartPreScanGlossary}
                        disabled={preScanTargetPreviewCount === 0}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-[#8C2D19] px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition hover:bg-[#722211] disabled:opacity-50"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        Quét Dựng Trước ({preScanTargetPreviewCount} chương •{' '}
                        {Math.ceil(preScanTargetPreviewCount / preScanChunkSize)} gói API)
                      </button>
                    )}

                    {preScanStatus === 'running' && (
                      <>
                        <button
                          type="button"
                          onClick={handlePausePreScan}
                          className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700"
                        >
                          <Pause className="h-3.5 w-3.5" />
                          Tạm dừng quét
                        </button>
                        <button
                          type="button"
                          onClick={handleHardStopPreScan}
                          className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Dừng hẳn
                        </button>
                      </>
                    )}

                    {preScanStatus === 'paused' && (
                      <>
                        <button
                          type="button"
                          onClick={handleResumePreScan}
                          className="inline-flex items-center gap-1 rounded-lg bg-[#1E6F50] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#16563D]"
                        >
                          <Play className="h-3.5 w-3.5" />
                          Tiếp tục quét ({preScanProgress.completedChunks}/
                          {preScanProgress.totalChunks} gói)
                        </button>
                        <button
                          type="button"
                          onClick={handleHardStopPreScan}
                          className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Dừng hẳn
                        </button>
                      </>
                    )}
                    {onOpenTerminal && (
                      <button
                        type="button"
                        onClick={onOpenTerminal}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[#C9B99A] bg-[#FBF8F1] px-2.5 py-1.5 text-xs font-semibold text-[#1C1917] shadow-2xs transition hover:bg-[#E5DEC9]/60"
                        title="Mở bảng Terminal Log tích hợp ngay bên dưới màn hình để theo dõi chi tiết từng gói quét & phản hồi từ Server"
                      >
                        <Terminal className="h-3.5 w-3.5 text-[#8C2D19]" />
                        Mở Terminal Log
                      </button>
                    )}
                  </div>
                </div>

                {isPreScanExpanded && (
                  <>

                {/* Scope & Chunk Size Configuration */}
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-12">
                  <div className="sm:col-span-5">
                    <label className="mb-1 block text-[11px] font-semibold text-[#1C1917]">
                      Phạm vi chương cần quét dựng trước
                    </label>
                    <select
                      value={preScanScope}
                      disabled={preScanStatus !== 'idle'}
                      onChange={(e) =>
                        setPreScanScope(
                          e.target.value as 'raw' | 'selected' | 'active' | 'range' | 'all'
                        )
                      }
                      className="w-full rounded-lg border border-[#E5DEC9] bg-white px-2.5 py-1.5 text-xs font-medium text-[#1C1917]"
                    >
                      <option value="raw">
                        Tất cả chương chưa dịch ({rawChaptersCount} chương)
                      </option>
                      <option value="selected">
                        Các chương đang tick chọn ({selectedChapterIds?.size || 0} chương)
                      </option>
                      <option value="active">
                        Chỉ chương đang mở ({activeChapter ? `#${activeChapter.orderPrefix}` : 'Chưa chọn'})
                      </option>
                      <option value="range">Theo khoảng số thứ tự chương (Từ X đến Y)</option>
                      <option value="all">
                        Toàn bộ chương trong truyện ({chapters.length} chương)
                      </option>
                    </select>
                  </div>

                  {preScanScope === 'range' && (
                    <div className="grid grid-cols-2 gap-2 sm:col-span-3">
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold text-[#1C1917]">
                          Từ chương #
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={preScanFromNum}
                          onChange={(e) => setPreScanFromNum(e.target.value)}
                          className="w-full rounded-lg border border-[#E5DEC9] bg-white px-2.5 py-1.5 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[11px] font-semibold text-[#1C1917]">
                          Đến chương #
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={preScanToNum}
                          onChange={(e) => setPreScanToNum(e.target.value)}
                          className="w-full rounded-lg border border-[#E5DEC9] bg-white px-2.5 py-1.5 font-mono text-xs"
                        />
                      </div>
                    </div>
                  )}

                  <div className={preScanScope === 'range' ? 'sm:col-span-4' : 'sm:col-span-7'}>
                    <label className="mb-1 block text-[11px] font-semibold text-[#1C1917]">
                      Số chương gộp mỗi gói API (Tiết kiệm 80% Quota &amp; tăng tốc)
                    </label>
                    <select
                      value={preScanChunkSize}
                      disabled={preScanStatus !== 'idle'}
                      onChange={(e) => setPreScanChunkSize(Number(e.target.value))}
                      className="w-full rounded-lg border border-[#E5DEC9] bg-white px-2.5 py-1.5 text-xs font-medium text-[#1C1917]"
                    >
                      <option value={1}>1 chương / 1 gói API (Quét kỹ từng chương)</option>
                      <option value={3}>3 chương / 1 gói API (Cân bằng chi tiết)</option>
                      <option value={5}>
                        5 chương / 1 gói API (Khuyên dùng — Nhanh gấp 5 lần)
                      </option>
                      <option value={8}>
                        8 chương / 1 gói API (Siêu tốc cho truyện dài)
                      </option>
                    </select>
                  </div>
                </div>

                {/* Live Pre-Scan Progress Bar */}
                {(preScanStatus !== 'idle' || preScanProgress.newTermsAdded > 0) && (
                  <div className="rounded-lg border border-[#E5DEC9] bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 font-semibold text-[#1C1917]">
                        <span>
                          {preScanStatus === 'running'
                            ? `Đang quét gói ${preScanProgress.completedChunks}/${preScanProgress.totalChunks} (${preScanProgress.totalChapters} chương) • ${preScanProgress.activeWorkers} luồng đang chạy`
                            : preScanStatus === 'paused'
                              ? `Đang TẠM DỪNG ở gói ${preScanProgress.completedChunks}/${preScanProgress.totalChunks}`
                              : `Đã hoàn tất quét ${preScanProgress.completedChunks}/${preScanProgress.totalChunks} gói`}
                        </span>
                        <span className="rounded bg-[#1E6F50]/15 px-2 py-0.5 font-mono text-[11px] font-bold text-[#1E6F50]">
                          +{preScanProgress.newTermsAdded} thuật ngữ mới
                        </span>
                        {preScanProgress.lastModelUsed && (
                          <span className="rounded bg-[#8C2D19]/12 px-2 py-0.5 font-mono text-[10px] font-bold text-[#8C2D19]">
                            {preScanProgress.lastModelUsed}
                            {preScanProgress.lastKeyUsed
                              ? ` • Key #${preScanProgress.lastKeyUsed}`
                              : ''}
                          </span>
                        )}
                      </div>

                      {!includeGlossaryForNovel && preScanProgress.newTermsAdded > 0 && (
                        <button
                          type="button"
                          onClick={() => onToggleIncludeGlossaryForNovel(true)}
                          className="inline-flex items-center gap-1 rounded-md bg-[#1E6F50] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#16563D]"
                        >
                          <ToggleRight className="h-3.5 w-3.5" />
                          Bật gửi Glossary ngay để đi dịch song song
                        </button>
                      )}
                    </div>
                    {preScanProgress.totalChunks > 0 && (
                      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[#E5DEC9]">
                        <div
                          className="h-full bg-[#8C2D19] transition-all duration-300"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.round(
                                (preScanProgress.completedChunks /
                                  Math.max(1, preScanProgress.totalChunks)) *
                                  100
                              )
                            )}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}
                  </>
                )}
              </div>

              {extractError && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
                  <span className="flex-1 font-medium">{extractError}</span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {onOpenTerminal && (
                      <button
                        type="button"
                        onClick={onOpenTerminal}
                        className="inline-flex items-center gap-1 rounded bg-zinc-900 px-2.5 py-1 font-mono text-[11px] font-bold text-emerald-300 hover:bg-zinc-800"
                      >
                        <Terminal className="h-3 w-3 text-emerald-400" />
                        Xem chi tiết trong Terminal
                      </button>
                    )}
                    {modelConfig.selectedModel !== 'gemini-3.1-flash-lite' && (
                      <button
                        type="button"
                        onClick={() => {
                          onChangeModelConfig({
                            ...modelConfig,
                            selectedModel: 'gemini-3.1-flash-lite',
                          });
                          setExtractError(null);
                        }}
                        className="rounded bg-amber-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-amber-700"
                      >
                        Đổi sang gemini-3.1-flash-lite &amp; Quét tiếp
                      </button>
                    )}
                  </div>
                </div>
              )}

              {glossaryToast && (
                <div className="rounded-lg border border-[#1E6F50]/30 bg-[#1E6F50]/12 px-4 py-2 text-xs font-semibold text-[#1E6F50]">
                  {glossaryToast}
                </div>
              )}

              {showBulkBox && (
                <div className="rounded-xl border border-[#C9B99A] bg-[#F3EFE6] p-4">
                  <label className="mb-1 block text-xs font-bold text-[#1C1917]">
                    Dán danh sách thuật ngữ (Tự nhận diện: Hán|Bí_danh=Việt&#9;Phân_loại&#9;Ghi_chú&#9;Policy&#9;Cấm_dịch, CSV 10 cột chuẩn TBX, hoặc JSON)
                  </label>
                  <textarea
                    rows={6}
                    placeholder={`姜望|姜青羊=Khương Vọng\tcharacter\tNam chính, xưng Ta - Ngươi\tpin\tforce\tKhuong Vong\t1-9999\n左光烈=Tả Quang Liệt\tcharacter\tSư huynh của Khương Vọng\n枫林城=Phong Lâm Thành\tlocation\tThành trì nước Trang\n遊脈境=Du Mạch Cảnh\tcultivation\tCảnh giới mở đạo mạch`}
                    value={bulkGlossaryText}
                    onChange={(e) => setBulkGlossaryText(e.target.value)}
                    className="w-full rounded-lg border border-[#E5DEC9] bg-white p-2.5 font-mono text-xs text-[#1C1917]"
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      onClick={() => setShowBulkBox(false)}
                      className="rounded-md px-3 py-1.5 text-xs text-[#605A52] hover:bg-[#E5DEC9]"
                    >
                      Đóng
                    </button>
                    <button
                      onClick={handleBulkGlossaryImport}
                      className="rounded-md bg-[#1E6F50] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#16563D]"
                    >
                      Lưu vào Từ điển
                    </button>
                  </div>
                </div>
              )}

              {/* Add single glossary row + collapsible advanced rule controls (COLLAPSIBLE) */}
              <div className="space-y-2 rounded-xl border border-[#E5DEC9] bg-white p-3">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setIsManualAddExpanded((prev) => !prev)}
                    className="flex items-center gap-1.5 text-xs font-bold text-[#1C1917] hover:text-[#8C2D19]"
                  >
                    <Plus className="h-3.5 w-3.5 text-[#8C2D19]" />
                    <span>Thêm thuật ngữ thủ công</span>
                    <span className="inline-flex items-center gap-0.5 rounded border border-[#E5DEC9] bg-[#FBF8F1] px-1.5 py-0.5 text-[10px] font-semibold text-[#605A52]">
                      {isManualAddExpanded ? (
                        <>
                          Thu gọn <ChevronUp className="h-3 w-3" />
                        </>
                      ) : (
                        <>
                          Mở rộng <ChevronDown className="h-3 w-3" />
                        </>
                      )}
                    </span>
                  </button>
                </div>

                {isManualAddExpanded && (
                  <>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                  <input
                    type="text"
                    placeholder="Chữ Hán (VD: 姜望 | 姜青羊)"
                    value={newSource}
                    onChange={(e) => setNewSource(e.target.value)}
                    className="rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-3 py-2 text-xs sm:col-span-2"
                    title="Có thể nhập nhiều biến thể chữ Hán cách nhau bởi dấu | (VD: 姜望 | 姜青羊)"
                  />
                  <input
                    type="text"
                    placeholder="Bản dịch Việt (VD: Khương Vọng)"
                    value={newTarget}
                    onChange={(e) => setNewTarget(e.target.value)}
                    className="rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-3 py-2 text-xs sm:col-span-2"
                  />
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as GlossaryCategory)}
                    className="rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-2.5 py-2 text-xs sm:col-span-2"
                  >
                    {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Ghi chú vai vế / xưng hô (VD: Nam chính, xưng Ta - Ngươi)..."
                    value={newNotes}
                    onChange={(e) => setNewNotes(e.target.value)}
                    className="rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-3 py-2 text-xs sm:col-span-3"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdvancedAddRow(!showAdvancedAddRow)}
                    className={`inline-flex items-center justify-center gap-1 rounded-lg border px-2 py-2 text-[11px] font-semibold sm:col-span-1 ${
                      showAdvancedAddRow ||
                      newAliases.trim() ||
                      newForbidden.trim() ||
                      newChapterFrom.trim() ||
                      newChapterTo.trim() ||
                      newPolicy !== 'force'
                        ? 'border-[#8C2D19] bg-[#8C2D19]/10 text-[#8C2D19]'
                        : 'border-[#E5DEC9] bg-[#FBF8F1] text-[#605A52]'
                    }`}
                    title="Mở rộng thiết lập nâng cao: Bí danh (Aliases), Chính sách dịch (Policy), Từ cấm dịch & Giới hạn chương"
                  >
                    Nâng cao
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewPinned(!newPinned)}
                    className={`inline-flex items-center justify-center gap-1 rounded-lg border px-2 py-2 text-xs font-semibold sm:col-span-1 ${
                      newPinned
                        ? 'border-amber-500 bg-amber-100 text-amber-900'
                        : 'border-[#E5DEC9] bg-[#FBF8F1] text-[#605A52]'
                    }`}
                    title="Ghim cố định mục này (Luôn gửi kèm trong mọi chương khi BẬT Glossary)"
                  >
                    <Pin className="h-3.5 w-3.5" />
                    Ghim
                  </button>
                  <button
                    onClick={handleAddGlossaryEntry}
                    className="inline-flex items-center justify-center gap-1 rounded-lg bg-[#8C2D19] px-3 py-2 text-xs font-semibold text-white hover:bg-[#722211] sm:col-span-1"
                  >
                    <Plus className="h-4 w-4" />
                    Thêm
                  </button>
                </div>

                {showAdvancedAddRow && (
                  <div className="grid grid-cols-1 gap-2 border-t border-[#E5DEC9]/80 pt-2.5 sm:grid-cols-12">
                    <div className="sm:col-span-3">
                      <label className="mb-0.5 block text-[10px] font-semibold text-[#605A52]">
                        Bí danh / Biến thể Hán tự (Aliases — cách nhau dấu |)
                      </label>
                      <input
                        type="text"
                        placeholder="VD: 韩老魔 | 韩天尊"
                        value={newAliases}
                        onChange={(e) => setNewAliases(e.target.value)}
                        className="w-full rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-2.5 py-1.5 font-mono text-xs"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <label className="mb-0.5 block text-[10px] font-semibold text-[#605A52]">
                        Chính sách áp đặt (Policy)
                      </label>
                      <select
                        value={newPolicy}
                        onChange={(e) => setNewPolicy(e.target.value as GlossaryPolicy)}
                        className="w-full rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-2.5 py-1.5 text-xs font-medium text-[#1C1917]"
                      >
                        {Object.entries(POLICY_LABELS).map(([k, meta]) => (
                          <option key={k} value={k}>
                            {meta.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-3">
                      <label className="mb-0.5 block text-[10px] font-semibold text-[#605A52]">
                        Cấm dịch thành (Forbidden — cách nhau dấu |)
                      </label>
                      <input
                        type="text"
                        placeholder="VD: Hàn Lập Ma | Hàn Lão Quỷ"
                        value={newForbidden}
                        onChange={(e) => setNewForbidden(e.target.value)}
                        className="w-full rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-2.5 py-1.5 text-xs"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-1.5 sm:col-span-3">
                      <div>
                        <label className="mb-0.5 block text-[10px] font-semibold text-[#605A52]">
                          Hiệu lực từ Ch.#
                        </label>
                        <input
                          type="number"
                          min={0}
                          placeholder="Đầu"
                          value={newChapterFrom}
                          onChange={(e) => setNewChapterFrom(e.target.value)}
                          className="w-full rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-2 py-1.5 font-mono text-xs"
                        />
                      </div>
                      <div>
                        <label className="mb-0.5 block text-[10px] font-semibold text-[#605A52]">
                          Đến Ch.#
                        </label>
                        <input
                          type="number"
                          min={0}
                          placeholder="Cuối"
                          value={newChapterTo}
                          onChange={(e) => setNewChapterTo(e.target.value)}
                          className="w-full rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-2 py-1.5 font-mono text-xs"
                        />
                      </div>
                    </div>
                  </div>
                )}
                  </>
                )}
              </div>

              {/* Scope Tabs + Filter & Search bar */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setGlossaryScopeFilter('all')}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                      glossaryScopeFilter === 'all'
                        ? 'bg-[#8C2D19] text-white'
                        : 'bg-[#F3EFE6] text-[#605A52] hover:text-[#1C1917]'
                    }`}
                  >
                    Tất cả ({glossary.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setGlossaryScopeFilter('in_active_chapter')}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                      glossaryScopeFilter === 'in_active_chapter'
                        ? 'bg-[#1E6F50] text-white'
                        : 'bg-[#F3EFE6] text-[#605A52] hover:text-[#1C1917]'
                    }`}
                  >
                    Có trong Chương #{activeChapter?.orderPrefix || '---'} (
                    {activeChapterContextualMatch.matchedInTextCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setGlossaryScopeFilter('pinned')}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                      glossaryScopeFilter === 'pinned'
                        ? 'bg-amber-600 text-white'
                        : 'bg-[#F3EFE6] text-[#605A52] hover:text-[#1C1917]'
                    }`}
                  >
                    Đã ghim cố định ({pinnedGlossaryCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setGlossaryScopeFilter('ai_scanned')}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                      glossaryScopeFilter === 'ai_scanned'
                        ? 'bg-[#8C2D19] text-white'
                        : 'bg-[#F3EFE6] text-[#605A52] hover:text-[#1C1917]'
                    }`}
                  >
                    Do AI Pre-Scan ({aiScannedGlossaryCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setGlossaryScopeFilter('draft')}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                      glossaryScopeFilter === 'draft'
                        ? 'bg-amber-700 text-white'
                        : 'bg-[#F3EFE6] text-[#605A52] hover:text-[#1C1917]'
                    }`}
                    title="Các thuật ngữ do AI tự trích xuất đang ở trạng thái Chờ duyệt (Nguyên tắc #5: Không ghi đè mục bạn đã duyệt)"
                  >
                    Chờ duyệt ({draftGlossaryCount})
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {draftGlossaryCount > 0 && (
                    <button
                      type="button"
                      onClick={handleApproveAllDraftEntries}
                      className="inline-flex items-center gap-1 rounded-lg border border-[#1E6F50]/40 bg-[#1E6F50]/12 px-2.5 py-1.5 text-xs font-bold text-[#1E6F50] hover:bg-[#1E6F50] hover:text-white"
                      title="Duyệt tất cả mục từ AI Pre-Scan sang trạng thái Chính thức (Approved) và khóa chống ghi đè"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Duyệt tất cả ({draftGlossaryCount})
                    </button>
                  )}

                  {filteredGlossary.length > 0 && onDeleteGlossaryBulk && (
                    <button
                      type="button"
                      onClick={async () => {
                        const ids = filteredGlossary.map((g) => g.id);
                        await onDeleteGlossaryBulk(ids);
                        triggerGlossaryToast(
                          `Đã xóa ${ids.length} thuật ngữ trong danh sách đang lọc!`
                        );
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Xóa {filteredGlossary.length} mục đang lọc
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="relative flex-1">
                  <Search className="absolute top-2.5 left-3 h-4 w-4 text-[#605A52]" />
                  <input
                    type="text"
                    placeholder="Tìm kiếm chữ Hán, bí danh, tên tiếng Việt, từ cấm dịch hoặc ghi chú xưng hô..."
                    value={glossarySearch}
                    onChange={(e) => setGlossarySearch(e.target.value)}
                    className="w-full rounded-lg border border-[#E5DEC9] bg-white py-2 pr-3 pl-9 text-xs text-[#1C1917]"
                  />
                </div>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="rounded-lg border border-[#E5DEC9] bg-white px-3 py-2 text-xs text-[#1C1917]"
                >
                  <option value="all">Tất cả phân loại ({glossary.length})</option>
                  {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Glossary Table with Inline Edit & 1-Click Chapter Sync */}
              <div
                className={`overflow-y-auto rounded-xl border border-[#E5DEC9] bg-white transition-all ${
                  !isPreScanExpanded && !isManualAddExpanded
                    ? 'max-h-[560px]'
                    : !isPreScanExpanded || !isManualAddExpanded
                    ? 'max-h-[460px]'
                    : 'max-h-96'
                }`}
              >
                <table className="w-full border-collapse text-left text-xs">
                  <thead className="sticky top-0 z-10 border-b border-[#E5DEC9] bg-[#F3EFE6] text-[#605A52]">
                    <tr>
                      <th className="px-3 py-2.5 font-semibold">Bật / Ghim</th>
                      <th className="px-3 py-2.5 font-semibold">
                        Nguyên bản (Hán &amp; Bí danh)
                      </th>
                      <th className="px-3 py-2.5 font-semibold">
                        Bản dịch chuẩn &amp; Chính sách
                      </th>
                      <th className="px-3 py-2.5 font-semibold">Phân loại &amp; Phạm vi</th>
                      <th className="px-3 py-2.5 font-semibold">
                        Ghi chú (Vai vế / Xưng hô / Từ cấm)
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold">
                        Duyệt / Sửa / Đồng bộ
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5DEC9]/60">
                    {filteredGlossary.map((item) => {
                      const isEnabled = item.enabled !== false;
                      const isEditing = editingEntryId === item.id;
                      const isMatchedInActive =
                        activeChapterContextualMatch.matchedInTextIds.has(item.id);
                      const isSyncing = syncingEntryId === item.id;
                      const itemPolicy = item.policy || 'force';
                      const policyMeta = POLICY_LABELS[itemPolicy] || POLICY_LABELS.force;

                      if (isEditing) {
                        const targetChanged =
                          editTargetTerm.trim() &&
                          editTargetTerm.trim() !== item.targetTerm.trim();
                        return (
                          <tr key={item.id} className="bg-amber-50/70 align-top">
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => setEditPinned(!editPinned)}
                                className={`inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] font-bold ${
                                  editPinned
                                    ? 'bg-amber-500 text-white'
                                    : 'bg-[#E5DEC9] text-[#605A52]'
                                }`}
                              >
                                <Pin className="h-3 w-3" />
                                {editPinned ? 'Đã ghim' : 'Ghim'}
                              </button>
                            </td>
                            <td className="space-y-1.5 px-3 py-2">
                              <input
                                type="text"
                                value={editSourceTerm}
                                onChange={(e) => setEditSourceTerm(e.target.value)}
                                placeholder="Chữ Hán chính"
                                className="w-full rounded border border-[#C9B99A] bg-white px-2 py-1 font-mono text-xs font-bold text-[#1C1917]"
                              />
                              <input
                                type="text"
                                value={editAliases}
                                onChange={(e) => setEditAliases(e.target.value)}
                                placeholder="Bí danh Hán (cách bởi dấu |)"
                                className="w-full rounded border border-[#E5DEC9] bg-white px-2 py-1 font-mono text-[11px] text-[#605A52]"
                              />
                            </td>
                            <td className="space-y-1.5 px-3 py-2">
                              <input
                                type="text"
                                value={editTargetTerm}
                                onChange={(e) => setEditTargetTerm(e.target.value)}
                                placeholder="Bản dịch chuẩn"
                                className="w-full rounded border border-[#8C2D19] bg-white px-2 py-1 text-xs font-bold text-[#8C2D19]"
                              />
                              <select
                                value={editPolicy}
                                onChange={(e) =>
                                  setEditPolicy(e.target.value as GlossaryPolicy)
                                }
                                className="w-full rounded border border-[#C9B99A] bg-white px-2 py-1 text-[11px]"
                              >
                                {Object.entries(POLICY_LABELS).map(([k, meta]) => (
                                  <option key={k} value={k}>
                                    {meta.label}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="space-y-1.5 px-3 py-2">
                              <select
                                value={editCategory}
                                onChange={(e) =>
                                  setEditCategory(e.target.value as GlossaryCategory)
                                }
                                className="w-full rounded border border-[#C9B99A] bg-white px-2 py-1 text-xs"
                              >
                                {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                                  <option key={k} value={k}>
                                    {label}
                                  </option>
                                ))}
                              </select>
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min={0}
                                  value={editChapterFrom}
                                  onChange={(e) => setEditChapterFrom(e.target.value)}
                                  placeholder="Từ Ch."
                                  className="w-16 rounded border border-[#E5DEC9] bg-white px-1.5 py-0.5 font-mono text-[11px]"
                                />
                                <span className="text-[10px] text-[#605A52]">→</span>
                                <input
                                  type="number"
                                  min={0}
                                  value={editChapterTo}
                                  onChange={(e) => setEditChapterTo(e.target.value)}
                                  placeholder="Đến Ch."
                                  className="w-16 rounded border border-[#E5DEC9] bg-white px-1.5 py-0.5 font-mono text-[11px]"
                                />
                              </div>
                            </td>
                            <td className="space-y-1.5 px-3 py-2">
                              <input
                                type="text"
                                value={editNotes}
                                onChange={(e) => setEditNotes(e.target.value)}
                                placeholder="Vai vế / xưng hô..."
                                className="w-full rounded border border-[#C9B99A] bg-white px-2 py-1 text-xs text-[#1C1917]"
                              />
                              <input
                                type="text"
                                value={editForbidden}
                                onChange={(e) => setEditForbidden(e.target.value)}
                                placeholder="Cấm dịch là (cách bởi dấu |)..."
                                className="w-full rounded border border-red-200 bg-white px-2 py-1 text-[11px] text-red-800"
                              />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <div className="flex flex-wrap items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleSaveInlineEdit(item, false)}
                                  className="rounded bg-[#8C2D19] px-2 py-1 text-[11px] font-bold text-white hover:bg-[#722211]"
                                >
                                  Lưu &amp; Duyệt
                                </button>
                                {targetChanged && onSyncReplaceInTranslatedChapters && (
                                  <button
                                    type="button"
                                    onClick={() => handleSaveInlineEdit(item, true)}
                                    className="inline-flex items-center gap-1 rounded bg-[#1E6F50] px-2 py-1 text-[11px] font-bold text-white hover:bg-[#16563D]"
                                    title={`Lưu vào Từ điển & tự động thay thế "${item.targetTerm}" → "${editTargetTerm.trim()}" trong toàn bộ chương đã dịch`}
                                  >
                                    <Replace className="h-3 w-3" />
                                    Lưu &amp; Đồng bộ chương đã dịch
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => setEditingEntryId(null)}
                                  className="rounded bg-[#E5DEC9] px-2 py-1 text-[11px] font-medium text-[#1C1917]"
                                >
                                  Hủy
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      }

                      return (
                        <tr
                          key={item.id}
                          onDoubleClick={() => handleStartInlineEdit(item)}
                          className="hover:bg-[#FBF8F1]"
                        >
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={isEnabled}
                                onChange={() => handleToggleGlossaryEntryEnabled(item)}
                                className="h-4 w-4 accent-[#8C2D19]"
                                title="Bật/tắt mục từ này khi gửi kèm Glossary"
                              />
                              <button
                                type="button"
                                onClick={() => handleToggleGlossaryEntryPinned(item)}
                                className={`rounded p-1 transition ${
                                  item.pinned
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'text-[#605A52]/50 hover:bg-[#F3EFE6] hover:text-[#1C1917]'
                                }`}
                                title={
                                  item.pinned
                                    ? 'Đang ghim cố định (Luôn nạp vào Prompt khi BẬT Glossary)'
                                    : 'Ghim cố định nhân vật chính / quy tắc xưng hô cốt lõi'
                                }
                              >
                                <Pin className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                          <td className="px-3 py-2 font-mono font-semibold text-[#1C1917]">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span>{item.sourceTerm}</span>
                              {item.aliases && item.aliases.length > 0 && (
                                <span
                                  className="rounded bg-[#F3EFE6] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[#605A52]"
                                  title={`Các biến thể / bí danh chữ Hán tự động nhận diện: ${item.aliases.join(' | ')}`}
                                >
                                  | {item.aliases.join(' | ')}
                                </span>
                              )}
                              {isMatchedInActive && (
                                <span className="rounded bg-[#1E6F50]/15 px-1.5 py-0.5 font-sans text-[10px] font-bold text-[#1E6F50]">
                                  Có trong chương
                                </span>
                              )}
                              {item.source === 'ai' && (
                                <span className="rounded bg-[#8C2D19]/10 px-1.5 py-0.5 font-sans text-[9px] font-bold text-[#8C2D19]">
                                  AI
                                </span>
                              )}
                              {item.status === 'draft' && (
                                <span
                                  className="rounded bg-amber-100 px-1.5 py-0.5 font-sans text-[9px] font-bold text-amber-900"
                                  title="Mục do AI tự quét đang chờ duyệt — bấm nút tích xanh bên phải hoặc sửa để khóa cố định"
                                >
                                  Chờ duyệt
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-semibold text-[#8C2D19]">
                                {item.targetTerm}
                              </span>
                              {itemPolicy !== 'force' && (
                                <span
                                  className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${policyMeta.badgeClass}`}
                                  title={policyMeta.label}
                                >
                                  {policyMeta.label}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap items-center gap-1">
                              <span className="rounded bg-[#F3EFE6] px-2 py-0.5 text-[11px] text-[#605A52]">
                                {CATEGORY_LABELS[item.category] || item.category}
                              </span>
                              {(item.chapterFrom !== undefined ||
                                item.chapterTo !== undefined) && (
                                <span
                                  className="rounded bg-sky-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-sky-900"
                                  title="Phạm vi chương có hiệu lực (Temporal Terminology)"
                                >
                                  Ch.{item.chapterFrom ?? 1}–{item.chapterTo ?? '∞'}
                                </span>
                              )}
                              {item.firstChapter !== undefined &&
                                item.chapterFrom === undefined &&
                                item.chapterTo === undefined && (
                                  <span
                                    className="rounded bg-[#F3EFE6] px-1.5 py-0.5 font-mono text-[9px] text-[#605A52]"
                                    title={`Xuất hiện lần đầu ở Chương #${item.firstChapter}`}
                                  >
                                    #{item.firstChapter}
                                  </span>
                                )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-[#605A52]">
                            <div className="space-y-0.5">
                              {item.notes && <div>{item.notes}</div>}
                              {item.forbiddenTranslations &&
                                item.forbiddenTranslations.length > 0 && (
                                  <div className="flex flex-wrap items-center gap-1">
                                    <span className="rounded bg-red-100 px-1.5 py-0.2 text-[10px] font-bold text-red-800">
                                      Cấm dịch: {item.forbiddenTranslations.join(' | ')}
                                    </span>
                                  </div>
                                )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {item.status === 'draft' && (
                                <button
                                  type="button"
                                  onClick={() => handleApproveSingleEntry(item)}
                                  className="rounded bg-[#1E6F50]/15 p-1 text-[#1E6F50] hover:bg-[#1E6F50] hover:text-white"
                                  title="Duyệt mục này (Khóa chính thức để AI Pre-Scan không bao giờ ghi đè)"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleStartInlineEdit(item)}
                                className="rounded p-1 text-[#605A52] hover:bg-[#F3EFE6] hover:text-[#1C1917]"
                                title="Sửa trực tiếp tên dịch / bí danh / quy tắc xưng hô (Hoặc đúp chuột vào dòng)"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                              {onSyncReplaceInTranslatedChapters && (
                                <button
                                  type="button"
                                  disabled={isSyncing}
                                  onClick={() => handleSyncSourceTermToTranslated(item)}
                                  className="rounded p-1 text-[#1E6F50] hover:bg-[#1E6F50]/10 disabled:opacity-50"
                                  title={`Quét và thay thế chữ Hán / bí danh hoặc từ cấm của "${item.sourceTerm}" → "${item.targetTerm}" trong các chương đã dịch`}
                                >
                                  <Replace className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => onDeleteGlossaryItem(item.id)}
                                className="rounded p-1 text-red-600 hover:bg-red-50"
                                title="Xóa mục này"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredGlossary.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-[#605A52]">
                          Không tìm thấy thuật ngữ nào khớp bộ lọc.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: MODEL ALIAS, CONCURRENCY, QA VALIDATION RULES & 50-KEY ROTATION */}
          {activeTab === 'model_keys' && (
            <div className="space-y-6">
              {/* Model Alias & Strict Lock Card */}
              <div className="rounded-xl border border-[#E5DEC9] bg-white p-5 shadow-xs">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-[#1C1917]">
                        Lựa Chọn Model AI &amp; Alias Tự Động Cập Nhật
                      </h3>
                      <span className="inline-flex items-center gap-1 rounded bg-[#1E6F50]/15 px-2 py-0.5 text-[11px] font-bold text-[#1E6F50]">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Strict Model Lock: Chỉ Xoay Key, Không Tự Hạ Model
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-[#605A52]">
                      Mọi yêu cầu dịch luôn giữ{' '}
                      <code className="font-mono text-[#8C2D19]">maxOutputTokens: 65536</code> và
                      mức suy luận hiện tại:{' '}
                      <code className="rounded bg-[#8C2D19]/12 px-1.5 py-0.5 font-mono font-bold text-[#8C2D19]">
                        thinking_level: &quot;{modelConfig.thinkingLevel || DEFAULT_THINKING_LEVEL}&quot;
                      </code>{' '}
                      (mặc định là <code className="font-mono font-semibold">high</code>).
                    </p>
                  </div>
                  <button
                    onClick={fetchLiveModelsAndPool}
                    disabled={loadingModels}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-3 py-1.5 text-xs font-medium text-[#1C1917] hover:bg-[#F3EFE6]"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${loadingModels ? 'animate-spin' : ''}`}
                    />
                    Làm mới Model &amp; Thinking Level từ API
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {MODEL_ALIAS_OPTIONS.map((opt) => {
                    const selected = modelConfig.selectedModel === opt.id;
                    return (
                      <div
                        key={opt.id}
                        onClick={() =>
                          onChangeModelConfig({
                            ...modelConfig,
                            selectedModel: opt.id,
                          })
                        }
                        className={`cursor-pointer rounded-lg border p-3.5 transition ${
                          selected
                            ? 'border-[#8C2D19] bg-[#8C2D19]/8'
                            : 'border-[#E5DEC9] bg-[#FBF8F1] hover:border-[#C9B99A]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-bold text-[#1C1917]">
                            {opt.id}
                          </span>
                          <span className="rounded bg-[#8C2D19]/15 px-2 py-0.5 text-[10px] font-bold text-[#8C2D19]">
                            {opt.badge}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-[#605A52]">{opt.label}</p>
                      </div>
                    );
                  })}
                </div>

                {/* Live API models + Custom Model input */}
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                      Hoặc chọn từ danh sách Model trực tiếp trên Gemini API ({liveModels.length})
                    </label>
                    <select
                      value={modelConfig.selectedModel}
                      onChange={(e) =>
                        onChangeModelConfig({
                          ...modelConfig,
                          selectedModel: e.target.value,
                        })
                      }
                      className="w-full rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-3 py-2 font-mono text-xs text-[#1C1917]"
                    >
                      <option value={modelConfig.selectedModel}>
                        Đang dùng: {modelConfig.selectedModel}
                      </option>
                      {liveModels.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-[#1C1917]">
                      Hoặc nhập mã Model / Alias bất kỳ (dùng cho các bản Gemini tương lai)
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="VD: gemini-flash-latest"
                        value={customModelInput}
                        onChange={(e) => setCustomModelInput(e.target.value)}
                        className="flex-1 rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-3 py-2 font-mono text-xs text-[#1C1917]"
                      />
                      <button
                        onClick={() => {
                          if (customModelInput.trim()) {
                            onChangeModelConfig({
                              ...modelConfig,
                              selectedModel: customModelInput.trim(),
                            });
                            setCustomModelInput('');
                          }
                        }}
                        className="rounded-lg bg-[#8C2D19] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#722211]"
                      >
                        Áp dụng
                      </button>
                    </div>
                  </div>
                </div>

                {/* Dynamic Thinking Level Selector (minimal, low, medium, high — Default: high) */}
                <div className="mt-4 rounded-xl border border-[#8C2D19]/25 bg-[#FBF8F1] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-xs font-bold tracking-wider text-[#1C1917] uppercase">
                          Mức Suy Luận AI (Thinking Level: minimal • low • medium • high)
                        </h4>
                        <span className="rounded bg-[#8C2D19] px-2 py-0.5 font-mono text-[10px] font-bold text-white">
                          Đang chọn: {(modelConfig.thinkingLevel || DEFAULT_THINKING_LEVEL).toUpperCase()}
                        </span>
                        <span className="rounded bg-[#1E6F50]/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-[#1E6F50]">
                          Tự động nạp từ SDK /api/models ({thinkingLevels.length} mức)
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-[#605A52]">
                        Mặc định không chỉnh sẽ luôn để{' '}
                        <strong className="font-mono text-[#8C2D19]">high</strong> để suy luận văn học sâu nhất. Nếu gặp chương quá dài khiến cổng 300 giây bị ngắt kết nối (timeout) do{' '}
                        <code className="font-mono">high</code> suy nghĩ quá lâu, bạn có thể hạ xuống{' '}
                        <strong className="font-mono text-[#1E6F50]">medium</strong>,{' '}
                        <strong className="font-mono text-[#1E6F50]">low</strong> hoặc{' '}
                        <strong className="font-mono text-[#1E6F50]">minimal</strong> để AI trả kết quả nhanh tức thì.
                      </p>
                    </div>

                    {(modelConfig.thinkingLevel || DEFAULT_THINKING_LEVEL) !==
                      DEFAULT_THINKING_LEVEL && (
                      <button
                        type="button"
                        onClick={() =>
                          onChangeModelConfig({
                            ...modelConfig,
                            thinkingLevel: DEFAULT_THINKING_LEVEL,
                          })
                        }
                        className="shrink-0 rounded-lg border border-[#8C2D19]/30 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#8C2D19] hover:bg-[#8C2D19]/10"
                      >
                        Đặt về mặc định (high)
                      </button>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                    {thinkingLevels.map((lvl) => {
                      const activeLevel =
                        modelConfig.thinkingLevel || DEFAULT_THINKING_LEVEL;
                      const isSelected = activeLevel === lvl.id;
                      return (
                        <button
                          key={lvl.id}
                          type="button"
                          onClick={() =>
                            onChangeModelConfig({
                              ...modelConfig,
                              thinkingLevel: lvl.id,
                            })
                          }
                          className={`flex flex-col justify-between rounded-lg border p-3 text-left transition ${
                            isSelected
                              ? 'border-[#8C2D19] bg-[#8C2D19]/10 shadow-2xs'
                              : 'border-[#E5DEC9] bg-white hover:border-[#C9B99A]'
                          }`}
                        >
                          <div>
                            <div className="flex items-center justify-between gap-1.5">
                              <span className="font-mono text-xs font-bold text-[#1C1917]">
                                {lvl.id}
                              </span>
                              <span
                                className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                  lvl.isDefault
                                    ? 'bg-[#8C2D19] text-white'
                                    : isSelected
                                      ? 'bg-[#1E6F50] text-white'
                                      : 'bg-[#E5DEC9]/80 text-[#605A52]'
                                }`}
                              >
                                {lvl.badge}
                              </span>
                            </div>
                            <p className="mt-1 text-[11px] font-semibold text-[#1C1917]">
                              {lvl.label}
                            </p>
                            <p className="mt-1 text-[10px] leading-relaxed text-[#605A52]">
                              {lvl.description}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Auto-Fallback Model on 429 Pool Exhaustion */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#1E6F50]/30 bg-[#1E6F50]/8 p-3.5">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-[#1C1917]">
                        Tự động chuyển sang Model Dự Phòng (Auto-Fallback) khi hết sạch hạn mức 429
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          modelConfig.autoFallbackEnabled !== false
                            ? 'bg-[#1E6F50] text-white'
                            : 'bg-[#E5DEC9] text-[#605A52]'
                        }`}
                      >
                        {modelConfig.autoFallbackEnabled !== false ? 'ĐANG BẬT' : 'ĐANG TẮT'}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#605A52]">
                      Khi tất cả Key đều chạm trần 429 trên Model chính ({modelConfig.selectedModel}), hệ thống tự động chuyển tiếp sang Model dự phòng để hàng đợi chạy xuyên suốt. Nếu cả 2 đều hết, hàng đợi sẽ tự động Tạm dừng an toàn.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      value={modelConfig.fallbackModel || 'gemini-3.1-flash-lite'}
                      disabled={modelConfig.autoFallbackEnabled === false}
                      onChange={(e) =>
                        onChangeModelConfig({
                          ...modelConfig,
                          fallbackModel: e.target.value,
                        })
                      }
                      className="rounded-lg border border-[#C9B99A] bg-white px-2.5 py-1.5 font-mono text-xs font-semibold text-[#1C1917] disabled:opacity-50"
                    >
                      {MODEL_ALIAS_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          Dự phòng: {opt.id}
                        </option>
                      ))}
                      {liveModels
                        .filter((m) => !MODEL_ALIAS_OPTIONS.some((o) => o.id === m))
                        .map((m) => (
                          <option key={m} value={m}>
                            Dự phòng: {m}
                          </option>
                        ))}
                    </select>

                    <button
                      type="button"
                      onClick={() =>
                        onChangeModelConfig({
                          ...modelConfig,
                          autoFallbackEnabled: modelConfig.autoFallbackEnabled === false,
                        })
                      }
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                        modelConfig.autoFallbackEnabled !== false
                          ? 'border-[#1E6F50] bg-[#1E6F50] text-white'
                          : 'border-[#C9B99A] bg-white text-[#605A52]'
                      }`}
                    >
                      {modelConfig.autoFallbackEnabled !== false ? (
                        <ToggleRight className="h-4 w-4" />
                      ) : (
                        <ToggleLeft className="h-4 w-4" />
                      )}
                      {modelConfig.autoFallbackEnabled !== false ? 'Bật Auto-Fallback' : 'Tắt'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Concurrency 1x-10x & Multi-Criteria QA Validation Rules */}
              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <div className="rounded-xl border border-[#E5DEC9] bg-white p-5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold tracking-wider text-[#1C1917] uppercase">
                      Số Luồng Dịch Song Song (Concurrency: {modelConfig.concurrency}x)
                    </h4>
                    <span className="rounded bg-[#8C2D19] px-2.5 py-0.5 font-mono text-xs font-bold text-white">
                      {modelConfig.concurrency} chương cùng lúc
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#605A52]">
                    Chạy đồng thời tối đa 10 chương/lượt kết hợp xoay vòng 50 API Key ở Server.
                  </p>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={modelConfig.concurrency}
                    onChange={(e) =>
                      onChangeModelConfig({
                        ...modelConfig,
                        concurrency: Number(e.target.value),
                      })
                    }
                    className="mt-4 w-full accent-[#8C2D19]"
                  />
                  <div className="mt-1 flex justify-between font-mono text-[10px] text-[#605A52]">
                    <span>1x (Tuần tự)</span>
                    <span>3x</span>
                    <span>5x (Khuyên dùng)</span>
                    <span>8x</span>
                    <span>10x (Tối đa)</span>
                  </div>

                  {/* Custom QA Glitch Words */}
                  <div className="mt-5 border-t border-[#E5DEC9] pt-4">
                    <h4 className="text-xs font-bold tracking-wider text-[#1C1917] uppercase">
                      Bộ Lọc Từ Tiếng Anh Lọt Câu (Ngoài &quot;but&quot;, &quot;and&quot;, &quot;or&quot;, &quot;however&quot;...)
                    </h4>
                    <p className="mt-0.5 text-[11px] text-[#605A52]">
                      Chỉ tính những từ tiếng Anh không có nghĩa trong tiếng Việt. Các chữ có nghĩa tiếng Việt (như &quot;in&quot;, &quot;then&quot;, &quot;than&quot;, &quot;the&quot;...) đã được tự động loại trừ.
                    </p>
                    <div className="mt-2 flex gap-2">
                      <input
                        type="text"
                        placeholder="Thêm từ tiếng Anh / từ lỗi..."
                        value={newBannedWord}
                        onChange={(e) => setNewBannedWord(e.target.value)}
                        className="flex-1 rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-3 py-1.5 text-xs"
                      />
                      <button
                        onClick={() => {
                          const w = newBannedWord.trim().toLowerCase();
                          if (w && !modelConfig.customBannedWords.includes(w)) {
                            onChangeModelConfig({
                              ...modelConfig,
                              customBannedWords: [...modelConfig.customBannedWords, w],
                            });
                            setNewBannedWord('');
                          }
                        }}
                        className="rounded-lg bg-[#8C2D19] px-3 py-1.5 text-xs font-semibold text-white"
                      >
                        Thêm từ
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {modelConfig.customBannedWords.map((w) => (
                        <span
                          key={w}
                          className="inline-flex items-center gap-1 rounded bg-[#F3EFE6] px-2 py-0.5 font-mono text-xs text-[#8C2D19]"
                        >
                          {w}
                          <button
                            onClick={() =>
                              onChangeModelConfig({
                                ...modelConfig,
                                customBannedWords: modelConfig.customBannedWords.filter(
                                  (item) => item !== w
                                ),
                              })
                            }
                            className="text-[#605A52] hover:text-red-600"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Multi-Criteria QA Validation Thresholds */}
                <div className="rounded-xl border border-[#E5DEC9] bg-white p-5 space-y-3">
                  <h4 className="text-xs font-bold tracking-wider text-[#1C1917] uppercase">
                    Ngưỡng Phát Hiện Chương Lỗi QA Đa Tiêu Chí (Đưa đi Dịch Lại / Biên Tập AI)
                  </h4>
                  <p className="text-xs text-[#605A52]">
                    Cấu hình tiêu chuẩn kiểm định bản dịch để lọc nhanh chương lệch đoạn, hụt/dôi độ dài hoặc lặp đoạn:
                  </p>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="mb-1 block font-semibold text-[#1C1917]">
                        Tỷ lệ độ dài tối thiểu (Việt/Hán)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={qaRules.minLengthRatio}
                        onChange={(e) =>
                          onChangeModelConfig({
                            ...modelConfig,
                            qaRules: {
                              ...qaRules,
                              minLengthRatio: Number(e.target.value) || 0.7,
                            },
                          })
                        }
                        className="w-full rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-2.5 py-1.5 font-mono"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block font-semibold text-[#1C1917]">
                        Tỷ lệ độ dài tối đa (Việt/Hán)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={qaRules.maxLengthRatio}
                        onChange={(e) =>
                          onChangeModelConfig({
                            ...modelConfig,
                            qaRules: {
                              ...qaRules,
                              maxLengthRatio: Number(e.target.value) || 5.2,
                            },
                          })
                        }
                        className="w-full rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-2.5 py-1.5 font-mono"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block font-semibold text-[#1C1917]">
                        Số chữ Hán sót tối đa cho phép
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={qaRules.maxHanCharacters}
                        onChange={(e) =>
                          onChangeModelConfig({
                            ...modelConfig,
                            qaRules: {
                              ...qaRules,
                              maxHanCharacters: Math.max(0, Number(e.target.value)),
                            },
                          })
                        }
                        className="w-full rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-2.5 py-1.5 font-mono"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block font-semibold text-[#1C1917]">
                        Ngưỡng cảnh báo lặp đoạn văn
                      </label>
                      <input
                        type="number"
                        min={2}
                        value={qaRules.repeatedParagraphThreshold}
                        onChange={(e) =>
                          onChangeModelConfig({
                            ...modelConfig,
                            qaRules: {
                              ...qaRules,
                              repeatedParagraphThreshold: Math.max(
                                2,
                                Number(e.target.value)
                              ),
                            },
                          })
                        }
                        className="w-full rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] px-2.5 py-1.5 font-mono"
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 pt-1 text-xs font-medium text-[#1C1917]">
                    <input
                      type="checkbox"
                      checked={qaRules.checkAbruptEnding}
                      onChange={(e) =>
                        onChangeModelConfig({
                          ...modelConfig,
                          qaRules: {
                            ...qaRules,
                            checkAbruptEnding: e.target.checked,
                          },
                        })
                      }
                      className="h-4 w-4 accent-[#8C2D19]"
                    />
                    Phát hiện kết thúc chương đột ngột giữa câu (Abrupt Ending)
                  </label>
                </div>
              </div>

              {/* 50-Key Project Pool Persistence & Full API Health Check */}
              <div className="space-y-4 rounded-xl border border-[#E5DEC9] bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-4 w-4 text-[#8C2D19]" />
                    <h4 className="text-sm font-bold text-[#1C1917]">
                      Bể Xoay Vòng 50 Key (Lưu Trực Tiếp Trong Dự Án) &amp; Kiểm Tra Toàn Bộ API
                    </h4>
                  </div>
                  {poolStats && (
                    <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs font-bold">
                      <span className="rounded-md bg-[#1E6F50]/15 px-2.5 py-1 text-[#1E6F50]">
                        Tổng: {poolStats.totalKeys} Key • Rảnh ({modelConfig.selectedModel}):{' '}
                        {poolStats.idleReadyKeys ?? poolStats.activeKeys}
                      </span>
                      {(poolStats.projectSavedKeyCount ?? 0) > 0 && (
                        <span className="rounded-md bg-[#8C2D19]/12 px-2.5 py-1 text-[#8C2D19]">
                          Đã lưu trong dự án: {poolStats.projectSavedKeyCount} Key
                        </span>
                      )}
                      {(poolStats.inUseKeys ?? 0) > 0 && (
                        <span className="rounded-md bg-amber-500/20 px-2.5 py-1 text-amber-900">
                          Đang dịch: {poolStats.inUseKeys} Key
                        </span>
                      )}
                      {poolStats.coolingDownKeys > 0 && (
                        <span className="rounded-md bg-red-100 px-2.5 py-1 text-red-700">
                          Cooldown 429: {poolStats.coolingDownKeys} Key
                        </span>
                      )}
                      {(poolStats.invalidKeys ?? 0) > 0 && (
                        <span className="rounded-md bg-red-200 px-2.5 py-1 text-red-900">
                          Key lỗi: {poolStats.invalidKeys}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Persistent Storage Explanation Banner */}
                <div className="rounded-lg border border-[#1E6F50]/30 bg-[#1E6F50]/8 px-3.5 py-2.5 text-xs text-[#1C1917]">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 font-bold text-[#1E6F50]">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span>
                        Cơ chế Lưu Bền Vững 2 Lớp (Dự Án Server + Trình Duyệt) — Dán 1 Lần Duy Nhất, Không Cần Dán Lại:
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        ref={keyFileInputRef}
                        type="file"
                        accept=".txt,.env,text/plain"
                        onChange={handleImportKeysFile}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => keyFileInputRef.current?.click()}
                        className="inline-flex items-center gap-1 rounded-md border border-[#C9B99A] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#1C1917] hover:bg-[#F3EFE6]"
                      >
                        <FileUp className="h-3.5 w-3.5 text-[#8C2D19]" />
                        Nhập file .TXT/.ENV
                      </button>
                      <button
                        type="button"
                        onClick={handleResetCooldowns}
                        className="inline-flex items-center gap-1 rounded-md border border-[#C9B99A] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#1C1917] hover:bg-[#F3EFE6]"
                        title="Xóa toàn bộ trạng thái chờ Cooldown 429 để thử lại ngay"
                      >
                        <RotateCcw className="h-3.5 w-3.5 text-[#8C2D19]" />
                        Xóa Cooldown 429
                      </button>
                    </div>
                  </div>
                  <p className="mt-1 text-[11px] text-[#605A52]">
                    Hệ thống <strong>KHÔNG tích hợp sẵn bất kỳ API Key mặc định nào</strong> — ai muốn sử dụng phải tự thêm Key cá nhân của mình. Khi bấm <strong>&quot;Lưu &amp; Nạp Bể Key&quot;</strong>, danh sách chỉ lưu riêng tư trên trình duyệt của bạn (<code className="font-mono text-[#8C2D19]">localStorage</code>), tuyệt đối không lưu cứng vào mã nguồn hay chia sẻ sang người khác.
                  </p>
                </div>

                {/* Key List Input & Save / Check Action Bar */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="text-xs font-semibold text-[#1C1917]">
                        Danh sách Key cá nhân của bạn (Mỗi dòng 1 Key — Tối đa 50 Key)
                      </label>
                      <span className="font-mono text-[11px] font-semibold text-[#8C2D19]">
                        {
                          rawMultilineKeys
                            .split(/\r?\n/)
                            .map((l) => l.trim())
                            .filter((l) => l.length >= 16 && !l.startsWith('#')).length
                        }
                        /50 dòng hợp lệ
                      </span>
                    </div>
                    <textarea
                      rows={5}
                      placeholder={`Dán danh sách Gemini API Key cá nhân của bạn vào đây (mỗi dòng 1 Key hoặc GEMINI_API_KEY_1=AIza...)\nHệ thống không tích hợp sẵn Key — chỉ lưu riêng tư trên trình duyệt của bạn!`}
                      value={rawMultilineKeys}
                      onChange={(e) => setRawMultilineKeys(e.target.value)}
                      className="w-full rounded-lg border border-[#E5DEC9] bg-[#FBF8F1] p-2.5 font-mono text-xs text-[#1C1917] focus:border-[#8C2D19] focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <label className="text-xs font-semibold text-[#1C1917]">
                        Bản chuẩn hóa biến môi trường (.env / Secrets nếu cần chép ra ngoài)
                      </label>
                      {formattedEnvLines && (
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(formattedEnvLines);
                            setCopiedEnvFormat(true);
                            setTimeout(() => setCopiedEnvFormat(false), 1500);
                          }}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[#8C2D19] hover:underline"
                        >
                          <Copy className="h-3 w-3" />
                          {copiedEnvFormat ? 'Đã chép!' : 'Sao chép .env'}
                        </button>
                      )}
                    </div>
                    <textarea
                      rows={5}
                      readOnly
                      value={
                        formattedEnvLines ||
                        '# Dán danh sách Key ở cột trái rồi bấm "Lưu Vào Dự Án & Nạp Bể Key" bên dưới.\n# Hệ thống tự động nạp trực tiếp vào Server mà không cần cấu hình thủ công.'
                      }
                      className="w-full rounded-lg border border-[#E5DEC9] bg-[#F3EFE6] p-2.5 font-mono text-xs text-[#605A52]"
                    />
                  </div>
                </div>

                {/* Primary Action Buttons: Save Keys to Project & Test All APIs */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleSaveKeysToProject()}
                      disabled={savingKeysToProject}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#8C2D19] px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-[#722211] disabled:opacity-50"
                    >
                      <Save className="h-4 w-4" />
                      {savingKeysToProject
                        ? 'Đang lưu vào dự án...'
                        : 'Lưu Vào Dự Án & Nạp Bể Key Ngay'}
                    </button>

                    <button
                      type="button"
                      onClick={handleCheckAllApisAndKeys}
                      disabled={checkingAllApis}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#1E6F50] px-4 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-[#16563D] disabled:opacity-50"
                    >
                      <Activity
                        className={`h-4 w-4 ${checkingAllApis ? 'animate-spin' : ''}`}
                      />
                      {checkingAllApis
                        ? `Đang kiểm tra toàn bộ API & ${poolStats?.totalKeys || 0} Key...`
                        : `Kiểm Tra Toàn Bộ API & Bể Key (${modelConfig.selectedModel})`}
                    </button>

                    {(rawMultilineKeys.trim().length > 0 ||
                      (poolStats?.totalKeys ?? 0) > 0) && (
                      <button
                        type="button"
                        onClick={async () => {
                          setRawMultilineKeys('');
                          setApiCheckReport(null);
                          await handleSaveKeysToProject('');
                        }}
                        disabled={savingKeysToProject}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                        title="Xóa toàn bộ Key đang lưu trong dự án và trình duyệt để đưa bể về 0 Key trước khi Public/chia sẻ dự án"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Xóa sạch Key (0 Key)
                      </button>
                    )}
                  </div>

                  {savedKeysToast && (
                    <span className="rounded-lg bg-[#1E6F50]/12 px-3 py-1.5 text-xs font-semibold text-[#1E6F50]">
                      {savedKeysToast}
                    </span>
                  )}
                </div>

                {/* Live API & Key Pool Diagnostic Report */}
                {apiCheckReport && (
                  <div className="mt-4 space-y-4 rounded-xl border border-[#C9B99A] bg-[#FBF8F1] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5DEC9] pb-2.5">
                      <div>
                        <h5 className="text-xs font-bold tracking-wider text-[#8C2D19] uppercase">
                          Báo Cáo Kiểm Tra Toàn Bộ 5 Endpoint API &amp; Thực Chiến Bể Key (Model:{' '}
                          <span className="font-mono">{apiCheckReport.modelTested}</span>)
                        </h5>
                        <p className="text-[11px] text-[#605A52]">
                          Kiểm tra lúc{' '}
                          {new Date(apiCheckReport.testedAt).toLocaleTimeString('vi-VN')} •
                          Kết nối trực tiếp qua SDK{' '}
                          <code className="font-mono text-[#8C2D19]">@google/genai@2.31.0</code>{' '}
                          (<code className="font-mono">ai.interactions.create</code>)
                        </p>
                      </div>
                      {apiCheckReport.keyResults.some(
                        (k) => k.status === 'cooldown' && k.flashLiteReady
                      ) &&
                        modelConfig.selectedModel !== 'gemini-3.1-flash-lite' && (
                          <button
                            type="button"
                            onClick={() => {
                              onChangeModelConfig({
                                ...modelConfig,
                                selectedModel: 'gemini-3.1-flash-lite',
                              });
                              setSavedKeysToast(
                                'Đã chuyển sang model gemini-3.1-flash-lite (Hạn mức riêng đang sẵn sàng)!'
                              );
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            Chuyển sang gemini-3.1-flash-lite (Đang Rảnh 100%)
                          </button>
                        )}
                    </div>

                    {/* 5 Studio API Endpoints Table */}
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {apiCheckReport.endpointResults.map((ep) => (
                        <div
                          key={ep.endpoint}
                          className="flex items-start justify-between gap-2 rounded-lg border border-[#E5DEC9] bg-white p-2.5"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="rounded bg-[#F3EFE6] px-1.5 py-0.5 font-mono text-[10px] font-bold text-[#8C2D19]">
                                {ep.method} {ep.endpoint}
                              </span>
                              <span className="truncate text-xs font-bold text-[#1C1917]">
                                {ep.name}
                              </span>
                            </div>
                            <p className="mt-1 text-[11px] text-[#605A52]">{ep.detail}</p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                              ep.status === 'ok'
                                ? 'bg-[#1E6F50]/15 text-[#1E6F50]'
                                : ep.status === 'warning'
                                  ? 'bg-amber-100 text-amber-900'
                                  : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {ep.status === 'ok'
                              ? `OK • ${ep.latencyMs}ms`
                              : ep.status === 'warning'
                                ? '429 Model Chính'
                                : 'Hết Quota'}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Per-Key Live Test Results */}
                    <div className="max-h-60 overflow-y-auto rounded-lg border border-[#E5DEC9] bg-white">
                      <table className="w-full border-collapse text-left text-xs">
                        <thead className="sticky top-0 border-b border-[#E5DEC9] bg-[#F3EFE6] text-[11px] text-[#605A52]">
                          <tr>
                            <th className="px-3 py-2 font-semibold">#</th>
                            <th className="px-3 py-2 font-semibold">Nguồn lưu trữ</th>
                            <th className="px-3 py-2 font-semibold">Mã Key (Đã che)</th>
                            <th className="px-3 py-2 font-semibold">Trạng thái thực tế</th>
                            <th className="px-3 py-2 font-semibold">Độ trễ</th>
                            <th className="px-3 py-2 font-semibold">Chi tiết phản hồi từ Google API</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E5DEC9]/60">
                          {apiCheckReport.keyResults.map((kr) => (
                            <tr key={kr.index} className="hover:bg-[#FBF8F1]">
                              <td className="px-3 py-2 font-mono font-bold text-[#1C1917]">
                                #{kr.index}
                              </td>
                              <td className="px-3 py-2 font-mono text-[11px] text-[#8C2D19]">
                                {kr.sourceEnv}
                              </td>
                              <td className="px-3 py-2 font-mono text-[11px] text-[#605A52]">
                                {kr.maskedKey}
                              </td>
                              <td className="px-3 py-2">
                                {kr.status === 'ready' ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-[#1E6F50]/15 px-2 py-0.5 text-[11px] font-bold text-[#1E6F50]">
                                    <CheckCircle2 className="h-3 w-3" />
                                    Hoạt động tốt
                                  </span>
                                ) : kr.status === 'cooldown' ? (
                                  <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                                    <AlertTriangle className="h-3 w-3" />
                                    Chạm 429
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">
                                    Key lỗi
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 font-mono text-[11px] text-[#605A52]">
                                {kr.latencyMs}ms
                              </td>
                              <td className="px-3 py-2 text-[11px] text-[#1C1917]">
                                {kr.message}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Current Active Pool Slots Summary Table (Even before clicking Live Check) */}
                {!apiCheckReport && slotsSummary.length > 0 && (
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-[#E5DEC9] bg-[#FBF8F1]">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead className="sticky top-0 border-b border-[#E5DEC9] bg-[#F3EFE6] text-[11px] text-[#605A52]">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Vị trí</th>
                          <th className="px-3 py-2 font-semibold">Nguồn nạp</th>
                          <th className="px-3 py-2 font-semibold">Mã Key</th>
                          <th className="px-3 py-2 font-semibold">Trạng thái luồng</th>
                          <th className="px-3 py-2 font-semibold">Đã dịch</th>
                          <th className="px-3 py-2 font-semibold">Chạm 429</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E5DEC9]/60">
                        {slotsSummary.map((slot) => (
                          <tr key={slot.index} className="hover:bg-white">
                            <td className="px-3 py-1.5 font-mono font-bold text-[#1C1917]">
                              Key #{slot.index}
                            </td>
                            <td className="px-3 py-1.5 font-mono text-[11px] text-[#8C2D19]">
                              {slot.sourceEnv}
                            </td>
                            <td className="px-3 py-1.5 font-mono text-[11px] text-[#605A52]">
                              {slot.maskedKey}
                            </td>
                            <td className="px-3 py-1.5">
                              {slot.status === 'ready' ? (
                                <span className="rounded bg-[#1E6F50]/15 px-2 py-0.5 text-[10px] font-bold text-[#1E6F50]">
                                  Rảnh • Sẵn sàng
                                </span>
                              ) : slot.status === 'in_use' ? (
                                <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                                  Đang khóa dịch ({slot.activeRequests} luồng)
                                </span>
                              ) : slot.status === 'cooldown' ? (
                                <span className="rounded bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                                  Cooldown ({slot.cooldownRemainingSec}s)
                                </span>
                              ) : (
                                <span className="rounded bg-red-200 px-2 py-0.5 text-[10px] font-bold text-red-900">
                                  Key không hợp lệ
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-1.5 font-mono text-[11px] text-[#1C1917]">
                              {slot.totalRequests} req
                            </td>
                            <td className="px-3 py-1.5 font-mono text-[11px] text-[#605A52]">
                              {slot.rateLimitHits} lần
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-[#E5DEC9] bg-[#F3EFE6] px-6 py-3">
          <button
            onClick={onClose}
            className="rounded-lg bg-[#8C2D19] px-5 py-2 text-xs font-semibold text-white hover:bg-[#722211]"
          >
            Hoàn tất &amp; Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
