export function renderMarkdown(doc) {
 const lines = [`# ${doc.title}`, '']
 lines.push(`**Môn:** ${doc.subject} · **Lớp:** ${doc.grade}`)
 lines.push(`*Chủ đề:* ${doc.topic}`, '')

 for (const sec of doc.sections || []) {
  lines.push(`## ${sec.heading}`, '')
  for (const b of sec.blocks || []) {
   switch (b.type) {
    case 'subheading':
    case 'heading':
     lines.push(`### ${b.text || b.title || ''}`, '')
     break
    case 'paragraph':
     lines.push(`${b.text || b.content || ''}`, '')
     break
    case 'list':
     for (const it of b.items || []) lines.push(`- ${it}`)
     lines.push('')
     break
    case 'keypoint':
    case 'note':
     lines.push(`> **📌 ${b.title || 'Ghi nhớ'}:** ${b.text || b.content || ''}`, '')
     break
    case 'theory':
     lines.push(`> ### ${b.title || 'Lý thuyết'}`, `> ${b.content || b.text || ''}`, '')
     break
    case 'example':
     lines.push(`**${b.title || 'Ví dụ'}:** ${b.problem || b.content || ''}`, '')
     if (b.solution) lines.push(`*Lời giải:* ${b.solution}`, '')
     break
    case 'exercise':
     lines.push(`**${b.title || 'Bài tập'}:** ${b.question || b.content || ''}`, '')
     break
    case 'solution':
     lines.push(`**${b.title || 'Bài'}.** ${b.content || b.solution || ''}`, '')
     break
    case 'image':
    case 'figure':
     if (b.path) lines.push(`![${b.caption || ''}](${b.path})`, '')
     else lines.push(`*[Hình: ${b.caption || b.desc || 'minh họa'}]*`, '')
     break
    default:
     lines.push(`${b.text || b.content || ''}`, '')
   }
  }
 }
 return lines.join('\n')
}
