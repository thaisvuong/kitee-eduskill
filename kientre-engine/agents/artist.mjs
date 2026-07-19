import { chatJSON } from '../server/llm.mjs'
import { compileTikzToPng } from '../server/compiler.mjs'

const SYSTEM = "Bạn là Họa sĩ TikZ/LaTeX chuyên vẽ hình học tiểu học. Bạn chỉ trả về JSON chứa mã TikZ hợp lệ, tự-chứa, biên dịch được ngay."

// Mẫu tham chiếu: hình hộp chữ nhật bằng PHÉP CHIẾU XIÊN 2D (luôn biên dịch được).
const REFERENCE = String.raw`
% Phép chiếu xiên: mặt trước là hình chữ nhật, lùi sâu bằng vector (dx,dy).
\def\dx{1.6}\def\dy{1.1}
% Mặt trước
\draw[BrandNavy,very thick] (0,0)--(5,0)--(5,3)--(0,3)--cycle;
% Mặt sau (cạnh khuất dùng nét đứt)
\draw[BrandNavy,very thick] (\dx,\dy)--(5+\dx,\dy);
\draw[BrandNavy,very thick] (5+\dx,\dy)--(5+\dx,3+\dy)--(\dx,3+\dy);
\draw[BrandNavy,very thick,dashed] (\dx,\dy)--(\dx,3+\dy);
% Cạnh nối
\draw[BrandNavy,very thick] (5,0)--(5+\dx,\dy);
\draw[BrandNavy,very thick] (5,3)--(5+\dx,3+\dy);
\draw[BrandNavy,very thick] (0,3)--(\dx,3+\dy);
\draw[BrandNavy,very thick,dashed] (0,0)--(\dx,\dy);
% Nhãn kích thước
\node[below] at (2.5,0) {\textcolor{BrandOrange}{a}};
\node[right] at (5+\dx/2,\dy/2) {\textcolor{BrandOrange}{b}};
\node[left] at (0,1.5) {\textcolor{BrandOrange}{h}};
`

function buildPrompt(figureDesc, prev) {
 let p = `Yêu cầu vẽ hình: ${figureDesc}

CHÍNH XÁC: Vẽ ĐÚNG theo mô tả — đúng LOẠI hình, đúng SỐ ĐO và NHÃN được nêu (nếu có), đúng số cạnh/đỉnh/góc. KHÔNG thêm chi tiết sai hoặc bỏ sót thông tin trong mô tả. Ghi nhãn số đo ngay cạnh tương ứng.

QUY TẮC BẮT BUỘC (để mã biên dịch được ngay):
- Chỉ dùng lệnh TikZ cơ bản: \\draw, \\node, \\coordinate, \\fill, \\def. KHÔNG dùng \\point hay bất kỳ macro tự chế nào chưa định nghĩa.
- TUYỆT ĐỐI KHÔNG dùng tikz-3dplot, tdplot_main_coords, hay toạ độ 3D (x,y,z). Với hình khối (hộp chữ nhật, lập phương), hãy vẽ bằng PHÉP CHIẾU XIÊN 2D như mẫu.
- Cạnh nhìn thấy: nét liền (very thick). Cạnh bị khuất: nét đứt (dashed).
- Có thể dùng màu BrandNavy, BrandOrange, BrandGray.
- Mã phải nằm GỌN trong môi trường tikzpicture (KHÔNG kèm \\documentclass, \\begin{document}, \\usepackage).

MẪU THAM CHIẾU cho hình hộp chữ nhật (hãy mô phỏng phong cách này, chỉnh theo yêu cầu):
${REFERENCE}

Trả về JSON: {"tikz": "..."}`

 if (prev?.error) {
  p += `

LẦN TRƯỚC BIÊN DỊCH LỖI. Mã cũ:
${prev.code}

Lỗi pdflatex:
${prev.error}

Hãy SỬA lại để hết lỗi (thường do dùng macro/thư viện chưa nạp). Trả về JSON mới.`
 }
 return p
}

/** Làm sạch mô tả hình: bỏ markup LaTeX ($...$, \text, \frac...) để nhãn TikZ là chữ thường. */
function plainLabel(s) {
 return String(s || '')
  .replace(/\\text\{([^}]*)\}/g, '$1')
  .replace(/\\mathrm\{([^}]*)\}/g, '$1')
  .replace(/\\d?frac\{([^}]*)\}\{([^}]*)\}/g, '$1/$2')
  .replace(/\\times/g, 'x')
  .replace(/\\,/g, ' ')
  .replace(/[$\\]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
}

/** Sinh mã TikZ cho một mô tả hình. */
export async function runArtist(figureDesc, model = process.env.HERMES_ARTIST_MODEL || process.env.HERMES_WORKER_MODEL || 'gc/gemini-2.5-flash', prev = null) {
 return chatJSON({ model, system: SYSTEM, user: buildPrompt(plainLabel(figureDesc), prev) })
}

/** Vẽ hình có TỰ SỬA LỖI: nếu biên dịch hỏng, đưa log lỗi lại cho Artist sửa (tối đa 3 lần). */
export async function drawTikzFigure(figureDesc, outPath, model = process.env.HERMES_ARTIST_MODEL || 'gc/gemini-2.5-flash') {
 let prev = null
 for (let attempt = 1; attempt <= 3; attempt++) {
  const art = await runArtist(figureDesc, model, prev)
  if (!art?.tikz) return false
  try {
   await compileTikzToPng(art.tikz, outPath)
   return true
  } catch (err) {
   const tail = String(err.message).split('\n').filter(l => l.trim()).slice(-5).join(' ').slice(0, 600)
   prev = { code: art.tikz, error: tail }
   console.warn(`  ↻ TikZ lỗi (lần ${attempt}), Artist đang tự sửa...`)
  }
 }
 return false
}
