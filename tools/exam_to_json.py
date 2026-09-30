"""EXAM4YOU 예상문제(교사용) 텍스트 → exam_questions 변환, content/*.json 에 합치기
사용: python3 exam_to_json.py <txt폴더> <content폴더>
교사용 파일에는 정답(❶ 표시)과 해설이 들어 있어 이것만 사용합니다.
"""
import json, re, os, sys, glob
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from exam4you_to_json import key_of, clean, HANGUL, LATIN  # noqa

TXT = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/txt'
OUT = sys.argv[2] if len(sys.argv) > 2 else '/home/claude/willgrow-naesin/content'

CIRC = '①②③④⑤⑥⑦⑧'; CIRC_ANS = '❶❷❸❹❺❻❼❽'
CH_RE = re.compile(r'[①②③④⑤⑥⑦⑧❶❷❸❹❺❻❼❽]')
STEM_RE = re.compile(r'(것은|것을|말은|하시오|쓰시오|고르시오|완성하시오|배열하시오|영작하시오|답하시오|바꾸시오|고치시오|찾으시오|쓰고|은\?|는\?|까\?|가\?|요\?|나\?|지\?)\s*[.?]?\s*$')
PASSAGE_RE = re.compile(r'^(다음|아래).{0,20}(읽고|보고|듣고).{0,12}(답하시오|답하세요)')

def num_of(ch):
    return (CIRC.find(ch) + 1) if ch in CIRC else (CIRC_ANS.find(ch) + 1)

def split_choices(line):
    """'① a ② b ❸ c' → [(n, text, is_answer)]"""
    parts = CH_RE.split(line); marks = CH_RE.findall(line)
    out = []
    for m, txt in zip(marks, parts[1:]):
        out.append((num_of(m), clean(txt.replace('\t', ' ')), m in CIRC_ANS))
    return out

def parse_exam(flat, tag):
    qs = []
    passage = []; in_passage = False
    i = 0; n = len(flat)
    while i < n:
        l, t = flat[i]; t = t.rstrip('\n'); first = t.split('\n')[0]
        if '<TABLE' in t or l >= 4:
            i += 1; continue
        if PASSAGE_RE.match(clean(first)):
            passage = []; in_passage = True; i += 1; continue
        if l == 1 and in_passage and not STEM_RE.search(clean(first)) and not CH_RE.search(first):
            passage.append(clean(t)); i += 1; continue
        if l == 1 and STEM_RE.search(clean(first)) and HANGUL.search(first) and not CH_RE.match(first.strip()):
            in_passage = False
            stem = clean(t)
            q = {'passage': '\n'.join(passage), 'stem': stem, 'choices': [], 'answer': None, 'explanation': '', 'extra': []}
            i += 1
            # 문항 본체: 다음 문항 지문/스템 전까지
            while i < n:
                l2, t2 = flat[i]; t2 = t2.rstrip('\n'); f2 = t2.split('\n')[0]
                if '<TABLE' in t2 or l2 >= 4: i += 1; continue
                c2 = clean(f2)
                if PASSAGE_RE.match(c2): break
                if l2 == 1 and STEM_RE.search(c2) and HANGUL.search(f2) and not CH_RE.match(f2.strip()) and not c2.startswith(('•', '<', '→', '※')) and q['answer'] is not None: break
                if l2 == 3:
                    if re.search(r'정답 및 해설|┃|^\s*\d+회\s*$', f2): i += 1; continue
                    m = re.match(r'^\s*([①②③④⑤])\s*[:：]?\s*(.*)', t2, re.S)
                    if m and q['answer'] is None:
                        q['answer'] = str(num_of(m.group(1))); q['type'] = 'mc'; q['explanation'] = clean(m.group(2))
                    elif q['answer'] is None:
                        lines = [x.strip() for x in t2.split('\n') if x.strip()]
                        q['type'] = 'essay'; q['answer'] = lines[0].lstrip(':•→ ').strip()
                        if len(lines) > 1: q['explanation'] = clean(' '.join(lines[1:]))
                    else:
                        if not q['explanation']: q['explanation'] = clean(t2.lstrip(':•→ '))
                    i += 1; continue
                if l2 == 1 and CH_RE.match(f2.strip()):
                    for ln in t2.split('\n'):
                        if not CH_RE.match(ln.strip()): continue
                        for num, txt, ok in split_choices(ln):
                            if any(n0 == num for n0, _ in q['choices']): continue
                            q['choices'].append((num, txt))
                            if ok: q['answer'] = str(num); q['type'] = 'mc'
                    i += 1; continue
                if l2 == 1:
                    if c2.startswith('→'):
                        if q.get('type') == 'essay' and not q['answer']: q['answer'] = c2.lstrip('→ ').strip()
                    elif q['choices'] and HANGUL.search(f2):
                        if not q['explanation']: q['explanation'] = clean(t2)   # 선택지 뒤의 해설 반복
                    else:
                        body = t2
                        if q.get('type') == 'essay':
                            body = re.sub(r'(?:\s{2,}\S+)+\s{2,}', ' ______ ', body)   # 교사용에 채워진 정답 가리기
                        (q.setdefault('post', []) if q['choices'] else q['extra']).append(clean(body))
                    i += 1; continue
                i += 1
            if q['answer'] is not None: qs.append(q)
            continue
        i += 1
    # 정리
    out = []
    for k, q in enumerate(qs):
        choices = [txt for _, txt in sorted(q['choices'], key=lambda x: x[0])] if q['choices'] else None
        post = q.get('post', [])
        if choices and post:
            if len(post) == len(choices): choices = [f"{c} / {p}" for c, p in zip(choices, post)]   # A: ... / B: ... 짝 대화
            else: q['extra'] += post
        qtype = 'mc' if choices and len(choices) >= 3 and q['answer'].isdigit() else 'essay'
        text = (('[지문] ' + q['passage'] + '\n\n') if q['passage'] else '') + q['stem'] + (('\n' + '\n'.join(q['extra'])) if q['extra'] else '')
        expl = re.sub(r'^[\s:：•→]+', '', q['explanation'] or '')
        expl = re.sub(r'^[①②③④⑤]\s*[:：]\s*', '', expl)
        out.append({'school': 'EXAM4YOU 예상', 'year': tag['year'], 'term': tag['term'], 'type': qtype, 'question': text,
                    'choices': choices if qtype == 'mc' else None, 'answer': q['answer'], 'explanation': expl or None})
    return out

if __name__ == '__main__':
    added = {}
    for f in sorted(os.listdir(TXT)):
        k = key_of(f)
        if not k: continue
        pub, grade, unit, hint, kind = k
        if '예상문제' not in kind or '교사용' not in kind: continue
        m = re.match(r'\(2022개정\)(\d{4})년', f); year = int(m.group(1)) if m else None
        term = re.sub(r'\(교사용\)', '', kind).strip()
        flat = json.load(open(os.path.join(TXT, f)))['flat']
        qs = parse_exam(flat, {'year': year, 'term': term})
        name = f"{pub}_{'중'+str(grade) if grade < 10 else '고'}_{unit:02d}.json".replace(' ', '')
        path = os.path.join(OUT, name)
        if not os.path.exists(path): print('no content file for', name); continue
        d = json.load(open(path))
        d['exam_questions'] = [q for q in d.get('exam_questions', []) if q.get('term') != term] + qs
        json.dump(d, open(path, 'w'), ensure_ascii=False, indent=1)
        added[name] = added.get(name, 0) + len(qs)
        print(name, term, len(qs), 'mc', sum(1 for q in qs if q['type'] == 'mc'), 'essay', sum(1 for q in qs if q['type'] == 'essay'), 'expl', sum(1 for q in qs if q['explanation']))
