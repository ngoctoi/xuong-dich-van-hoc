'use client';

import React, { useState } from 'react';
import {
  Palette,
  Type as TypeIcon,
  Upload,
  Trash2,
  X,
  AlignJustify,
  RotateCcw,
} from 'lucide-react';
import { CustomFontRecord, ReaderSettings } from '@/lib/types';
import {
  BUILTIN_READER_FONTS,
  DEFAULT_READER_SETTINGS,
  READER_THEME_PRESETS,
} from '@/lib/seed-data';

interface ReaderAppearanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ReaderSettings;
  onUpdateSettings: (next: ReaderSettings) => void;
  customFonts: CustomFontRecord[];
  onUploadCustomFont: (file: File) => Promise<void>;
  onDeleteCustomFont: (id: string) => Promise<void>;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) || 0;
    const g = parseInt(clean[1] + clean[1], 16) || 0;
    const b = parseInt(clean[2] + clean[2], 16) || 0;
    return { r, g, b };
  }
  const num = parseInt(clean.padEnd(6, '0').slice(0, 6), 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n || 0)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

export default function ReaderAppearanceModal({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  customFonts,
  onUploadCustomFont,
  onDeleteCustomFont,
}: ReaderAppearanceModalProps) {
  const [isUploadingFont, setIsUploadingFont] = useState(false);

  if (!isOpen) return null;

  const bgRgb = hexToRgb(settings.bgHex);
  const textRgb = hexToRgb(settings.textHex);

  const handleFontFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingFont(true);
    try {
      await onUploadCustomFont(file);
    } finally {
      setIsUploadingFont(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[#E4DFD7] bg-[#FAF8F5] text-[#1C1917] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E4DFD7] bg-[#F2EFE9] px-6 py-4">
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-[#C83E31]" />
            <div>
              <h2 className="font-display text-base font-bold text-[#1C1917]">
                Tùy Chỉnh Trình Đọc & Phông Chữ
              </h2>
              <p className="text-xs text-[#6B635B]">
                Preset màu nền/màu chữ · Nhập mã HEX hoặc RGB · Chọn Font & Upload Font Local · Luôn căn đều 2 lề (Justify)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[#6B635B] hover:bg-[#E4DFD7]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 1. Theme Presets */}
          <div>
            <label className="block text-xs font-bold text-[#1C1917] mb-2.5">
              1. Chọn nhanh Preset Màu nền & Màu chữ:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {READER_THEME_PRESETS.map((preset) => {
                const active =
                  settings.bgHex.toUpperCase() === preset.bgHex.toUpperCase() &&
                  settings.textHex.toUpperCase() === preset.textHex.toUpperCase();
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() =>
                      onUpdateSettings({
                        ...settings,
                        presetId: preset.id,
                        bgHex: preset.bgHex,
                        textHex: preset.textHex,
                      })
                    }
                    style={{
                      backgroundColor: preset.bgHex,
                      color: preset.textHex,
                      borderColor: active ? '#C83E31' : preset.borderHex,
                    }}
                    className={`flex items-center justify-between rounded-lg border-2 px-3.5 py-2.5 text-xs font-semibold transition-all ${
                      active ? 'ring-2 ring-[#C83E31]/30' : ''
                    }`}
                  >
                    <span>{preset.name}</span>
                    <span className="font-mono-num text-[10px] opacity-75">
                      {preset.bgHex}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Custom HEX & RGB Color Pickers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-[#E4DFD7] bg-white p-4">
            {/* Background Color HEX + RGB */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-[#1C1917]">
                Màu Nền (Background — HEX / RGB)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={
                    /^#[0-9A-Fa-f]{6}$/.test(settings.bgHex)
                      ? settings.bgHex
                      : '#FAF6EE'
                  }
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      presetId: 'custom',
                      bgHex: e.target.value.toUpperCase(),
                    })
                  }
                  className="h-9 w-11 cursor-pointer rounded border border-[#D5CFC4] p-0.5"
                />
                <div className="flex-1">
                  <span className="block text-[10px] text-[#6B635B]">Mã HEX</span>
                  <input
                    type="text"
                    value={settings.bgHex}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        presetId: 'custom',
                        bgHex: e.target.value,
                      })
                    }
                    placeholder="#FAF6EE"
                    className="w-full rounded border border-[#D5CFC4] px-2.5 py-1 font-mono-num text-xs"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1">
                <div>
                  <span className="block text-[10px] text-[#6B635B]">R (0-255)</span>
                  <input
                    type="number"
                    min={0}
                    max={255}
                    value={bgRgb.r}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        presetId: 'custom',
                        bgHex: rgbToHex(Number(e.target.value), bgRgb.g, bgRgb.b),
                      })
                    }
                    className="w-full rounded border border-[#D5CFC4] px-2 py-1 font-mono-num text-xs"
                  />
                </div>
                <div>
                  <span className="block text-[10px] text-[#6B635B]">G (0-255)</span>
                  <input
                    type="number"
                    min={0}
                    max={255}
                    value={bgRgb.g}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        presetId: 'custom',
                        bgHex: rgbToHex(bgRgb.r, Number(e.target.value), bgRgb.b),
                      })
                    }
                    className="w-full rounded border border-[#D5CFC4] px-2 py-1 font-mono-num text-xs"
                  />
                </div>
                <div>
                  <span className="block text-[10px] text-[#6B635B]">B (0-255)</span>
                  <input
                    type="number"
                    min={0}
                    max={255}
                    value={bgRgb.b}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        presetId: 'custom',
                        bgHex: rgbToHex(bgRgb.r, bgRgb.g, Number(e.target.value)),
                      })
                    }
                    className="w-full rounded border border-[#D5CFC4] px-2 py-1 font-mono-num text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Text Color HEX + RGB */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-[#1C1917]">
                Màu Chữ (Text Color — HEX / RGB)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={
                    /^#[0-9A-Fa-f]{6}$/.test(settings.textHex)
                      ? settings.textHex
                      : '#231F1A'
                  }
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      presetId: 'custom',
                      textHex: e.target.value.toUpperCase(),
                    })
                  }
                  className="h-9 w-11 cursor-pointer rounded border border-[#D5CFC4] p-0.5"
                />
                <div className="flex-1">
                  <span className="block text-[10px] text-[#6B635B]">Mã HEX</span>
                  <input
                    type="text"
                    value={settings.textHex}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        presetId: 'custom',
                        textHex: e.target.value,
                      })
                    }
                    placeholder="#231F1A"
                    className="w-full rounded border border-[#D5CFC4] px-2.5 py-1 font-mono-num text-xs"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-1">
                <div>
                  <span className="block text-[10px] text-[#6B635B]">R (0-255)</span>
                  <input
                    type="number"
                    min={0}
                    max={255}
                    value={textRgb.r}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        presetId: 'custom',
                        textHex: rgbToHex(Number(e.target.value), textRgb.g, textRgb.b),
                      })
                    }
                    className="w-full rounded border border-[#D5CFC4] px-2 py-1 font-mono-num text-xs"
                  />
                </div>
                <div>
                  <span className="block text-[10px] text-[#6B635B]">G (0-255)</span>
                  <input
                    type="number"
                    min={0}
                    max={255}
                    value={textRgb.g}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        presetId: 'custom',
                        textHex: rgbToHex(textRgb.r, Number(e.target.value), textRgb.b),
                      })
                    }
                    className="w-full rounded border border-[#D5CFC4] px-2 py-1 font-mono-num text-xs"
                  />
                </div>
                <div>
                  <span className="block text-[10px] text-[#6B635B]">B (0-255)</span>
                  <input
                    type="number"
                    min={0}
                    max={255}
                    value={textRgb.b}
                    onChange={(e) =>
                      onUpdateSettings({
                        ...settings,
                        presetId: 'custom',
                        textHex: rgbToHex(textRgb.r, textRgb.g, Number(e.target.value)),
                      })
                    }
                    className="w-full rounded border border-[#D5CFC4] px-2 py-1 font-mono-num text-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 3. Font Family Selector + Local Font Upload */}
          <div className="rounded-xl border border-[#E4DFD7] bg-white p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <TypeIcon className="h-4 w-4 text-[#C83E31]" />
                <label className="text-xs font-bold text-[#1C1917]">
                  3. Phông chữ Đọc Truyện (Built-in & Upload Font Local)
                </label>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#1C1917] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#332E2A]">
                <Upload className="h-3.5 w-3.5" />
                <span>
                  {isUploadingFont
                    ? 'Đang nạp Font...'
                    : 'Tải Font Local (.ttf, .otf, .woff2)'}
                </span>
                <input
                  type="file"
                  accept=".ttf,.otf,.woff,.woff2"
                  onChange={handleFontFileChange}
                  className="hidden"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {BUILTIN_READER_FONTS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() =>
                    onUpdateSettings({ ...settings, fontFamily: f.css })
                  }
                  style={{ fontFamily: f.css }}
                  className={`rounded-lg border px-3 py-2 text-left text-xs transition-colors ${
                    settings.fontFamily === f.css
                      ? 'border-[#C83E31] bg-[#C83E31]/5 font-semibold text-[#C83E31]'
                      : 'border-[#E4DFD7] hover:bg-[#FAF8F5]'
                  }`}
                >
                  {f.name}
                </button>
              ))}

              {customFonts.map((cf) => {
                const cssVal = `"${cf.name}", serif`;
                return (
                  <div
                    key={cf.id}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2 text-xs ${
                      settings.fontFamily === cssVal
                        ? 'border-[#C83E31] bg-[#C83E31]/5 font-semibold text-[#C83E31]'
                        : 'border-[#E4DFD7]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateSettings({ ...settings, fontFamily: cssVal })
                      }
                      style={{ fontFamily: cssVal }}
                      className="flex-1 text-left truncate"
                    >
                      [Local] {cf.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteCustomFont(cf.id)}
                      className="ml-2 text-[#6B635B] hover:text-red-600"
                      title="Xóa Font Local này"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4. Typography Sliders & Mandatory Justify */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-xl border border-[#E4DFD7] bg-white p-4">
            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span>Cỡ chữ (Font Size)</span>
                <span className="font-mono-num text-[#C83E31]">
                  {settings.fontSize}px
                </span>
              </div>
              <input
                type="range"
                min={14}
                max={34}
                step={1}
                value={settings.fontSize}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    fontSize: Number(e.target.value),
                  })
                }
                className="w-full accent-[#C83E31]"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span>Giãn dòng (Line Height)</span>
                <span className="font-mono-num text-[#C83E31]">
                  {settings.lineHeight.toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={1.4}
                max={2.4}
                step={0.05}
                value={settings.lineHeight}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    lineHeight: Number(e.target.value),
                  })
                }
                className="w-full accent-[#C83E31]"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span>Khoảng cách đoạn (Paragraph Gap)</span>
                <span className="font-mono-num text-[#C83E31]">
                  {settings.paragraphSpacing}px
                </span>
              </div>
              <input
                type="range"
                min={6}
                max={36}
                step={2}
                value={settings.paragraphSpacing}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    paragraphSpacing: Number(e.target.value),
                  })
                }
                className="w-full accent-[#C83E31]"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span>Độ rộng khung đọc (Max Width)</span>
                <span className="font-mono-num text-[#C83E31]">
                  {settings.maxWidth}px
                </span>
              </div>
              <input
                type="range"
                min={560}
                max={1200}
                step={20}
                value={settings.maxWidth}
                onChange={(e) =>
                  onUpdateSettings({
                    ...settings,
                    maxWidth: Number(e.target.value),
                  })
                }
                className="w-full accent-[#C83E31]"
              />
            </div>
          </div>

          {/* Live Preview Box */}
          <div
            style={{
              backgroundColor: settings.bgHex,
              color: settings.textHex,
              fontFamily: settings.fontFamily,
              fontSize: `${settings.fontSize}px`,
              lineHeight: settings.lineHeight,
            }}
            className="rounded-xl border border-[#D5CFC4] p-5 shadow-inner"
          >
            <div className="mb-2 flex items-center justify-between text-xs opacity-70 font-sans-ui">
              <span className="inline-flex items-center gap-1 font-semibold">
                <AlignJustify className="h-3.5 w-3.5" />
                Luôn căn đều hai lề (text-align: justify)
              </span>
              <span className="font-mono-num">
                {settings.bgHex} / {settings.textHex}
              </span>
            </div>
            <p className="prose-justify">
              Mặt trời treo trên trời cao, đem ánh sáng và hơi ấm không thiên vị
              rải xuống nhân gian. Bất phân già trẻ, chẳng màng sang hèn. Đại ái
              dường như vô tình. Khương Vọng đứng trước ngôi mộ mới đắp ngoài
              Hoàn Chân quán, ánh trăng sáng vằng vặc chiếu rọi tấm lưng thẳng
              tắp như trường kiếm của thiếu niên.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#E4DFD7] bg-[#F2EFE9] px-6 py-4">
          <button
            type="button"
            onClick={() => onUpdateSettings(DEFAULT_READER_SETTINGS)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#D5CFC4] bg-white px-3.5 py-2 text-xs font-semibold text-[#1C1917] hover:bg-[#FAF8F5]"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Khôi phục mặc định
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-[#C83E31] px-5 py-2 text-xs font-semibold text-white hover:bg-[#B03226]"
          >
            Hoàn tất
          </button>
        </div>
      </div>
    </div>
  );
}
