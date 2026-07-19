import { NextResponse } from 'next/server'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { kientreConfig } from '@/lib/config/kientre'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const IMAGE_CACHE_DIR = path.join(kientreConfig.workspaceDir, '.image-cache')

const ASPECT_RATIOS: Record<string, string> = {
  square: '1:1',
  landscape: '16:9',
  portrait: '9:16',
}

interface ImageGenBody {
  prompt?: string
  aspectRatio?: string
}

async function readOpenRouterKey(): Promise<string> {
  const settingsPath = path.join(kientreConfig.hermesHome, 'kientre-webapp-settings.json')
  try {
    const raw = await fs.readFile(settingsPath, 'utf8')
    const keys = (JSON.parse(raw)?.apiKeys || {}) as Record<string, string>
    return String(keys.openrouter || '').trim()
  } catch {
    return ''
  }
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true })
}

export async function POST(req: Request) {
  const { prompt = '', aspectRatio = 'square' }: ImageGenBody = await req.json().catch(() => ({}))
  const text = (prompt || '').trim()
  if (!text) {
    return NextResponse.json({ ok: false, error: 'Thiếu prompt (mô tả ảnh cần tạo)' }, { status: 400 })
  }
  if (text.length > 2000) {
    return NextResponse.json({ ok: false, error: 'Prompt quá dài (tối đa 2000 ký tự)' }, { status: 400 })
  }

  const apiKey = await readOpenRouterKey()
  if (!apiKey) {
    return NextResponse.json({ ok: false, error: 'Chưa cấu hình OpenRouter API key. Vào Cài đặt → API Keys để nhập.' }, { status: 400 })
  }

  const orAspect = ASPECT_RATIOS[aspectRatio] || '1:1'

  const payload = {
    model: 'google/gemini-3-pro-image',
    modalities: ['image', 'text'],
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text },
      ],
    }],
    image_config: { aspect_ratio: orAspect },
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://kientre.vn',
        'X-Title': 'KientreAAA',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(180_000),
    })

    if (!response.ok) {
      let errMsg = `OpenRouter lỗi ${response.status}`
      try {
        const err = await response.json()
        errMsg = err?.error?.message || errMsg
      } catch {}
      return NextResponse.json({ ok: false, error: errMsg }, { status: 502 })
    }

    const result: any = await response.json()
    const images = result?.choices?.[0]?.message?.images
    if (!images || !images.length) {
      return NextResponse.json({ ok: false, error: 'OpenRouter không trả về ảnh. Thử lại prompt khác.' }, { status: 502 })
    }

    const imageUrl: string = images[0]?.image_url?.url || ''
    if (!imageUrl) {
      return NextResponse.json({ ok: false, error: 'Không đọc được dữ liệu ảnh từ OpenRouter.' }, { status: 502 })
    }

    // Save to local cache for stable access (OpenRouter URLs may expire)
    await ensureDir(IMAGE_CACHE_DIR)
    const timestamp = Date.now()
    const filename = `img_${timestamp}.png`
    const filepath = path.join(IMAGE_CACHE_DIR, filename)

    if (imageUrl.startsWith('data:')) {
      // base64 data URL — decode and save
      const b64 = imageUrl.includes(',') ? imageUrl.split(',')[1] : ''
      await fs.writeFile(filepath, Buffer.from(b64, 'base64'))
    } else {
      // Remote URL — download
      const imgResp = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) })
      if (!imgResp.ok) throw new Error('download failed')
      const buffer = Buffer.from(await imgResp.arrayBuffer())
      await fs.writeFile(filepath, buffer)
    }

    // Return both: data URL for immediate display + file path for persistence
    const b64 = (await fs.readFile(filepath)).toString('base64')
    const dataUrl = `data:image/png;base64,${b64}`

    return NextResponse.json({
      ok: true,
      image: dataUrl,
      path: filepath,
      filename,
      prompt: text,
      aspectRatio,
      model: 'google/gemini-3-pro-image',
    })
  } catch (e: any) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      return NextResponse.json({ ok: false, error: 'Yêu cầu tạo ảnh bị timeout (180s). Thử prompt ngắn hơn.' }, { status: 504 })
    }
    return NextResponse.json({ ok: false, error: `Lỗi tạo ảnh: ${e?.message || 'không rõ'}` }, { status: 500 })
  }
}
