import { NextResponse } from 'next/server'
import { kientreConfig } from '@/lib/config/kientre'

export async function GET() {
 return NextResponse.json({
  ok: true,
  app: 'KientreAAA',
  config: kientreConfig,
 })
}
