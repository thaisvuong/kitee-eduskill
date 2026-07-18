import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib import font_manager
from pathlib import Path
import sys
import json

# Font hỗ trợ tiếng Việt (DejaVu Sans luôn có sẵn cùng matplotlib)
for cand in ("Arial", "DejaVu Sans"):
  if any(f.name == cand for f in font_manager.fontManager.ttflist):
    plt.rcParams["font.family"] = cand
    break
plt.rcParams["axes.unicode_minus"] = False

BRAND = ["#1B3C6E", "#E8741C", "#3E7CB1", "#F0A868", "#64748B", "#9DB4C0", "#C44536"]


def gen_pie(data, labels, title, output_path):
  data = [abs(float(x)) for x in data]
  n = len(data)
  colors = [BRAND[i % len(BRAND)] for i in range(n)]

  fig, ax = plt.subplots(figsize=(6.2, 5.2), dpi=200)
  wedges, _texts, autotexts = ax.pie(
    data,
    labels=None,
    autopct=lambda p: f"{p:.1f}%" if p >= 4 else "",
    startangle=90,
    counterclock=False,
    colors=colors,
    pctdistance=0.74,
    wedgeprops=dict(width=0.42, edgecolor="white", linewidth=2), # donut
  )
  for t in autotexts:
    t.set_color("white")
    t.set_fontsize(11)
    t.set_fontweight("bold")

  ax.set_title(title, fontsize=14, fontweight="bold", color="#1B3C6E", pad=16)
  ax.legend(
    wedges, labels,
    loc="center left", bbox_to_anchor=(0.98, 0.5),
    frameon=False, fontsize=10.5,
  )
  ax.axis("equal")
  Path(output_path).parent.mkdir(parents=True, exist_ok=True)
  fig.savefig(output_path, bbox_inches="tight", facecolor="white")
  plt.close(fig)
  print(f"✅ Đã vẽ biểu đồ: {output_path}")


if __name__ == "__main__":
  # python chart_gen.py out.png "[40,30,30]" "[\"A\",\"B\",\"C\"]" "Tiêu đề"
  gen_pie(json.loads(sys.argv[2]), json.loads(sys.argv[3]), sys.argv[4], sys.argv[1])
