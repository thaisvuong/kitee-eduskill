import { chatJSON } from '../server/llm.mjs'

const ABSTRACT_MATH = /\b(tỉ số|ti so|phần trăm|phan tram|phân số|phan so|số thập phân|so thap phan|biểu đồ|bieu do|hình học|hinh hoc|chu vi|diện tích|dien tich|góc|goc|đường thẳng|duong thang)\b/i
const CONCRETE_CONTEXT = /\b(cửa hàng|giam gia|giảm giá|mua bán|hoa quả|trái cây|con vật|cây|lá|bản đồ|địa danh|nghề|thời tiết|thí nghiệm|lịch sử|địa lí|khoa học)\b/i

function normalizeDecision(res = {}) {
  const shouldAdd = Boolean(res.shouldAdd)
  const kind = ['photo', 'tikz', 'chart', 'none'].includes(res.kind) ? res.kind : 'none'
  return {
    shouldAdd: shouldAdd && kind !== 'none',
    kind: shouldAdd ? kind : 'none',
    placement: String(res.placement || 'after_section_intro'),
    reason: String(res.reason || ''),
    query: String(res.query || ''),
    desc: String(res.desc || res.caption || res.query || ''),
    caption: String(res.caption || res.desc || res.query || ''),
    chart: res.chart && typeof res.chart === 'object' ? res.chart : null,
  }
}

/**
 * VisualCurator — quyết định chiến lược minh họa sư phạm cho một phần nội dung.
 * Trả về JSON đã chuẩn hóa; không tải/vẽ ảnh trực tiếp.
 */
export async function curateVisual({ topic, grade, subject = 'Toán', chunk = '', content = '', boundaries = {} }, model = process.env.HERMES_VISUAL_MODEL || process.env.HERMES_WORKER_MODEL || 'gc/gemini-2.5-flash') {
  const mode = String(process.env.HERMES_VISUALS || 'auto').toLowerCase()
  if (mode === 'off' || mode === '0' || mode === 'false') {
    return { shouldAdd: false, kind: 'none', reason: 'HERMES_VISUALS=off', query: '', desc: '', caption: '', chart: null }
  }

  const joined = `${topic} ${chunk} ${content}`
  if (mode !== 'force' && ABSTRACT_MATH.test(joined) && !CONCRETE_CONTEXT.test(joined)) {
    return { shouldAdd: false, kind: 'none', reason: 'Nội dung toán trừu tượng; ảnh web dễ sai, ưu tiên ví dụ/bảng/hình tự vẽ khi cần.', query: '', desc: '', caption: '', chart: null }
  }

  const system = `Bạn là VisualCurator — chuyên gia chọn minh họa sư phạm cho tài liệu học sinh.
Nhiệm vụ: quyết định CÓ NÊN thêm hình minh họa không, và nếu có thì loại nào.
Bạn cực kỳ thận trọng: không thêm hình nếu hình không trực tiếp giúp hiểu bài.
Luôn trả JSON hợp lệ, không markdown.`

  const user = `Bối cảnh:
- Lớp: ${grade}
- Môn: ${subject}
- Chủ đề: ${topic}
- Phần: ${chunk}
- Ranh giới lớp học: ${JSON.stringify(boundaries || {}).slice(0, 2000)}

Nội dung phần này:
"""
${String(content || '').slice(0, 5000)}
"""

Quy tắc nghiêm ngặt:
1. Nếu nội dung là toán trừu tượng thuần (phép tính, phân số, tỉ số phần trăm, số thập phân) và không có ngữ cảnh đời sống rõ ràng, thường trả shouldAdd=false.
2. Chỉ chọn kind="photo" nếu có chủ thể cụ thể, dễ tìm ảnh thật an toàn: đồ vật, con vật, hiện tượng tự nhiên, tình huống đời sống cụ thể.
3. Với hình học/biểu đồ/sơ đồ, chọn kind="tikz" hoặc "chart" nếu thật sự cần; không chọn ảnh web mơ hồ.
4. Tối đa một hình cho phần này. Không quảng cáo, logo, chính trị, người lớn, ảnh gây nhiễu.
5. Query ảnh phải bằng tiếng Anh, cụ thể, school appropriate.

Trả JSON đúng schema:
{
  "shouldAdd": true|false,
  "kind": "photo"|"tikz"|"chart"|"none",
  "placement": "after_section_intro"|"after_example"|"end_section",
  "reason": "lý do ngắn",
  "query": "english image search query nếu photo",
  "desc": "mô tả hình nếu tikz/photo/chart",
  "caption": "chú thích tiếng Việt ngắn",
  "chart": {"title":"...", "labels":["..."], "data":[1,2,3]} | null
}`

  const res = await chatJSON({ model, system, user, temperature: 0.1 })
  return normalizeDecision(res)
}
