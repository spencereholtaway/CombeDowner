"""Helper for compare_views.mjs: joins two shots side by side, measures how far they differ, and
lays a run's pairs out as one contact sheet.

  python3 -I tools/compare_pair.py pair <main.png> <ours.png> <out.jpg> <name>   (prints the difference as JSON)
  python3 -I tools/compare_pair.py contact <out.jpg> <items.json>                (items: [{name, pair, diff, flagged}])
"""
import json, sys
from PIL import Image, ImageChops, ImageDraw, ImageFont


def font(size):
    for f in ("/System/Library/Fonts/Helvetica.ttc", "/System/Library/Fonts/Supplemental/Arial.ttf"):
        try:
            return ImageFont.truetype(f, size)
        except OSError:
            pass
    return ImageFont.load_default()


def label(img, text, xy, size):
    d = ImageDraw.Draw(img)
    f = font(size)
    box = d.textbbox(xy, text, font=f)
    d.rectangle((box[0] - 4, box[1] - 2, box[2] + 4, box[3] + 2), fill=(0, 0, 0))
    d.text(xy, text, fill=(255, 255, 255), font=f)


def pair(main, ours, out, name):
    a, b = Image.open(main).convert("RGB"), Image.open(ours).convert("RGB")
    if a.size != b.size:
        b = b.resize(a.size)
    w, h = a.size
    top = int(h * 0.2)     # the sky and the top fifth are not what a map change moves
    d = ImageChops.difference(a.crop((0, top, w, h)), b.crop((0, top, w, h))).convert("L")
    hist = d.histogram()
    changed = sum(hist[25:])
    pct = 100.0 * changed / (w * (h - top))
    sheet = Image.new("RGB", (w * 2 + 6, h), (255, 0, 255))
    sheet.paste(a, (0, 0)); sheet.paste(b, (w + 6, 0))
    label(sheet, f"MAIN  {name}", (10, 10), 28)
    label(sheet, f"OURS  {name}  diff {pct:.1f}%", (w + 16, 10), 28)
    sheet.save(out, quality=88)
    print(json.dumps({"diff": round(pct, 2)}))


def contact(out, items_file, cols=3, tw=640):
    items = json.load(open(items_file))
    if not items:
        return
    pw = tw
    first = Image.open(items[0]["pair"])
    th = round(first.height * pw / first.width)
    bar = 22
    rows = (len(items) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * pw + (cols + 1) * 4, rows * (th + bar + 4) + 4), (30, 30, 30))
    d = ImageDraw.Draw(sheet)
    f = font(15)
    for i, it in enumerate(items):
        x, y = 4 + (i % cols) * (pw + 4), 4 + (i // cols) * (th + bar + 4)
        im = Image.open(it["pair"]).convert("RGB").resize((pw, th), Image.LANCZOS)
        sheet.paste(im, (x, y + bar))
        col = (255, 200, 80) if it.get("flagged") else (230, 230, 230)
        d.text((x + 2, y + 3), f"{it['name']}   diff {it['diff']:.1f}%" + ("   FLAGGED" if it.get("flagged") else ""), fill=col, font=f)
    sheet.save(out, quality=85)


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[0] == "pair":
        pair(*a[1:5])
    else:
        contact(a[1], a[2])
