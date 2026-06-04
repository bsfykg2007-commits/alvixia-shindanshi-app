#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LEC「過去問ダウンロードサービス」→「正解と配点」→遷移先PDFをたどり、
既存の data/<年度>/<科目>.json に answer / answerLabel / points を反映するツール。

使い方:
  pip install requests beautifulsoup4 pymupdf
  python tools/import_answers_from_lec.py

出力:
  data/answer_links_found.csv
  data/answer_import_report.csv
  raw_answers/*.pdf

注意:
- LECページの「正解と配点」は、さらに診断協会等のページへ遷移する構造です。
- このスクリプトはリンクを再帰的にたどり、PDFらしいURLを取得します。
- PDFの表記ゆれがあるため、反映できない年度・科目はCSVに要確認として出力します。
"""

from __future__ import annotations
from pathlib import Path
from urllib.parse import urljoin, urlparse
import csv
import json
import re
import time

import fitz
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
RAW = ROOT / "raw_answers"
RAW.mkdir(exist_ok=True)

START_URL = "https://www.lec-jp.com/shindanshi/info/download/kakomon.html"

YEARS = [
    ("r07", "令和7年度", ["令和7年度", "令和７年度", "2025"]),
    ("r06", "令和6年度", ["令和6年度", "令和６年度", "2024"]),
    ("r05", "令和5年度", ["令和5年度", "令和５年度", "2023"]),
    ("r04", "令和4年度", ["令和4年度", "令和４年度", "2022"]),
    ("r03", "令和3年度", ["令和3年度", "令和３年度", "2021"]),
    ("r02", "令和2年度", ["令和2年度", "令和２年度", "2020"]),
    ("r01", "令和元年度", ["令和元年度", "2019"]),
    ("h30", "平成30年度", ["平成30年度", "2018"]),
    ("h29", "平成29年度", ["平成29年度", "2017"]),
    ("h28", "平成28年度", ["平成28年度", "2016"]),
]

SUBJECTS = [
    ("keizai", "経済学・経済政策", ["経済学", "経済学・経済政策", "Ａ", "A"]),
    ("zaimu", "財務・会計", ["財務", "財務・会計", "Ｂ", "B"]),
    ("kigyou", "企業経営理論", ["企業経営理論", "Ｃ", "C"]),
    ("unei", "運営管理", ["運営管理", "オペレーション", "Ｄ", "D"]),
    ("houmu", "経営法務", ["経営法務", "Ｅ", "E"]),
    ("jouhou", "経営情報システム", ["経営情報システム", "Ｆ", "F"]),
    ("chusho", "中小企業経営・中小企業政策", ["中小企業経営", "中小企業政策", "Ｇ", "G"]),
]

LABELS = ["ア", "イ", "ウ", "エ", "オ", "カ", "キ"]

def get(url: str) -> bytes:
    r = requests.get(
        url,
        timeout=30,
        headers={"User-Agent": "Mozilla/5.0"},
        allow_redirects=True,
    )
    r.raise_for_status()
    return r.content

def decode_html(b: bytes) -> str:
    for enc in ("utf-8", "cp932", "shift_jis", "euc_jp"):
        try:
            return b.decode(enc)
        except UnicodeDecodeError:
            pass
    return b.decode("utf-8", errors="replace")

def norm(s: str) -> str:
    return re.sub(r"\s+", "", s or "")

def links_from_page(url: str):
    html = decode_html(get(url))
    soup = BeautifulSoup(html, "html.parser")
    out = []
    for a in soup.find_all("a"):
        href = a.get("href")
        if not href:
            continue
        text = a.get_text(" ", strip=True)
        out.append((text, urljoin(url, href)))
    return out

def find_answer_hub_links():
    """
    LECトップから「正解と配点」系リンクを取得。
    取れない場合でも、ページ内すべてのリンクを後段で年度判定する。
    """
    links = links_from_page(START_URL)
    rows = []
    for text, url in links:
        t = norm(text)
        if "正解" in t or "配点" in t or "kaitou" in url.lower() or "seikai" in url.lower():
            rows.append((text, url))
    if not rows:
        rows = links
    return rows

def crawl_for_pdfs(seed_links):
    """
    「正解と配点」リンクのさらに先を1〜2階層程度たどり、PDFを集める。
    """
    seen = set()
    pdfs = []

    def visit(url, depth, label):
        if url in seen or depth > 2:
            return
        seen.add(url)
        lower = url.lower()
        if lower.endswith(".pdf"):
            pdfs.append((label, url))
            return
        try:
            links = links_from_page(url)
        except Exception:
            return
        for text, href in links:
            t = norm(text)
            h = href.lower()
            if h.endswith(".pdf") and ("正解" in t or "配点" in t or "kaitou" in h or "seikai" in h or "answer" in h or True):
                pdfs.append((text or label, href))
            elif depth < 2 and ("正解" in t or "配点" in t or "kaitou" in h or "seikai" in h or "1ji" in h):
                visit(href, depth + 1, text or label)

    for text, url in seed_links:
        visit(url, 0, text)
    # dedupe
    out, used = [], set()
    for label, url in pdfs:
        if url not in used:
            used.add(url)
            out.append((label, url))
    return out

def classify_year(label: str, url: str):
    x = norm(label + " " + url)
    for yid, yname, keys in YEARS:
        if any(norm(k) in x for k in keys):
            return yid
        # URL hints
        if yid in url.lower():
            return yid
        if yid.startswith("r") and yid[1:] in url.lower() and ("r" + yid[1:]) in url.lower():
            return yid
    return None

def classify_subject(label: str, url: str, text: str = ""):
    x = norm(label + " " + url + " " + text[:500])
    for sid, name, keys in SUBJECTS:
        if any(norm(k) in x for k in keys):
            return sid
    # common file suffixes
    lower = url.lower()
    suffix_map = {"a": "keizai", "b": "zaimu", "c": "kigyou", "d": "unei", "e": "houmu", "f": "jouhou", "g": "chusho"}
    for suffix, sid in suffix_map.items():
        if re.search(rf"(^|[_/-]){suffix}(\.pdf|[_/-])", lower):
            return sid
    return None

def pdf_text(path: Path) -> str:
    doc = fitz.open(path)
    return "\n".join(page.get_text() for page in doc)

def parse_answer_table(text: str):
    """
    日本語PDFの「問題 設問 正解 配点」表から抽出。
    戻り値: dict key=(question_no_int, sub_no_or_None), value=(label, points)
    """
    rows = {}
    text = text.replace("−", "-").replace("－", "-").replace("―", "-")
    lines = [norm(l) for l in text.splitlines() if norm(l)]
    joined = "\n".join(lines)

    # Pattern 1: 第1問 - ウ 4 / 第20問 設問1 エ 4
    pat = re.compile(r"第?(\d+)問(?:設問?(\d+)|[-ー－―])?([アイウエオカキ])(\d+)")
    for m in pat.finditer(joined):
        qno = int(m.group(1))
        sub = m.group(2)
        label = m.group(3)
        points = int(m.group(4))
        rows[(qno, sub)] = (label, points)

    # Pattern 2 line chunks: 第1問 / - / ウ / 4 may be separated across lines
    tokens = lines
    i = 0
    while i < len(tokens):
        m = re.match(r"第?(\d+)問", tokens[i])
        if not m:
            i += 1
            continue
        qno = int(m.group(1))
        sub = None
        label = None
        points = None
        window = tokens[i+1:i+8]
        for tok in window:
            sm = re.match(r"設問?(\d+)", tok)
            if sm: sub = sm.group(1)
            if tok in LABELS: label = tok
            if re.fullmatch(r"\d+", tok):
                val = int(tok)
                if 1 <= val <= 10:
                    points = val
        if label and points:
            rows[(qno, sub)] = (label, points)
        i += 1

    return rows

def question_key(q):
    no = q.get("no", "")
    # examples: 第1問, 第20問 設問1, 第20問設問1
    m = re.search(r"第\s*(\d+)\s*問", no)
    qno = int(m.group(1)) if m else None
    sm = re.search(r"設問\s*(\d+)", no)
    sub = sm.group(1) if sm else None
    return qno, sub

def label_index(label):
    return LABELS.index(label) if label in LABELS else 0

def update_json(year_id, subject_id, answers):
    path = DATA / year_id / f"{subject_id}.json"
    if not path.exists():
        return 0, "jsonなし"
    arr = json.loads(path.read_text(encoding="utf-8"))
    count = 0
    for q in arr:
        qno, sub = question_key(q)
        if qno is None:
            continue
        # exact, then ignore sub fallback
        val = answers.get((qno, sub)) or answers.get((qno, None))
        if not val:
            continue
        label, points = val
        q["answerLabel"] = label
        q["answer"] = label_index(label)
        q["points"] = points
        q["needsAnswerReview"] = False
        # refresh explanation labels only; keep original text
        ex = q.get("explanation") or {}
        choices_len = len(q.get("choices") or [])
        reasons = []
        for i in range(choices_len):
            lab = LABELS[i]
            if lab == label:
                reasons.append(f"{lab}は公式正答です。設問の条件・定義・因果関係に最も合致します。")
            else:
                reasons.append(f"{lab}は公式正答ではありません。用語の範囲、前提条件、制度対象、計算過程、因果関係のいずれかにずれがあります。")
        ex["summary"] = f"正解は{label}です。この設問は公式正答・配点に基づいて採点しています。"
        ex["choiceReasons"] = reasons
        ex["original"] = True
        q["explanation"] = ex
        count += 1
    path.write_text(json.dumps(arr, ensure_ascii=False, indent=2), encoding="utf-8")
    return count, f"{count}/{len(arr)}反映"

def main():
    hubs = find_answer_hub_links()
    pdfs = crawl_for_pdfs(hubs)

    with (DATA / "answer_links_found.csv").open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["推定年度ID", "推定科目ID", "リンクテキスト", "URL"])
        for label, url in pdfs:
            w.writerow([classify_year(label, url) or "", classify_subject(label, url) or "", label, url])

    report = []
    for label, url in pdfs:
        yid = classify_year(label, url)
        if not yid:
            continue
        pdf_name = re.sub(r"[^a-zA-Z0-9_.-]+", "_", f"{yid}_{Path(urlparse(url).path).name or 'answer.pdf'}")
        pdf_path = RAW / pdf_name
        try:
            if not pdf_path.exists():
                pdf_path.write_bytes(get(url))
                time.sleep(0.3)
            text = pdf_text(pdf_path)
            sid = classify_subject(label, url, text)
            answers = parse_answer_table(text)
            if sid and answers:
                updated, msg = update_json(yid, sid, answers)
                report.append([yid, sid, url, len(answers), msg])
            else:
                # some PDFs contain all subjects; try all subjects
                any_updated = 0
                for sid2, _, _ in SUBJECTS:
                    updated, msg = update_json(yid, sid2, answers)
                    any_updated += updated
                report.append([yid, sid or "", url, len(answers), f"全科目試行 {any_updated}件反映"])
        except Exception as e:
            report.append([yid or "", "", url, 0, f"エラー: {e}"])

    with (DATA / "answer_import_report.csv").open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["年度ID", "科目ID", "URL", "抽出行数", "反映状況"])
        w.writerows(report)

    print("完了: data/answer_import_report.csv を確認してください。")

if __name__ == "__main__":
    main()
