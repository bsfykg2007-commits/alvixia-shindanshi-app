#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LECページの「正解と配点」の先にある診断協会PDFを取得し、data/<年度>/<科目>.jsonへ
answer / answerLabel / points を反映します。

使い方:
  pip install requests beautifulsoup4 pymupdf
  python tools/import_answers_from_lec_and_jf.py

実行後:
  python tools/add_detailed_explanations_v3.py
"""
from pathlib import Path
from urllib.parse import urljoin, urlparse
import re, csv, json, time
import requests
from bs4 import BeautifulSoup
import fitz

ROOT=Path(__file__).resolve().parents[1]
DATA=ROOT/'data'
RAW=ROOT/'raw_answers'; RAW.mkdir(exist_ok=True)
LABELS=list('アイウエオカキ')
SUBJECTS=[('keizai','a','経済学'),('zaimu','b','財務'),('kigyou','c','企業経営理論'),('unei','d','運営管理'),('houmu','e','経営法務'),('jouhou','f','経営情報システム'),('chusho','g','中小企業')]
YEARS=[('r07','2025'),('r06','2024'),('r05','2023'),('r04','2022'),('r03','2021'),('r02','2020'),('r01','2019'),('h30','2018'),('h29','2017'),('h28','2016')]

def get(url):
    r=requests.get(url,timeout=30,headers={'User-Agent':'Mozilla/5.0'},allow_redirects=True)
    r.raise_for_status(); return r.content

def text_pdf(path):
    doc=fitz.open(path); return '\n'.join(p.get_text() for p in doc)

def norm(s): return re.sub(r'\s+','',s or '')

def candidate_urls():
    # direct JF-CMCA patterns. Some old years may differ; failures are reported.
    for yid,yyyy in YEARS:
        for sid,letter,_ in SUBJECTS:
            yield yid,sid,f'https://www.jf-cmca.jp/attach/test/{yid}/1ji_seikai/{yyyy}{letter}.pdf'
            yield yid,sid,f'https://www.jf-cmca.jp/attach/test/{yid}/1ji_seikai/{letter}_{yyyy}.pdf'
            yield yid,sid,f'https://www.jf-cmca.jp/attach/test/{yid}/1ji_seikai/{letter}_v2_{yyyy}0902.pdf'

def parse(text):
    t=norm(text).replace('－','-').replace('ー','-').replace('―','-')
    rows={}
    # examples: 第1問-オ4 / 第38問設問1オ2 / 設問2イ2
    cur_q=None
    pattern=re.compile(r'(第(\d+)問)?(?:-|ー|－|設問?([１２３４５６７８９0-9]+))?([アイウエオカキ])(\d+)')
    for m in pattern.finditer(t):
        if m.group(2): cur_q=int(m.group(2))
        if cur_q is None: continue
        sub=m.group(3)
        if sub: sub=sub.translate(str.maketrans('１２３４５６７８９','123456789'))
        lab=m.group(4); pts=int(m.group(5))
        if 1<=pts<=10: rows[(cur_q,sub)]=(lab,pts)
    return rows

def qkey(q):
    no=q.get('no','')
    m=re.search(r'第\s*(\d+)\s*問',no); qno=int(m.group(1)) if m else None
    sm=re.search(r'設問\s*([１２３４５６７８９0-9]+)',no)
    sub=sm.group(1).translate(str.maketrans('１２３４５６７８９','123456789')) if sm else None
    return qno,sub

def update(yid,sid,rows):
    fp=DATA/yid/f'{sid}.json'
    if not fp.exists(): return 0,0
    arr=json.loads(fp.read_text(encoding='utf-8'))
    hit=0
    for q in arr:
        qno,sub=qkey(q)
        if qno is None: continue
        val=rows.get((qno,sub)) or rows.get((qno,None))
        if not val: continue
        lab,pts=val; q['answerLabel']=lab; q['answer']=LABELS.index(lab); q['points']=pts; q['needsAnswerReview']=False; hit+=1
    fp.write_text(json.dumps(arr,ensure_ascii=False,indent=2),encoding='utf-8')
    return hit,len(arr)

def main():
    report=[]; used=set()
    for yid,sid,url in candidate_urls():
        key=(yid,sid)
        if key in used: continue
        name=re.sub(r'[^A-Za-z0-9_.-]+','_',f'{yid}_{sid}_{Path(urlparse(url).path).name}')
        pdf=RAW/name
        try:
            if not pdf.exists(): pdf.write_bytes(get(url)); time.sleep(0.2)
            rows=parse(text_pdf(pdf))
            hit,total=update(yid,sid,rows)
            if hit>0: used.add(key)
            report.append([yid,sid,url,len(rows),hit,total,'OK' if hit else 'no match'])
        except Exception as e:
            report.append([yid,sid,url,0,0,0,f'ERR {e}'])
    with (DATA/'answer_import_report.csv').open('w',newline='',encoding='utf-8-sig') as f:
        w=csv.writer(f); w.writerow(['年度','科目','URL','抽出行数','反映数','JSON問題数','状態']); w.writerows(report)
    print('完了 data/answer_import_report.csv を確認してください')
if __name__=='__main__': main()
