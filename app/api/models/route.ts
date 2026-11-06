import { NextRequest, NextResponse } from 'next/server';
import {
  geminiKeyPool,
  getAvailableThinkingLevelsFromSdk,
} from '@/lib/gemini-server';
import {
  DEFAULT_THINKING_LEVEL,
  MODEL_ALIAS_OPTIONS,
} from '@/lib/seed-data';
import { createRequestId, logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  const reqId = createRequestId('MOD');
  const startMs = Date.now();
  try {
    geminiKeyPool.syncFromRequest(req);
    const modelParam =
      req.nextUrl.searchParams.get('model') || 'gemini-flash-latest';
    const poolStatus = geminiKeyPool.getPoolStatus(modelParam);
    const savedRawKeys = geminiKeyPool.getSavedProjectKeysRaw();
    const availableModels = [...MODEL_ALIAS_OPTIONS];
    let targetModelThinkingSupported = true;

    if (poolStatus.totalConfiguredKeys > 0) {
      try {
        const { result: pager } = await geminiKeyPool.executeWithKeyRotation(
          async (ai) => {
            return await ai.models.list();
          },
          modelParam,
          undefined,
          { reqId, endpoint: '/api/models', label: 'models_list' }
        );

        const seenIds = new Set(availableModels.map((m) => m.id));
        for await (const m of pager) {
          const rawName = (m.name || '').replace(/^models\//, '');
          const mWithThinking = m as { thinking?: boolean };
          if (
            rawName === modelParam &&
            typeof mWithThinking.thinking === 'boolean'
          ) {
            targetModelThinkingSupported = mWithThinking.thinking;
          }
          if (
            rawName &&
            rawName.startsWith('gemini-') &&
            !rawName.includes('embedding') &&
            !rawName.includes('image') &&
            !rawName.includes('tts') &&
            !rawName.includes('live') &&
            !seenIds.has(rawName)
          ) {
            seenIds.add(rawName);
            availableModels.push({
              id: rawName,
              label: `${rawName} (Tự động phát hiện từ API)`,
              badge: 'API Live',
            });
          }
        }
      } catch (listErr) {
        logger.debug(
          'MODELS_API',
          'Dùng danh sách model mặc định (models.list tạm thời không khả dụng)',
          {
            reason: (listErr as Error)?.message,
            totalConfiguredKeys: poolStatus.totalConfiguredKeys,
          },
          reqId
        );
      }
    }

    const thinkingLevels = getAvailableThinkingLevelsFromSdk(
      modelParam,
      targetModelThinkingSupported
    );

    logger.debug(
      'MODELS_API',
      `GET /api/models hoàn tất (${Date.now() - startMs}ms) — Tổng bể: ${poolStatus.totalConfiguredKeys} Key • ThinkingLevels=${thinkingLevels.map((t) => t.id).join(',')}`,
      {
        modelParam,
        thinkingLevels: thinkingLevels.map((t) => t.id),
        defaultThinkingLevel: DEFAULT_THINKING_LEVEL,
        totalKeys: poolStatus.totalConfiguredKeys,
        readyKeys: poolStatus.readyKeys,
        coolingDownKeys: poolStatus.coolingDownKeys,
      },
      reqId
    );

    return NextResponse.json({
      models: availableModels,
      liveModels: availableModels.map((m) => m.id),
      thinkingLevels,
      defaultThinkingLevel: DEFAULT_THINKING_LEVEL,
      savedRawKeys,
      poolStatus,
      poolStats: {
        totalKeys: poolStatus.totalConfiguredKeys,
        activeKeys: poolStatus.readyKeys,
        idleReadyKeys: poolStatus.idleReadyKeys,
        inUseKeys: poolStatus.inUseKeys,
        coolingDownKeys: poolStatus.coolingDownKeys,
        invalidKeys: poolStatus.invalidKeys,
        hasProjectSavedKeys: poolStatus.hasProjectSavedKeys,
        projectSavedKeyCount: poolStatus.projectSavedKeyCount,
      },
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Lỗi khi kiểm tra danh sách model.';
    logger.error('MODELS_API', `GET /api/models thất bại: ${message}`, error, reqId);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const reqId = createRequestId('KEY');
  const startMs = Date.now();
  try {
    const body = await req.json();
    const {
      action = 'save_keys',
      rawKeys = '',
      model = 'gemini-flash-latest',
    } = body as {
      action?: 'save_keys' | 'reset_cooldowns' | 'check_all';
      rawKeys?: string;
      model?: string;
    };

    logger.info(
      'MODELS_API',
      `POST /api/models (action=${action}, model=${model})`,
      { action, model, rawKeysCharLen: rawKeys.length },
      reqId
    );

    if (action === 'save_keys') {
      const { savedCount, totalPoolKeys } =
        geminiKeyPool.saveProjectKeysToDisk(rawKeys);
      const poolStatus = geminiKeyPool.getPoolStatus(model);
      const savedRawKeys = geminiKeyPool.getSavedProjectKeysRaw();
      logger.info(
        'MODELS_API',
        `Đã cập nhật bể Key: lưu ${savedCount} Key (Tổng bể: ${totalPoolKeys} Key)`,
        { savedCount, totalPoolKeys },
        reqId
      );
      return NextResponse.json({
        ok: true,
        savedCount,
        totalPoolKeys,
        savedRawKeys,
        poolStatus,
        poolStats: {
          totalKeys: poolStatus.totalConfiguredKeys,
          activeKeys: poolStatus.readyKeys,
          idleReadyKeys: poolStatus.idleReadyKeys,
          inUseKeys: poolStatus.inUseKeys,
          coolingDownKeys: poolStatus.coolingDownKeys,
          invalidKeys: poolStatus.invalidKeys,
          hasProjectSavedKeys: poolStatus.hasProjectSavedKeys,
          projectSavedKeyCount: poolStatus.projectSavedKeyCount,
        },
      });
    }

    if (action === 'reset_cooldowns') {
      geminiKeyPool.syncFromRequest(req);
      geminiKeyPool.resetAllCooldowns();
      const poolStatus = geminiKeyPool.getPoolStatus(model);
      logger.info(
        'MODELS_API',
        `Đã xóa toàn bộ trạng thái Cooldown 429 cho ${poolStatus.totalConfiguredKeys} Key`,
        { totalKeys: poolStatus.totalConfiguredKeys },
        reqId
      );
      return NextResponse.json({
        ok: true,
        poolStatus,
        poolStats: {
          totalKeys: poolStatus.totalConfiguredKeys,
          activeKeys: poolStatus.readyKeys,
          idleReadyKeys: poolStatus.idleReadyKeys,
          inUseKeys: poolStatus.inUseKeys,
          coolingDownKeys: poolStatus.coolingDownKeys,
          invalidKeys: poolStatus.invalidKeys,
          hasProjectSavedKeys: poolStatus.hasProjectSavedKeys,
          projectSavedKeyCount: poolStatus.projectSavedKeyCount,
        },
      });
    }

    if (action === 'check_all') {
      geminiKeyPool.syncFromRequest(req);
      const report = await geminiKeyPool.checkAllKeysAndApis(model);
      logger.info(
        'MODELS_API',
        `Hoàn tất Chẩn đoán Toàn diện Key & API trong ${Date.now() - startMs}ms`,
        {
          modelTested: report.modelTested,
          keyResultsCount: report.keyResults.length,
          endpointResults: report.endpointResults,
        },
        reqId
      );
      return NextResponse.json({
        ok: true,
        ...report,
        poolStats: {
          totalKeys: report.poolStatus.totalConfiguredKeys,
          activeKeys: report.poolStatus.readyKeys,
          idleReadyKeys: report.poolStatus.idleReadyKeys,
          inUseKeys: report.poolStatus.inUseKeys,
          coolingDownKeys: report.poolStatus.coolingDownKeys,
          invalidKeys: report.poolStatus.invalidKeys,
          hasProjectSavedKeys: report.poolStatus.hasProjectSavedKeys,
          projectSavedKeyCount: report.poolStatus.projectSavedKeyCount,
        },
      });
    }

    return NextResponse.json(
      { error: 'Hành động không hợp lệ.' },
      { status: 400 }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : 'Lỗi khi xử lý bể Key & chẩn đoán API.';
    logger.error('MODELS_API', `POST /api/models thất bại: ${message}`, err, reqId);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
