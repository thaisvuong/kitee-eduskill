import { NextResponse } from 'next/server'
import { kiteeConfig } from '@/lib/config/kitee'

export async function GET() {
  return NextResponse.json({
    ok: true,
    app: 'Kitee eduSkill Admin',
    config: kiteeConfig,
  })
}
