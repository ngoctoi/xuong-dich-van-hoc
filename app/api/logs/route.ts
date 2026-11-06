import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    serverLogs: logger.getRecentServerLogs(),
    serverTime: new Date().toISOString(),
  });
}

export async function DELETE() {
  logger.clearServerLogs();
  return NextResponse.json({
    ok: true,
    clearedAt: new Date().toISOString(),
  });
}
