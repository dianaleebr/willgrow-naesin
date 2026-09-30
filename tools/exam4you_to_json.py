"""EXAM4YOU 한글 자료(텍스트 추출본) → 윌그로우 내신마스터 업로드 JSON 변환
입력: txt/ 폴더의 *.json (hwp_text.py 출력)   출력: out/<출판사>_<학년>_<과>.json
"""
import json, re, os, sys, glob
from collections import defaultdict

TXT = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/txt'
OUT = sys.argv[2] if len(sys.argv) > 2 else '/home/claude/willgrow-naesin/content'
os.makedirs(OUT, exist_ok=True)

HANGUL = re.compile(r'[가-힣]')
LATIN = re.compile(r'[A-Za-z]')

def load(name):
    return json.load(open(os.path.join(TXT, name)))['flat']

# ---------- 파일명 → (출판사, 학년, 과) ----------
def key_of(fname):
    m = re.match(r'\(2022개정\)\d{4}년_(중\d|공통영어\d)_([^_]+)_([^_]+)_(.+)\.json$', fname)
    if not m: return None
    grade_s, pub, lesson, kind = m.groups()
    grade = int(grade_s[1]) if grade_s.startswith('중') else 10 + int(grade_s[-1])   # 공통영어1→11, 공통영어2→12
    pub = pub.replace('NE능률', '능률')
    if grade_s.startswith('공통영어'): pub = f'{pub} {grade_s}'
    lm = re.match(r'(\d+)과', lesson)
    if lm: unit = int(lm.group(1)); title_hint = None
    else:
        sm = re.search(r'(\d+)', lesson); unit = 90 + (int(sm.group(1)) if sm else 0); title_hint = lesson  # Special Lesson → 90번대
    kind = re.sub(r'^\[\d+\]', '', kind).replace('_단계별', '')
    kind = re.sub(r'_\(\d{6,8}수정\)', '', kind).replace(' (1)', '')
    return (pub, grade, unit, title_hint, kind)

# ---------- 단어 ----------
POS_RE = re.compile(r'^(n|v|a|adj|adv|prep|conj|pron|int|interj|aux|det)\.\s*', re.I)
def parse_words(flat):
    lines = [t for l, t in flat]
    try:
        s = next(i for i, t in enumerate(lines) if '교과서 어휘 목록' in t)
    except StopIteration:
        return []
    e = next((i for i, t in enumerate(lines) if i > s and re.search(r'필수단어 예문|WORD TEST\s*$|TEST\s*1', t)), len(lines))
    words = []
    cat = None
    for t in lines[s + 1:e]:
        t = t.rstrip('\n')
        if '<TABLE' in t: continue
        if re.match(r'^[A-Z ]+│', t): cat = t.split('│')[-1].strip(); continue
        if '\t' not in t and not HANGUL.search(t): continue
        if '\t' in t:
            en, rest = t.split('\t', 1)
        else:
            m = re.match(r'^([A-Za-z][A-Za-z\' .\-~()/]*?)\s{2,}(.+)$', t)
            if not m: continue
            en, rest = m.group(1), m.group(2)
        en = en.strip(); rest = rest.replace('\t', ' ').strip()
        if not en or not HANGUL.search(rest): continue
        # 뜻이 여러 줄 (품사별) 인 경우
        parts = [p.strip() for p in rest.split('\n') if p.strip()]
        poss, kos, extra = [], [], []
        for p in parts:
            if re.match(r'^\(.*-.*\)$', p): extra.append(p); continue   # (go-went-gone)
            pm = POS_RE.match(p)
            if pm: poss.append(pm.group(1).lower() + '.'); p = p[pm.end():]
            kos.append(p.strip())
        ko = ' / '.join(k for k in kos if k)
        ko = re.sub(r'\s*;\s*', ', ', ko)
        words.append({'en': en, 'ko': ko, 'pos': ', '.join(dict.fromkeys(poss)) or None, 'example': None, 'category': cat, 'note': ' '.join(extra) or None})
    # 예문 붙이기
    try:
        s2 = next(i for i, t in enumerate(lines) if '필수단어 예문' in t)
        e2 = next((i for i, t in enumerate(lines) if i > s2 and re.search(r'영영풀이|TEST\s*1', t)), len(lines))
        idx = {w['en'].lower(): w for w in words}
        cur = None
        for t in lines[s2 + 1:e2]:
            t = t.rstrip('\n')
            if '<TABLE' in t or re.match(r'^[A-Z ]+│', t): continue
            head = t.split('\t')[0].strip().lower()
            if '\t' in t and head in idx: cur = idx[head]; continue
            if cur and LATIN.search(t) and HANGUL.search(t) and not cur['example']:
                cur['example'] = t.strip().split('\n')[0]
    except StopIteration:
        pass
    # 중복 제거
    seen, out = set(), []
    for w in words:
        k = (w['en'].lower(), w['ko'])
        if k in seen: continue
        seen.add(k); out.append(w)
    return out

# ---------- 본문 (워크북 2 = 영문 + 우리말빈칸, 워크북 3 = 우리말 + 영문빈칸) ----------
def parse_workbook(flat):
    """[(질문문장(첫줄), 빈칸문장(둘째줄), 정답리스트)]"""
    items = []
    pend = None
    for l, t in flat:
        t = t.rstrip()
        if pend is None:
            if '\n' in t and '______' in t:
                first, second = t.split('\n', 1)
                pend = (first.strip(), second.strip())
            elif '\n' in t and re.search(r'\([a-z ,]+\)|\[[^\]]+/[^\]]+\]', t.split('\n', 1)[1]):
                first, second = t.split('\n', 1)
                pend = (first.strip(), second.strip())
        else:
            if l == 3 and ('워크북' in t): continue
            if l >= 3:
                ans = [a.strip() for a in t.strip().split('/')]
                items.append((pend[0], pend[1], ans)); pend = None
    return items

def parse_reading(files):
    """워크북2: EN + KO빈칸,  워크북3: KO + EN빈칸 → 문장 목록 + 빈칸 4종"""
    w2 = parse_workbook(load(files['w2'])) if 'w2' in files else []
    w3 = parse_workbook(load(files['w3'])) if 'w3' in files else []
    w5 = parse_workbook(load(files['w5'])) if 'w5' in files else []
    w6 = parse_workbook(load(files['w6'])) if 'w6' in files else []
    sentences = []
    n = max(len(w2), len(w3))
    for i in range(n):
        en = w2[i][0] if i < len(w2) else fill(w3[i][1], w3[i][2])
        ko = w3[i][0] if i < len(w3) else fill(w2[i][1], w2[i][2])
        sentences.append({'en': clean(en), 'ko': clean(ko)})
    blanks = []
    for kind, wb in (('w2', w2), ('w3', w3), ('w5', w5), ('w6', w6)):
        for i, (q, blank, ans) in enumerate(wb):
            prompt = blank
            if kind in ('w5', 'w6'):
                # (be) → ___(be) , [is / are] → ___[is / are]
                prompt = re.sub(r'\(([^()]*)\)', r'___(\1)', prompt) if kind == 'w5' else re.sub(r'\[([^\]]*)\]', r'___[\1]', prompt)
            else:
                prompt = re.sub(r'_{3,}', '___', prompt)
            nb = prompt.count('___')
            if nb > len(ans):
                # "___ ___" 처럼 이어진 빈칸은 하나의 어구 빈칸으로
                while prompt.count('___') > len(ans) and re.search(r'___(\s+___)+', prompt):
                    prompt = re.sub(r'___\s+___', '___', prompt, count=1)
                nb = prompt.count('___')
            if nb != len(ans):
                # 빈칸 수와 정답 수가 다르면 정답을 하나로 합침(안전)
                ans = [' '.join(ans)] if nb == 1 else ans[:nb] + [''] * (nb - len(ans))
            full_en = sentences[i]['en'] if i < len(sentences) else ''
            full_ko = sentences[i]['ko'] if i < len(sentences) else ''
            blanks.append({'difficulty': kind, 'sentence_index': i, 'prompt': clean(prompt), 'answers': ans, 'ko': clean(q),
                           'explanation': explain(kind, prompt, ans, full_en, full_ko)})
    return sentences, blanks

def parse_bonmun(flat):
    """본문 파일: 영어 문단들 → 우리말 문단들. 문단 수가 같으면 문단별로 짝지음"""
    en, ko = [], []
    for l, t in flat:
        t = clean(t)
        if not t or '<TABLE' in t or '저작권' in t or '개정' in t or t in ('교과서 본문',) or re.match(r'^중\d$', t): continue
        if HANGUL.search(t) and len(HANGUL.findall(t)) >= len(LATIN.findall(t)): ko.append(t)
        elif LATIN.search(t): en.append(t)
    # 문장 단위 분리 (문단별 문장 수가 같을 때만)
    out = []
    if len(en) == len(ko):
        for e, k in zip(en, ko):
            es = re.split(r'(?<=[.!?])\s+(?=[A-Z“"])', e); ks = re.split(r'(?<=[.!?])\s+', k)
            if len(es) == len(ks): out += [{'en': a, 'ko': b} for a, b in zip(es, ks)]
            else: out.append({'en': e, 'ko': k})
    else:
        out = [{'en': e, 'ko': ''} for e in en]
    return out

IRREG_PAST = {'was','were','went','had','did','saw','came','took','made','got','gave','ate','ran','said','told','thought','felt','found','knew','left','met','put','read','sat','wrote','bought','brought','began','broke','chose','drank','drove','fell','flew','forgot','grew','heard','held','kept','lost','paid','rode','sang','slept','spoke','stood','swam','taught','threw','understood','wore','won','built','caught','cut','hit','hurt','let','sent','spent','became','lay','led','meant','rose','shook','showed','stole','struck','woke','fed','fought','hid','shot','sold','sought','bent','bit','blew','dug','froze','hung','lent','quit','rang','set','shut','sped','stuck','tore'}
def explain(kind, prompt, ans, en, ko):
    """오답 시 학생에게 보여줄 짧은 해설(규칙 기반)"""
    tips = []
    for a in ans:
        a0 = a.strip(); low = a0.lower(); words = low.split()
        if kind == 'w5':
            m = re.search(r'\(([^()]*)\)', prompt); base = (m.group(1) if m else '').split(',')[-1].strip()
            if low in ('am','is','are','was','were'): tips.append(f"be동사는 주어와 시제에 맞춰 써요 → '{a0}'"); continue
            if 'not' in low or "n't" in low: tips.append(f"부정문: '{a0}' (do/does/did/be동사 + not)"); continue
            if low.startswith('to '): tips.append(f"to부정사 'to+동사원형' → '{a0}'"); continue
            if low.endswith('ing') and base and low != base: tips.append(f"'{a0}': 동명사/진행형(-ing) 형태"); continue
            if base and (low == base + 's' or low == base + 'es' or (base.endswith('y') and low == base[:-1] + 'ies')): tips.append(f"주어가 3인칭 단수·현재시제 → 동사에 -(e)s: '{a0}'"); continue
            if base and (low == base + 'ed' or low == base + 'd' or low in IRREG_PAST or (base.endswith('y') and low == base[:-1] + 'ied')): tips.append(f"과거의 일 → 과거형 '{a0}'"); continue
            if base and low == base: tips.append(f"주어가 I/you/복수이거나 조동사·to 뒤 → 동사원형 '{a0}'"); continue
            if 'will ' in low or 'going to' in low: tips.append(f"미래 표현 → '{a0}'"); continue
            if low.startswith(('have ','has ','had ')): tips.append(f"완료형(have/has/had + 과거분사) → '{a0}'"); continue
            tips.append(f"알맞은 동사 형태: '{a0}'")
        elif kind == 'w6':
            if low in ('am','is','are','was','were'): tips.append(f"be동사는 주어의 수·시제에 맞춰요 → '{a0}'"); continue
            if low in ('a','an'): tips.append(f"'{a0}': 뒤에 오는 소리가 모음이면 an, 자음이면 a"); continue
            if low in ('much','many','a lot of','little','few','a little','a few'): tips.append(f"'{a0}': 셀 수 있는 명사엔 many/few, 셀 수 없는 명사엔 much/little"); continue
            if low in ('who','which','that','what','where','when','why','how','whom','whose'): tips.append(f"'{a0}': 관계사/의문사는 가리키는 대상·역할에 맞게 골라요"); continue
            if low in ('to','for','of','in','on','at','with','about','from','by'): tips.append(f"'{a0}': 함께 쓰는 전치사(숙어)를 기억하세요"); continue
            if low.endswith('ing'): tips.append(f"'{a0}': 동명사/진행형/현재분사(-ing)가 알맞아요"); continue
            if low.endswith('ed') or low in IRREG_PAST: tips.append(f"'{a0}': 과거형/과거분사가 알맞아요"); continue
            if low.startswith('to '): tips.append(f"'{a0}': to부정사(to+동사원형)"); continue
            if low.endswith('ly'): tips.append(f"'{a0}': 동사·형용사·문장 전체를 꾸밀 땐 부사(-ly)"); continue
            tips.append(f"어법에 맞는 표현: '{a0}'")
    head = ' / '.join(tips) if tips else ''
    full = f"정답 문장: {en} ({ko})" if en else ''
    return clean(' '.join(x for x in [head, full] if x)) or None

def fill(blank, answers):
    out = blank
    for a in answers: out = re.sub(r'_{3,}', a, out, count=1)
    return out
def clean(s): return re.sub(r'\s+', ' ', s).strip()

# ---------- 대화문 (내용정리 플러스) ----------
SPK_RE = re.compile(r'^\s*([A-Z][A-Za-z]{0,10}\d?|소녀\d?|소년\d?|여자\d?|남자\d?|여\d?|남\d?|[가-힣]{2,4})\s*:\s*(.+?)\s*$')
KO_SPK = {'소녀': 'G', '소년': 'B', '여자': 'W', '남자': 'M', '여': 'W', '남': 'M'}
HEADER_RE = re.compile(r'^\s*([A-D]\.\s|Listen|Talk|Speak|Real|Wrap|Watch|Communication|Topic|Step|Conversation|Dialogue|Let\'s|Express|Your Turn)', re.I)
SKIP_RE = re.compile(r'^\s*(↳|↲|=|\(|TIP|e\.g\.|•|→|▌|◗|┃|\[예시|\[Talk|Answer|답:)')

def parse_dialogues(flat):
    groups = []   # {'lang':'en'|'ko', 'title', 'num', 'lines':[(spk,text)]}
    cur = None; title = ''; num = ''
    def flush():
        nonlocal cur
        if cur and len(cur['lines']) >= 2:
            spk = {s for s, _ in cur['lines']}
            bad = (spk <= {'A', 'B'} or len(cur['lines']) > 16 or '→' in cur['title']
                   or any(re.search(r'_{3,}|\(\s*[^()]+/[^()]+\)|\s{3,}', t) for _, t in cur['lines'])
                   or (len(cur['lines']) <= 2 and any(len(t.split()) < 3 for _, t in cur['lines'])))
            if not bad:   # A/B 기능 예시문, 빈칸/선택형 연습 변형은 제외
                groups.append(cur)
        cur = None
    for pos, (l, t) in enumerate(flat):
        t = t.rstrip('\n')
        first = t.split('\n')[0].strip()
        if '<TABLE' in t: flush(); continue
        if HEADER_RE.match(first) and len(first) < 60 and not SPK_RE.match(first):
            flush(); title = re.sub(r'^[A-D]\.\s*', '', first).strip(); num = ''; continue
        if re.match(r'^\d+\.?\s*$', first): flush(); num = first.rstrip('.').strip(); continue
        m = SPK_RE.match(first)
        if m and not SKIP_RE.match(first):
            spk, txt = m.group(1), m.group(2)
            lang = 'ko' if HANGUL.search(txt) and not (len(LATIN.findall(txt)) > len(HANGUL.findall(txt)) * 2) else 'en'
            spk_n = KO_SPK.get(re.sub(r'\d', '', spk), spk); spk_n = spk_n + re.sub(r'\D', '', spk) if spk_n in ('G', 'B', 'W', 'M') and re.search(r'\d', spk) else spk_n
            if cur and cur['lang'] != lang: flush()
            if cur is None: cur = {'lang': lang, 'title': title, 'num': num, 'lines': [], 'pos': pos}
            # 같은 대화 안에서 연속 대사
            cur['lines'].append((spk_n, txt.strip()))
        else:
            continue   # 주석·설명 줄은 대화를 끊지 않음 (제목/번호/표에서만 끊김)
    flush()
    # 영어 그룹과 한국어 그룹을 화자 순서로 매칭
    en = [g for g in groups if g['lang'] == 'en']; ko = [g for g in groups if g['lang'] == 'ko']
    used = set(); dialogues = []; seen_sig = set()
    for g in en:
        sig = tuple(s for s, _ in g['lines'])
        key = tuple(t.lower() for _, t in g['lines'])
        if key in seen_sig: continue
        seen_sig.add(key)
        match = None
        def toks(lines): return {w.lower() for _, t in lines for w in re.findall(r"[A-Za-z][A-Za-z']+|\d+", t) if len(w) > 2}
        gt = toks(g['lines'])
        best = None
        for j, k in enumerate(ko):
            if j in used or len(k['lines']) != len(g['lines']): continue
            same_sig = tuple(s for s, _ in k['lines']) == sig
            shared = len(gt & toks(k['lines']))
            dist = abs(k['pos'] - g['pos'])
            score = (shared * 10 + (5 if same_sig else 0) + (3 if k['num'] == g['num'] and g['num'] else 0)) - j / 50 - (2 if k['pos'] > g['pos'] else 0)
            if (shared > 0 or same_sig) and (best is None or score > best[0]): best = (score, j)
        if best: match = best[1]
        kol = ko[match]['lines'] if match is not None else []
        if match is not None: used.add(match)
        if not kol and len(g['lines']) <= 3: continue   # 해석 없는 짧은 조각은 버림
        ttl = (g['title'] or 'Dialogue') + (f' {g["num"]}' if g['num'] else '')
        dialogues.append({'title': ttl, 'lines': [{'speaker': s, 'en': e, 'ko': (kol[i][1] if i < len(kol) else '')} for i, (s, e) in enumerate(g['lines'])]})
    # 제목 중복 정리
    cnt = defaultdict(int)
    for d in dialogues:
        cnt[d['title']] += 1
        if cnt[d['title']] > 1: d['title'] = f"{d['title']} ({cnt[d['title']]})"
    return dialogues

def unit_title(flat_naesin):
    for l, t in flat_naesin[:8]:
        s = t.strip()
        if LATIN.search(s) and not HANGUL.search(s) and 'Lesson' not in s and '개정' not in s and len(s) < 60: return s
    return None

# ---------- 메인 ----------
units = defaultdict(dict)
for f in sorted(os.listdir(TXT)):
    k = key_of(f)
    if not k: continue
    pub, grade, unit, hint, kind = k
    d = units[(pub, grade, unit)]
    d['_hint'] = hint
    if 'WORD TEST' in kind: d['words'] = f
    elif '내용정리' in kind: d['naesin'] = f
    elif kind == '본문': d['bonmun'] = f
    elif '워크북 2 ' in kind: d['w2'] = f
    elif '워크북 3 ' in kind: d['w3'] = f
    elif '워크북 5 ' in kind: d['w5'] = f
    elif '워크북 6 ' in kind: d['w6'] = f

report = []
for (pub, grade, unit), files in sorted(units.items()):
    level = '고' if grade >= 10 else '중'
    out = {'publisher': pub, 'level': level, 'grade': 1 if grade >= 10 else grade, 'unit': unit, 'unit_title': None, 'words': [], 'dialogues': [], 'reading': None, 'blanks': [], 'exam_questions': []}   # 공통영어1·2 = 고1 과정
    if 'naesin' in files:
        fl = load(files['naesin']); out['unit_title'] = unit_title(fl); out['dialogues'] = parse_dialogues(fl)
    if files.get('_hint'): out['unit_title'] = (out['unit_title'] or '') and f"{files['_hint']} · {out['unit_title']}" or files['_hint']
    if 'words' in files: out['words'] = parse_words(load(files['words']))
    sentences, blanks = parse_reading(files)
    if not sentences and 'bonmun' in files:
        sentences = parse_bonmun(load(files['bonmun']))
    if sentences:
        out['reading'] = {'title': out['unit_title'] or f'Lesson {unit}', 'sentences': sentences}
        out['blanks'] = blanks
    name = f"{pub}_{'중'+str(grade) if grade < 10 else '고'}_{unit:02d}.json".replace(' ', '')
    json.dump(out, open(os.path.join(OUT, name), 'w'), ensure_ascii=False, indent=1)
    report.append((name, len(out['words']), sum(1 for w in out['words'] if w['example']), len(out['dialogues']), sum(len(d['lines']) for d in out['dialogues']), sum(1 for d in out['dialogues'] for l in d['lines'] if l['ko']), len(sentences), {k: sum(1 for b in blanks if b['difficulty'] == k) for k in ('w2', 'w3', 'w5', 'w6')}))
for r in report: print(r)

# ---------- 후처리: 수동 해석 보충(ko_fill.json) 적용 + 불필요 대화 제거 ----------
_fill_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ko_fill.json')
if os.path.exists(_fill_path):
    fill = json.load(open(_fill_path)); drop = set(fill.pop('_drop', []))
    for n in sorted(glob.glob(os.path.join(OUT, '*.json'))):
        b = os.path.basename(n); d = json.load(open(n)); keep = []
        for di, dl in enumerate(d['dialogues']):
            if f'{b}|{di}' in drop: continue
            ko = fill.get(f'{b}|{di}')
            if ko:
                for i, l in enumerate(dl['lines']):
                    if not l['ko'] and i < len(ko): l['ko'] = ko[i]
            keep.append(dl)
        d['dialogues'] = keep
        json.dump(d, open(n, 'w'), ensure_ascii=False, indent=1)
    print('ko_fill applied')
