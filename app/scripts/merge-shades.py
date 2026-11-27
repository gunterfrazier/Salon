"""Merge a shade list (seed/shades-*.txt) into seed/color-catalog.json. Re-runnable: lines are replaced, Kenra demi merges are idempotent."""
import json, sys
src, cat_path = sys.argv[1], "seed/color-catalog.json"
cat = json.load(open(cat_path, encoding="utf-8"))
blocks, cur = [], None
for raw in open(src, encoding="utf-8"):
    line = raw.strip()
    if not line or line.startswith("# "): continue
    if line.startswith("## "):
        brand, name, kind = [x.strip() for x in line[3:].split("|")]
        cur = {"brand": brand, "line": name, "kind": kind, "rows": []}; blocks.append(cur); continue
    code, nm, fam = [x.strip() for x in line.split("|")]
    cur["rows"].append({"code": code, "name": nm, "family": fam})

def brand_obj(name):
    for b in cat["brands"]:
        if b["brand"] == name: return b
    b = {"brand": name, "lines": []}; cat["brands"].append(b); return b

report = []
for blk in blocks:
    b = brand_obj(blk["brand"])
    codes = [r["code"] for r in blk["rows"]]
    assert len(codes) == len(set(codes)), f"duplicate code in {blk['line']}"
    if blk["kind"] == "demi-merge":
        line = next(l for l in b["lines"] if l["line"] == blk["line"])
        have = {s["code"]: s for s in line["shades"]}
        added, marked = [], []
        for r in blk["rows"]:
            if r["code"] == "Clear" and "Gloss" in have: continue  # Kenra's chart calls the clear "Gloss"
            s = have.get(r["code"])
            if s is None:
                line["shades"].append({"code": r["code"], "name": r["name"], "family": r["family"], "types": ["demi"]}); added.append(r["code"])
            elif "demi" not in s.get("types", []):
                s.setdefault("types", []).append("demi"); marked.append(r["code"])
        report.append(f"{blk['brand']} {blk['line']}: added demi shades {added}; marked existing as demi too {marked}")
        continue
    b["lines"] = [l for l in b["lines"] if l["line"] != blk["line"]]
    b["lines"].append({"line": blk["line"], "kind": blk["kind"], "source": "Supplier master list 2026-11-27", "shades": blk["rows"]})
    report.append(f"{blk['brand']} {blk['line']}: {len(blk['rows'])} shades")

cat["about"] = "Color catalog for the shade picker. Kenra and Redken Shades EQ transcribed from the brands' shade charts; Wella, Schwarzkopf, Matrix, Joico, Pulp Riot and Redken Color Gels Lacquers from the salon's supplier master list (2026-11-27)."
cat["sources"]["master_list"] = "Beauty Supplier Master List (salon-provided, 2026-11-27): blendsor.com Redken/Wella charts, paramountbeauty.com IGORA Royal, saloncentric.com Super Sync, joico.com LumiShine Demi, kenraprofessional.com Demi, pulpriothair.com OG semis"
json.dump(cat, open(cat_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
open(cat_path, "a").write("\n")
print("\n".join(report))
