import subprocess
import os
import sys
import re
import tempfile
import shutil

# Màu thương hiệu để mã TikZ có thể dùng tên BrandNavy / BrandOrange
COLOR_PREAMBLE = r"""
\definecolor{BrandNavy}{HTML}{1B3C6E}
\definecolor{BrandOrange}{HTML}{E8741C}
\definecolor{BrandGray}{HTML}{667085}
"""


def _clean_tikz(tikz_code):
    """Bỏ lớp \\begin{tikzpicture}...\\end{tikzpicture} nếu model đã tự bọc,
    và bỏ luôn \\documentclass/\\begin{document} nếu lỡ trả về cả file."""
    code = tikz_code.strip()
    # Nếu là một document hoàn chỉnh -> lấy phần trong tikzpicture
    m = re.search(r'\\begin\{tikzpicture\}(.*?)\\end\{tikzpicture\}', code, re.DOTALL)
    if m:
        return m.group(1).strip()
    # Bỏ các lệnh cấp document nếu lọt vào
    code = re.sub(r'\\documentclass.*', '', code)
    code = re.sub(r'\\usepackage.*', '', code)
    code = re.sub(r'\\begin\{document\}|\\end\{document\}', '', code)
    return code.strip()


def _pdf_to_png(pdf_file, output_path, workdir):
    """Chuyển PDF -> PNG với nhiều phương án dự phòng (macOS thân thiện)."""
    svg_file = os.path.join(workdir, "fig.svg")
    # Phương án 1: pdf2svg -> magick (nét, khử răng cưa tốt)
    if shutil.which("pdf2svg") and shutil.which("magick"):
        try:
            subprocess.run(["pdf2svg", pdf_file, svg_file], check=True, capture_output=True)
            subprocess.run(["magick", "-density", "300", "-background", "white",
                            "-alpha", "remove", svg_file, output_path],
                           check=True, capture_output=True)
            return True
        except Exception:
            pass
    # Phương án 2: magick trực tiếp trên PDF
    if shutil.which("magick"):
        try:
            subprocess.run(["magick", "-density", "300", pdf_file,
                            "-background", "white", "-alpha", "remove",
                            "-quality", "95", output_path],
                           check=True, capture_output=True)
            return True
        except Exception:
            pass
    # Phương án 3: pdftoppm (poppler)
    if shutil.which("pdftoppm"):
        try:
            base = output_path[:-4] if output_path.lower().endswith(".png") else output_path
            subprocess.run(["pdftoppm", "-png", "-r", "300", "-singlefile", pdf_file, base],
                           check=True, capture_output=True)
            produced = base + ".png"
            if produced != output_path and os.path.exists(produced):
                shutil.move(produced, output_path)
            return os.path.exists(output_path)
        except Exception:
            pass
    return False


def tikz_to_png(tikz_code, output_path):
    """Biên dịch mã TikZ sang PNG chất lượng cao.

    Dùng thư mục tạm RIÊNG cho mỗi lần gọi -> an toàn khi chạy song song
    (Promise.all trong orchestrator) và không để lại rác ở thư mục làm việc.
    """
    output_path = os.path.abspath(output_path)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    inner = _clean_tikz(tikz_code)
    workdir = tempfile.mkdtemp(prefix="tikz_")
    tex_file = os.path.join(workdir, "fig.tex")
    pdf_file = os.path.join(workdir, "fig.pdf")

    full_tex = rf"""\documentclass[tikz,border=6pt]{{standalone}}
\usepackage[utf8]{{vietnam}}
\usepackage{{amsmath,amssymb}}
\usepackage{{tikz}}
\usepackage{{tikz-3dplot}}
\usetikzlibrary{{shapes.geometric,arrows.meta,positioning,calc,angles,quotes,3d,perspective}}
{COLOR_PREAMBLE}
\begin{{document}}
\begin{{tikzpicture}}
{inner}
\end{{tikzpicture}}
\end{{document}}
"""
    with open(tex_file, "w", encoding="utf-8") as f:
        f.write(full_tex)

    try:
        if shutil.which("pdflatex"):
            cmd = ["pdflatex", "-interaction=nonstopmode", "-halt-on-error",
                   "-output-directory", workdir, tex_file]
        elif shutil.which("tectonic"):
            cmd = ["tectonic", "--outdir", workdir, tex_file]
        else:
            print("❌ Thiếu pdflatex/tectonic nên không thể biên dịch TikZ.", file=sys.stderr)
            return False

        proc = subprocess.run(
            cmd, capture_output=True, text=True, encoding="utf-8", errors="replace"
        )
        if not os.path.exists(pdf_file):
            log_tail = (proc.stdout or "")[-800:]
            print(f"❌ LaTeX không tạo được PDF.\n{log_tail}", file=sys.stderr)
            return False

        if _pdf_to_png(pdf_file, output_path, workdir):
            print(f"✅ Đã vẽ hình TikZ: {output_path}")
            return True
        print("❌ Không chuyển được PDF -> PNG (thiếu pdf2svg/magick/pdftoppm).", file=sys.stderr)
        return False
    except Exception as e:
        print(f"❌ Lỗi vẽ hình TikZ: {e}", file=sys.stderr)
        return False
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


if __name__ == "__main__":
    # Usage: python3 tikz_artist.py "path/to/out.png" "tikz code"
    if len(sys.argv) > 2:
        ok = tikz_to_png(sys.argv[2], sys.argv[1])
        sys.exit(0 if ok else 1)
