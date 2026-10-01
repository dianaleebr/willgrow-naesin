"""EXAM4YOU 예상문제(교사용) 텍스트 → exam_questions 변환, content/*.json 에 합치기
사용: python3 exam_to_json.py <txt폴더> <content폴더>
교사용 파일에는 정답(❶ 표시)과 해설이 들어 있어 이것만 사용합니다.

한글 파일 구조(hwp_text.py --marks 출력, [level, text]):
  level 1  문항 본문(지문·발문·선택지·보기·해설 문단)
  level 2  <TABLE RxC>  : 뒤에 오는 level 3 셀 R*C개 = 문항 안의 표(일정표 등) / 2x1·1x1 은 분류 라벨 표
  level 3  정답 상자(발문 바로 뒤) : 첫 줄 정답(①~⑤ 또는 서술형 답), ':' 로 시작하면 해설, 빈 줄 뒤는 우리말 해석
  level>=4 라벨(해설/오답/제시문/질문/요약문/본문변형…) — '해설' 라벨 직전의 level 1 한글 문단은 해설
교사용 본문의 채워진 정답은 <u>…  </u>(밑줄+뒤 공백) 형태 → ______ 로 가림.
"""
import json, re, os, sys, glob
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from exam4you_to_json import key_of, clean, HANGUL, LATIN  # noqa

TXT = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/txt'
OUT = sys.argv[2] if len(sys.argv) > 2 else '/home/claude/willgrow-naesin/content'

CIRC = '①②③④⑤⑥⑦⑧'; CIRC_ANS = '❶❷❸❹❺❻❼❽'
CH_RE = re.compile(r'[①②③④⑤⑥⑦⑧❶❷❸❹❺❻❼❽]')
MARK_RE = re.compile(r'[①②③④⑤]')
STEM_RE = re.compile(r'(것은|것을|말은|하시오|쓰시오|고르시오|완성하시오|배열하시오|영작하시오|답하시오|바꾸시오|고치시오|찾으시오|고르면|쓰고|은\?|는\?|까\?|가\?|요\?|나\?|지\?|면\?|것\?)\s*[.?]?\s*$')
PASSAGE_RE = re.compile(r'^(다음|아래).{0,24}(읽고|보고|듣고).{0,14}(답하시오|답하세요|답하시요)')
LABELS = {'해설', '오답', '제시문', '질문', '요약문', '본문변형', '어휘', '어법', '의사소통', '본문', '대화문', '단어·숙어', '예상문제', '교사용'}

def dedup_sentences(t):
    """해설 안에서 같은 문장이 두 번 나오면 한 번만 남김"""
    if not t: return t
    parts = re.split(r'(?<=[.다요!?)])\s+(?=[^\s])|\s+(?=[ⓐ-ⓔ]\s)', t.strip())
    keys = [re.sub(r'\s+', '', x) for x in parts]
    out = []
    for i, x in enumerate(parts):
        k = keys[i]
        if any(k == keys[j] for j in range(i)): continue
        if len(k) >= 6 and any(j != i and k != keys[j] and k in keys[j] for j in range(len(parts))): continue   # 더 긴 문장에 포함된 조각
        out.append(x)
    return ' '.join(out)
def strip_marks(s): return re.sub(r'</?u>', '', s or '') if s is not None else None
def tidy_marks(s):
    s = re.sub(r'<u>(\s*)</u>', r'\1', s or '')            # 빈 밑줄
    s = re.sub(r'\s+</u>', '</u> ', s); s = re.sub(r'<u>\s+', ' <u>', s)   # 밑줄 안팎 공백 정리
    s = re.sub(r'</u>(\s*)<u>', r'\1', s)                   # 붙어 있는 밑줄 구간 합치기
    s = re.sub(r'<u>(_{2,})</u>', r'\1', s)
    return re.sub(r'[ \t]{2,}', ' ', s).strip()

def num_of(ch):
    return (CIRC.find(ch) + 1) if ch in CIRC else (CIRC_ANS.find(ch) + 1)

def is_stem(line):
    s = clean(line)
    if CH_RE.match(s) or re.match(r'^(\(\d\)|→|•|※|<|\[)', s) or len(s) >= 200 or not HANGUL.search(s): return False
    core = re.sub(r'\s*\([^()]*\)\s*\??\s*$', '?', s) if re.search(r'\([^()]*\)\s*\??$', s) else s   # 끝의 "(단, …)" 제거
    if STEM_RE.search(core) or STEM_RE.search(s): return True
    return bool(re.search(r'(것|단어|말|곳|개수|순서|이유|제목|주제|의미|표현|문장|낱말|대답|응답|질문)\s*(은|는|을|를|이|가)?\s*\?$', core))

def is_eng_stem(line, nxt):
    """영어 발문 (예: What did Patrick think about using water?) — 바로 뒤에 정답 상자(level 3)가 옴"""
    s = clean(line)
    return bool(nxt is not None and nxt[0] == 3 and not HANGUL.search(s) and s.endswith('?') and len(s) < 160 and not CH_RE.match(s) and not re.match(r'^[A-Z]{1,2}\d?:', s))

def split_choices(line):
    """'① a ② b ❸ c' → [(n, text, is_answer)]"""
    parts = CH_RE.split(line); marks = CH_RE.findall(line)
    out = []
    for m, txt in zip(marks, parts[1:]):
        out.append((num_of(m), clean(txt.replace('\t', ' ')), m in CIRC_ANS))
    return out

def mask_fills(line):
    """교사용 본문에 채워진 정답 → ______ . 채워진 정답은 밑줄 안 끝에 공백이 붙어 있거나(<u>word  </u>) '→' 로 시작하는 줄에 있음.
    그 밖의 밑줄(ⓐ<u>…</u>, 밑줄 친 우리말 등)은 문제의 일부이므로 유지"""
    arrow = line.lstrip().startswith('→')
    def rep(m):
        if arrow or re.search(r'\s$', m.group(1)): return ' ______ '
        return m.group(0)
    out = re.sub(r'<u>([^<]*?)</u>', rep, line)
    out = re.sub(r'(?:\s*______\s*){2,}', ' ______ ', out)   # 연속 빈칸(단어별 밑줄) 합치기
    return re.sub(r'[ \t]{2,}', ' ', out)

def parse_answer_box(recs):
    """level 3 레코드들 → (answer, explanation, ko_hint)"""
    answer = None; expl = []; ko = []
    for t in recs:
        t = t.rstrip('\n')
        head, _, tail = t.partition('\n\n')
        lines = [x.strip() for x in head.split('\n') if x.strip()]
        if not lines: continue
        # (1)(2)… 답 뒤에 붙은 우리말 해석 문장은 분리
        if re.match(r'^\(\d\)', lines[0]):
            kol = [x for x in lines if HANGUL.search(x) and not re.match(r'^\(\d\)', x) and len(x) > 12]
            if kol: ko += kol; lines = [x for x in lines if x not in kol]
        first = lines[0]
        if answer is not None and re.match(r'^\(\d\)', first) and re.match(r'^\(\d\)', answer):
            answer += '\n' + '\n'.join(lines); continue
        if re.match(r'^[:：•]|^\t*\s*[:：]', first) or (answer is not None and not MARK_RE.match(first) and not re.match(r'^\(\d\)', first)):
            expl.append(' '.join(x.lstrip(':： \t') for x in lines))
        else:
            m = re.match(r'^([①②③④⑤](?:\s*,\s*[①②③④⑤])*)\s*[:：]?\s*(.*)$', first, re.S)
            if m:
                marks = MARK_RE.findall(m.group(1))
                answer = ', '.join(str(num_of(x)) for x in marks)
                if m.group(2).strip(): expl.append(m.group(2).strip())
                if len(lines) > 1: expl.append(' '.join(lines[1:]))
            else:
                answer = '\n'.join(lines) if len(lines) > 1 and re.match(r'^\(\d\)', first) else first
                if len(lines) > 1 and not re.match(r'^\(\d\)', first): expl.append(' '.join(lines[1:]))
        if tail.strip(): ko.append(clean(tail))
    return answer, ' '.join(expl).strip(), ' '.join(ko).strip()

def fmt_table(cells, rows, cols):
    if cols == 1: return '\n'.join(clean(c) for c in cells)
    out = []
    for r in range(rows):
        out.append(' | '.join(clean(c) for c in cells[r * cols:(r + 1) * cols]))
    return '\n'.join(out)

def parse_exam(flat, tag):
    qs = []
    passage = []; in_passage = False
    i = 0; n = len(flat)
    def is_label(l, t): return l >= 4 and t.strip() in LABELS
    while i < n:
        l, t = flat[i]; t = t.rstrip('\n'); first = t.split('\n')[0]
        if l == 2 and '<TABLE' in t:   # 문항 밖의 표는 셀까지 건너뜀
            m = re.search(r'<TABLE (\d+)x(\d+)>', t); k = i + 1
            while k < n and flat[k][0] == 3 and k - i <= int(m.group(1)) * int(m.group(2)): k += 1
            i = k; continue
        if l >= 2 and not (l == 1):
            i += 1; continue
        if PASSAGE_RE.match(clean(first)):
            passage = []; in_passage = True; i += 1; continue
        if in_passage and not is_stem(first) and not is_eng_stem(first, flat[i + 1] if i + 1 < n else None):
            passage.append(clean(t)); i += 1; continue
        if is_stem(first) or is_eng_stem(first, flat[i + 1] if i + 1 < n else None):
            in_passage = False
            stem = clean(t)
            q = {'passage': '\n'.join(passage) if re.search(r'윗글|위 글|위의 글|위 대화|윗 대화|위의 대화|이 글|윗 글|위 표|주어진 글|위 편지|위 안내', stem) or passage and stem.startswith('윗') else '',
                 'stem': stem, 'choices': [], 'answer': None, 'explanation': '', 'extra': [], 'post': [], 'ko': ''}
            boxes = []; last_l1 = None; stop_all = False   # last_l1: ('extra'|'post'|'expl', index)
            i += 1
            while i < n:
                l2, t2 = flat[i]; t2 = t2.rstrip('\n'); f2 = t2.split('\n')[0]
                c2 = clean(f2)
                # ----- 표(level 2 + level 3 셀) -----
                if l2 == 2 and '<TABLE' in t2:
                    m = re.search(r'<TABLE (\d+)x(\d+)>', t2); rows, cols = int(m.group(1)), int(m.group(2))
                    cells = []; k = i + 1
                    while k < n and flat[k][0] == 3 and len(cells) < rows * cols: cells.append(flat[k][1].rstrip('\n')); k += 1
                    stripped = [c.strip() for c in cells]
                    if (sum(1 for c in stripped if re.fullmatch(r'\d+\.', c)) >= 3 and sum(1 for c in stripped if re.fullmatch(r'[①②③④⑤](,\s*[①②③④⑤])*', c)) >= 2) or any(c == '주관식' or '서답형' in c for c in stripped):
                        i = n; stop_all = True; break   # 문서 끝 정답표
                    if cells and all(re.fullmatch(r'[①②③④⑤❶❷❸❹❺]?', c) for c in stripped):
                        q['image_choices'] = True; i = k; continue   # 그림 선택지(표지판 등) — 앱에서 제공 불가
                    if cells and not any('┃' in c for c in cells) and not (rows * cols <= 2 and all(c.strip() in LABELS for c in cells)):
                        q['extra'].append(fmt_table(cells, rows, cols)); last_l1 = None
                    i = k; continue
                # ----- 라벨 -----
                if is_label(l2, t2):
                    if t2.strip() in ('해설', '오답') and last_l1 and last_l1[0] in ('extra', 'post'):
                        lst = q[last_l1[0]]
                        if last_l1[1] < len(lst) and (HANGUL.search(lst[last_l1[1]]) or last_l1[0] == 'post' or '→' in lst[last_l1[1]]):
                            q['explanation'] = (q['explanation'] + ' ' + lst.pop(last_l1[1])).strip(); last_l1 = None
                    i += 1; continue
                if l2 >= 4: i += 1; continue
                # ----- 정답 상자 -----
                if l2 == 3:
                    if re.search(r'정답 및 해설|┃|^\s*\d+회\s*$', f2): i += 1; continue
                    boxes.append(t2); i += 1; continue
                # ----- 다음 문항 시작 -----
                if PASSAGE_RE.match(c2): break
                if (is_stem(f2) or is_eng_stem(f2, flat[i + 1] if i + 1 < n else None)) and (boxes or q['choices']): break
                # ----- 선택지 -----
                if CH_RE.match(f2.strip()):
                    for ln in t2.split('\n'):
                        if not ln.strip(): continue
                        if not CH_RE.match(ln.strip()):
                            # 선택지 이어지는 줄: "(B) …" 짝 / 아래 줄 우리말 뜻
                            if q['choices']:
                                num, txt = q['choices'][-1]; add = clean(ln)
                                q['choices'][-1] = (num, f'{txt} / {add}' if re.match(r'^\([B-E]\)', add) else f'{txt} {add}')
                            continue
                        for num, txt, ok in split_choices(ln):
                            if any(n0 == num for n0, _ in q['choices']): continue
                            q['choices'].append((num, txt))
                            if ok: q['answer'] = str(num)
                    last_l1 = None; i += 1; continue
                # ----- 그 밖의 본문 줄 -----
                if c2.startswith('→'):
                    if not boxes and not q['answer']: q['answer'] = strip_marks(c2.lstrip('→ ').strip())
                    # 채워진 정답 줄: 문항에는 빈칸으로 남김
                    masked = mask_fills(t2)
                    if '______' in masked and re.sub(r'______|→|\s', '', masked): q['extra'].append(clean(masked)); last_l1 = ('extra', len(q['extra']) - 1)
                    i += 1; continue
                korean_only = HANGUL.search(c2) and not LATIN.search(re.sub(r'<[^>]+>', '', c2)) and len(c2) <= 40 and not re.search(r'[.다요]\s*$', c2)
                if q['choices'] and korean_only and ('우리말' in stem or len(q['choices']) < 5):
                    # 선택지 아래 우리말 뜻
                    num, txt = q['choices'][-1]; q['choices'][-1] = (num, f'{txt} ({c2})'); i += 1; continue
                if q['choices'] and (re.match(r'^[ⓐ-ⓗ(]?\S*\s*\S.*→', c2) or (HANGUL.search(f2) and (len(c2) > 25 or re.search(r'→|적절|알맞|고친|의미|뜻', c2)))):
                    q['explanation'] = (q['explanation'] + ' ' + clean(t2)).strip(); last_l1 = ('expl', 0); i += 1; continue
                body = mask_fills(t2)
                target = 'post' if q['choices'] else 'extra'
                q[target].append(clean(body)); last_l1 = (target, len(q[target]) - 1)
                i += 1
            ans, expl, ko = parse_answer_box(boxes)
            pic = re.search(r'그림|사진|그래프|도표', q['stem']) and not q['passage']
            drop = bool(q.get('image_choices')) or bool(pic and (re.search(r'내용상|일치', q['stem']) or (not q['choices'] and re.search(r'보고|참고', q['stem']))))
            if '(A)' in q['stem'] and q['passage'] == '' and passage and not any('(A)' in x for x in q['extra']):
                q['passage'] = '\n'.join(passage)
            if ans and not q['answer']: q['answer'] = ans
            elif ans and q['answer'] and ans.isdigit() is False and ',' in ans: q['answer'] = ans   # ④, ⑤ 복수 정답
            if expl: q['explanation'] = (expl + ' ' + q['explanation']).strip()
            q['ko'] = ko
            if q['answer'] is not None and not drop: qs.append(q)   # 그림이 필요한 문항은 제외
            if stop_all: break
            continue
        i += 1
    # 정리
    out = []
    for q in qs:
        choices = [txt for _, txt in sorted(q['choices'], key=lambda x: x[0])] if q['choices'] else None
        post = q.get('post', [])
        if choices and post:
            if len(post) == len(choices) and not any(HANGUL.search(p) for p in post): choices = [f"{c} / {p}" for c, p in zip(choices, post)]   # A: ... / B: ... 짝 대화
            else: q['extra'] += post
        multi = bool(q['answer'] and re.fullmatch(r'\d(,\s*\d)+', q['answer']))
        qtype = 'mc' if choices and len(choices) >= 3 and q['answer'].isdigit() else 'essay'
        if multi:   # "모두 고르면" — 번호를 쉼표로 쓰는 서술형
            qtype = 'essay'; nums = [x.strip() for x in q['answer'].split(',')]
            q['extra'] = q['extra'] + [f'{CIRC[int(k) - 1]} {c}' for k, c in zip(range(1, 6), choices)] if choices else q['extra']
            q['stem'] = q['stem'] + ' (번호를 쉼표로 구분해 쓰세요. 예: 2, 4)'
            q['answer'] = ', '.join(nums) + ' / ' + ', '.join(reversed(nums)) if len(nums) == 2 else ', '.join(nums)
            choices = None
        if '(A)' in q['stem'] and not q['passage'] and not any('(A)' in x for x in q['extra']):
            joined = '\n'.join(q['extra'])
            if joined.count('<u>') == 1: q['extra'] = [x.replace('<u>', '(A)<u>', 1) if '<u>' in x else x for x in q['extra']]
        text = (('[지문] ' + q['passage'] + '\n\n') if q['passage'] else '') + q['stem'] + (('\n' + '\n'.join(x for x in q['extra'] if x)) if q['extra'] else '')
        expl = re.sub(r'^[\s:：•→]+', '', q['explanation'] or '')
        expl = re.sub(r'^[①②③④⑤]\s*[:：]\s*', '', expl)
        ko = q['ko'] or ''
        if ko and re.search(r'→|어법|동사|주어|수식|관계대명사|적절|알맞|고쳐|쓰여야|해야 한다|이므로|따라서', ko):
            expl = (expl + ' ' + ko).strip(); ko = ''   # 해설 성격의 문장은 해석이 아니라 해설로
        expl = dedup_sentences(expl)
        if ko: expl = (expl + ('\n' if expl else '') + '해석: ' + dedup_sentences(ko)).strip()
        text = tidy_marks(text); choices = [tidy_marks(c) for c in choices] if choices else choices
        out.append({'school': 'EXAM4YOU 예상', 'year': tag['year'], 'term': tag['term'], 'type': qtype, 'question': text,
                    'choices': choices if qtype == 'mc' else None, 'answer': strip_marks(q['answer']).strip(), 'explanation': strip_marks(expl) or None})
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
