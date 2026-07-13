import { designWord } from './compiler.mjs'
import { renderMarkdown } from './render.mjs'
import { outDirFor } from './paths.mjs'
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

export function slugify(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/\s+/g, '-').replace(/[^\w-]/g, '')
}

/** Ghi docModel -> model.json + final.md + final.docx trong output/<folderName>. */
export async function buildWord(docModel, folderName) {
  const outDir = outDirFor(folderName)
  await mkdir(path.join(outDir, 'images'), { recursive: true })
  const modelPath = path.join(outDir, 'model.json')
  await writeFile(modelPath, JSON.stringify(docModel, null, 2))
  await writeFile(path.join(outDir, 'final.md'), renderMarkdown(docModel))
  const wordPath = path.join(outDir, `${folderName}.docx`)   // tên docx = tên folder
  await designWord(modelPath, wordPath)
  return path.resolve(wordPath)
}
