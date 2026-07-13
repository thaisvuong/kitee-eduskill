import { execFile } from 'node:child_process'
import { pyScript as py, PYTHON, cleanEnv } from './paths.mjs'

/** Thiết kế Word đẹp bằng Python docx */
export async function designWord(docModelPath, outputPath) {
  return new Promise((resolve, reject) => {
    execFile(PYTHON, [py('word_designer.py'), docModelPath, outputPath], { env: cleanEnv() }, (err, stdout, stderr) => {
      if (err) reject(new Error(`Lỗi Word Designer: ${stderr || stdout}`))
      else resolve(outputPath)
    })
  })
}

/** Vẽ biểu đồ hình quạt tròn */
export async function generatePieChart(chartData, outputPath) {
  return new Promise((resolve, reject) => {
    execFile(PYTHON, [
      py('chart_gen.py'),
      outputPath,
      JSON.stringify(chartData.data),
      JSON.stringify(chartData.labels),
      chartData.title
    ], { env: cleanEnv() }, (err, stdout, stderr) => {
      if (err) reject(new Error(`Lỗi Chart Gen: ${stderr || stdout}`))
      else resolve(outputPath)
    })
  })
}

/** Xuất PNG từ mã TikZ sử dụng kịch bản Python mới */
export async function compileTikzToPng(tikzCode, outputPath) {
  return new Promise((resolve, reject) => {
    execFile(PYTHON, [py('tikz_artist.py'), outputPath, tikzCode], { env: cleanEnv() }, (err, stdout, stderr) => {
      if (err) {
        console.error("Lỗi TikZ:", stderr || stdout)
        reject(new Error(`Lỗi Artist Agent: ${stderr || stdout}`))
      }
      else resolve(outputPath)
    })
  })
}
