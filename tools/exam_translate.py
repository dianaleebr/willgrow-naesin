"""기출문제 지문(영어)의 해석을 교과서 본문/대화문 ko와 대조하여 붙임.
각 exam_question 에 'passage_ko' (줄 단위 "영어 → 해석") 를 추가. 사용: python3 tools/exam_translate.py content [--report]
"""
import json, glob, os, re, sys
from difflib import SequenceMatcher

HANGUL = re.compile(r'[가-힣]')
def norm(s):
    s = re.sub(r'</?u>', '', s)
    s = re.sub(r'[ⓐ-ⓩ]|\([A-F]\)|\[[^\]]*\]|_{2,}|[“”"‘’\'(),.!?:;…\-—–]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip().lower()
    return s
def split_sents(t):
    t = re.sub(r'(?<=[.!?])(["”’]?)\s+(?=[A-Z“"(ⓐ-ⓩ]|[ⓐ-ⓩ]?<u>)', r'\1\n', t)
    return [x.strip() for x in t.split('\n') if x.strip()]

def build_index(d):
    idx = []   # (norm_en, en, ko)
    def add(en, ko):
        idx.append((norm(en), en, ko, set(norm(en).split())))
        es, ks = split_sents(en), [k for k in re.split(r'(?<=[.!?])\s+', ko) if k.strip()]
        if len(es) == len(ks) and len(es) > 1:
            for e, k in zip(es, ks): idx.append((norm(e), e, k, set(norm(e).split())))
    for s in (d.get('reading') or {}).get('sentences', []):
        if s.get('ko'): add(s['en'], s['ko'])
    for dg in d.get('dialogues') or []:
        for l in dg['lines']:
            if l.get('ko'): add(l['en'], l['ko'])
    return idx

_cache = {}
MANUAL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'content', '_exam_translations.json')
MANUAL = json.load(open(MANUAL_PATH)) if os.path.exists(MANUAL_PATH) else {}   # 교과서에 없는 문장의 수동 번역 사전
def best(ne, idx, words):
    if not ne: return None
    key = (id(idx), ne)
    if key in _cache: return _cache[key]
    toks = set(ne.split()); res = None
    cands = []
    for n, _, ko, t2 in idx:
        if abs(len(n) - len(ne)) >= max(12, len(ne) * 0.6): continue
        j = len(toks & t2) / max(len(toks | t2), 1)
        if j >= 0.45: cands.append((j, n, ko))
    cands.sort(reverse=True)
    for j, n, ko in cands[:8]:
        if SequenceMatcher(None, ne, n).ratio() >= 0.86: res = ko; break
    if res is None and len(toks) >= 5:
        for j, n, ko in cands[:8]:
            t2 = set(n.split())
            if len(toks & t2) / max(len(toks), len(t2)) >= 0.75: res = ko; break
    if res is None: res = MANUAL.get(ne)
    _cache[key] = res
    return res

def translate_lines(text, idx, words):
    out = []; miss = 0; tot = 0
    for line in text.split('\n'):
        raw = line.strip()
        if not raw: continue
        sp = re.match(r'^([A-Z][a-zA-Z .]{0,12}|[BGMW]|Mr\.? ?[A-Z][a-z]+|Ms\.? ?[A-Z][a-z]+):\s*(.*)$', raw)
        speaker, body = (sp.group(1), sp.group(2)) if sp else ('', raw)
        sents = []
        for s in split_sents(body):
            plain = re.sub(r'<[^>]+>', '', s)
            if HANGUL.search(plain) and len(re.findall(r'[A-Za-z]{2,}', plain)) < 3: continue   # 우리말 영작 문장 등
            if len(norm(s).split()) < 3: continue
            sents.append(s)
        kos = []; i = 0
        while i < len(sents):
            hit = None
            for w in (4, 3, 2, 1):   # 교과서 문장이 여러 문장 묶음인 경우 창을 넓혀 대조
                if i + w > len(sents): continue
                ko = best(norm(' '.join(sents[i:i + w])), idx, words)
                if ko: hit = (w, ko); break
            if hit:
                tot += hit[0]; kos.append(hit[1]); i += hit[0]
            else:
                tot += 1; miss += 1; i += 1
        if kos: out.append((speaker + ': ' if speaker else '') + ' '.join(kos))
    return out, tot, miss

def main():
    root = sys.argv[1] if len(sys.argv) > 1 else 'content'
    report = '--report' in sys.argv
    T = M = Q = QM = 0
    for n in sorted([x for x in glob.glob(os.path.join(root, '*.json')) if not os.path.basename(x).startswith('_')]):
        d = json.load(open(n)); idx = build_index(d)
        words = {w['en'].lower(): w['ko'] for w in d.get('words', []) if w.get('ko')}
        ft = fm = 0
        for q in d['exam_questions']:
            text = q['question']
            if text.startswith('[지문] '):
                passage = text[4:].split('\n\n', 1)[0]
            else:
                passage = '\n'.join(text.split('\n')[1:])   # 발문 아래 영어 줄들
            lines, tot, miss = translate_lines(passage, idx, words)
            ft += tot; fm += miss
            if tot: Q += 1
            if lines: q['passage_ko'] = '\n'.join(lines)
            elif 'passage_ko' in q: del q['passage_ko']
            if tot and miss == tot: QM += 1
        T += ft; M += fm
        json.dump(d, open(n, 'w'), ensure_ascii=False, indent=1)
        if report: print(f'{os.path.basename(n)}: sentences {ft}, unmatched {fm}')
    print(f'TOTAL sentences {T}, unmatched {M} ({M/max(T,1):.0%}); questions with english {Q}, fully unmatched {QM}')
main()
