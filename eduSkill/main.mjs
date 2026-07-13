import { runSimplePipeline } from './server/pipeline.mjs'
import { renderMarkdown } from './server/render.mjs'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

async function main() {
  const topic = process.argv[2] || 'Trí tuệ nhân tạo'
  const model = process.argv[3] || 'gc/gemini-2.5-flash'
  
  try {
    const doc = await runSimplePipeline(topic, model)
    const md = renderMarkdown(doc)
    
    const outputPath = path.join('output', 'document.md')
    await writeFile(path.join('Sub-Hermes', outputPath), md, 'utf8')
    
    console.log(`\n✅ Đã tạo tài liệu thành công tại: Sub-Hermes/${outputPath}`)
    console.log('--- Nội dung tóm tắt ---')
    console.log(md.slice(0, 200) + '...')
  } catch (err) {
    console.error('❌ Lỗi:', err.message)
  }
}

main()
