import sys
from pathlib import Path

from pypdf import PdfReader

if len(sys.argv) < 3:
    raise SystemExit("Usage: python pdf_to_text_temp.py <input.pdf> <output.txt>")

source = Path(sys.argv[1])
target = Path(sys.argv[2])

reader = PdfReader(source)
sections: list[str] = []
for idx, page in enumerate(reader.pages, start=1):
    text = page.extract_text() or ""
    sections.append(f"--- PAGE {idx} ---\n{text}")

target.write_text("\n\n".join(sections), encoding="utf-8")
print(f"Wrote {target} ({len(reader.pages)} pages)")
