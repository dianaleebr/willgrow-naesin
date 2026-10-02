"""내용정리 플러스 → 본문분석(문장별 구문·문법 해설, 단락 Grammar+, Master's Pick, T/F) 추출
결과: {'paragraphs': [{'no', 'title', 'sentences': [{'no','en','ko','points':[{'tag','text','flags':[],'notes':[{'kind','text'}]}],'vocab':[...]}],
                      'grammar': [{'title','lines':[...]}], 'summary': {'title','text','next':[...]}, 'tf': [{'q','a'}]}]}
"""
import re

HANGUL = re.compile(r'[가-힣]')
LATIN = re.compile(r'[A-Za-z]')
PARA_RE = re.compile(r'^\s*본문([❶-❿①-⑩])\s*(.*)$')
CIRC = {c: i + 1 for i, c in enumerate('❶❷❸❹❺❻❼❽❾❿')}
CIRC.update({c: i + 1 for i, c in enumerate('①②③④⑤⑥⑦⑧⑨⑩')})
NOTE_LABELS = ('참고', 'e.g.', '전환', '주의', '비교', '응용', '어법')
FLAG_LABELS = ('전환', '서술형 대비', '문장 삽입', '객관식 대비', '어법 대비', '영작 대비')

def is_en(t):
    return bool(LATIN.search(t)) and len(HANGUL.findall(t)) * 3 < len(LATIN.findall(t))

def parse(flat):
    n = len(flat)
    # 단락 제목 (Reading Logic Flow 목록)
    titles = {}
    for l, t in flat:
        m = PARA_RE.match(t.strip())
        if m and m.group(2).strip() and l in (5, 3, 4): titles.setdefault(CIRC.get(m.group(1), 0), m.group(2).strip())
    paragraphs = []
    cur = None
    i = 0
    def new_para(no):
        p = {'no': no, 'title': titles.get(no), 'sentences': [], 'grammar': [], 'summary': None, 'tf': []}
        paragraphs.append(p); return p
    while i < n:
        l, t = flat[i]; s = t.strip()
        m = PARA_RE.match(s)
        if m and l == 4 and not m.group(2).strip():
            no = CIRC.get(m.group(1), 0)
            # 같은 번호 단락이 이미 있으면(연습 섹션) 더 이상 수집하지 않음
            cur = next((p for p in paragraphs if p['no'] == no), None) or new_para(no)
            i += 1; continue
        if s == 'Sentence Structures' and cur is not None:
            i = parse_sentences(flat, i + 1, cur)
            continue
        if s == 'Grammar+' and cur is not None and i > 0 and flat[i - 1][0] == 4:
            i = parse_grammar(flat, i, cur)
            continue
        if s.startswith('✦Master') and cur is not None:
            i = parse_master(flat, i, cur)
            continue
        if s == 'CHECK' and cur is not None and i + 1 < n and 'T/F' in (flat[i - 1][1] if i > 0 else ''):
            i = parse_tf(flat, i + 1, cur)
            continue
        if s.startswith(' Reading Practice') or s.startswith('Reading Practice'):
            break   # 이후는 연습문제
        i += 1
    paragraphs = [p for p in paragraphs if p['sentences']]
    return {'paragraphs': paragraphs}

def parse_sentences(flat, i, para):
    n = len(flat)
    sent = None; point = None
    def flush():
        nonlocal sent, point
        if sent and sent['en']:
            sent['en'] = re.sub(r'\s+', ' ', sent['en']).strip()
            para['sentences'].append(sent)
        sent = None; point = None
    while i < n:
        l, t = flat[i]; s = t.strip()
        if '<TABLE' in t or s in ('Grammar+', 'READING') or s.startswith('✦Master') or PARA_RE.match(s) or s == 'Sentence Structures':
            break
        if l == 1:
            if s.startswith('❮'):
                point = {'tag': None, 'text': s, 'flags': [], 'notes': []}
                if sent is None: sent = {'no': None, 'en': '', 'ko': None, 'points': [], 'vocab': []}
                sent['points'].append(point)
            elif is_en(s) and HANGUL.match(s) and point is not None:   # '종속절 주절 = ...' 같은 구조 메모
                point['notes'].append({'kind': '참고', 'text': s})
            elif is_en(s) and not s.startswith('❙'):
                # 영어 문장: 새 문장 시작 또는 줄바꿈 이어짐
                if sent and sent['ko'] is None and sent['en'] and not sent['points']:
                    sent['en'] += ' ' + s
                elif sent and sent['ko'] is not None and point is not None and i + 1 < n and flat[i + 1][0] == 4 and flat[i + 1][1].strip() in NOTE_LABELS:
                    point['notes'].append({'kind': flat[i + 1][1].strip(), 'text': s}); i += 1
                elif sent and sent['ko'] is not None and point is not None and point['notes'] and point['notes'][-1]['kind'] in ('참고', '전환') and not is_en(point['notes'][-1]['text']):
                    point['notes'].append({'kind': 'e.g.', 'text': s})
                else:
                    flush(); sent = {'no': None, 'en': s, 'ko': None, 'points': [], 'vocab': []}
            elif HANGUL.search(s):
                if sent is None: sent = {'no': None, 'en': '', 'ko': None, 'points': [], 'vocab': []}
                if sent['ko'] is None and not sent['points']:
                    sent['ko'] = s
                else:
                    kind = flat[i + 1][1].strip() if i + 1 < n and flat[i + 1][0] == 4 and flat[i + 1][1].strip() in NOTE_LABELS else '참고'
                    if i + 1 < n and flat[i + 1][0] == 4 and flat[i + 1][1].strip() in NOTE_LABELS: i += 1
                    target = point if point is not None else None
                    if target is None:
                        point = {'tag': None, 'text': '', 'flags': [], 'notes': []}; sent['points'].append(point); target = point
                    target['notes'].append({'kind': kind, 'text': s})
        elif l == 4:
            if re.fullmatch(r'\d+', s):
                if sent is not None and sent['no'] is None: sent['no'] = int(s)
            elif s in NOTE_LABELS:
                pass   # 라벨은 위에서 소비됨
            elif s in FLAG_LABELS:
                if point is not None: point['flags'].append(s)
            elif s.startswith('⤷') or s == '동격':
                pass
            elif point is not None and point['tag'] is None:
                point['tag'] = s
            elif point is not None and s:
                point['flags'].append(s)
        elif l == 7:
            if s.startswith('◗'):
                # 어휘&숙어 블록: level7 = 항목(들여쓴 줄은 유의어/반의어), level10 = 라벨(순서대로)
                j = i + 1; entries = []; pending = []   # pending: 라벨을 기다리는 관계 그룹들
                while j < n and flat[j][0] in (7, 10):
                    ll, tt = flat[j]
                    if ll == 7:
                        raw = tt.rstrip('\n')
                        lines = [x for x in raw.split('\n') if x.strip()]
                        if not lines or re.fullmatch(r'\s*\d+\s*', raw): j += 1; continue
                        if raw.startswith((' ', '\t')) or not entries:
                            rel_lines = lines if raw.startswith((' ', '\t')) else lines[1:]
                            if not raw.startswith((' ', '\t')): entries.append({'t': lines[0].strip(), 'rel': []})
                        else:
                            entries.append({'t': lines[0].strip(), 'rel': []}); rel_lines = lines[1:]
                        for rl in rel_lines:
                            for g in re.split(r'\s{2,}', rl.strip()):
                                g = g.strip()
                                if not g or not entries: continue
                                if not LATIN.search(g):   # 들여쓴 우리말 줄 = 뜻이 다음 줄로 넘어간 것
                                    entries[-1]['t'] += ' ' + g; continue
                                if entries[-1]['rel'] and entries[-1]['rel'][-1][1].endswith(','):
                                    entries[-1]['rel'][-1][1] += ' ' + g; continue   # 쉼표로 이어지는 유의어 목록
                                entries[-1]['rel'].append([None, g]); pending.append(entries[-1]['rel'][-1])
                    elif ll == 10 and pending:
                        pending.pop(0)[0] = tt.strip()
                    j += 1
                merged = []
                for e in entries:
                    rel = '  '.join(f"{lab or '유의어'}: {g}" for lab, g in e['rel'])
                    merged.append(e['t'] + ('  ' + rel if rel else ''))
                if sent is not None: sent['vocab'].extend(merged)
                i = j; continue
        i += 1
    flush()
    return i

def parse_grammar(flat, i, para):
    """flat[i-1] = 제목(level4), flat[i] = 'Grammar+' """
    n = len(flat)
    title = flat[i - 1][1].strip()
    lines = []
    j = i + 1
    while j < n:
        l, t = flat[j]; s = t.rstrip('\n').strip()
        if s in ('Grammar+',) or s.startswith('✦Master') or (l == 3 and s in ('T/F', 'CHECK')) or PARA_RE.match(s) or s == 'Sentence Structures' or s == 'READING' or s.startswith('❙정답') or s.startswith(' Reading Practice'):
            break
        if '<TABLE' in t: j += 1; continue
        if l in (4, 5, 6) and s:
            if s == 'e.g.': j += 1; continue
            if l == 7: j += 1; continue
            lines.append(s)
        elif l == 7 and s not in ('e.g.', 'Grammar+'):
            lines.append(s)
        j += 1
    # 다음 Grammar+ 제목(level4)이 lines 마지막에 섞여 들어간 경우 제거
    if j < n and flat[j][1].strip() == 'Grammar+' and lines and lines[-1] == flat[j - 1][1].strip(): lines.pop()
    para['grammar'].append({'title': title, 'lines': lines})
    return j

def parse_master(flat, i, para):
    n = len(flat)
    title = flat[i - 1][1].strip() if i > 0 and flat[i - 1][0] == 3 else None
    text = None; nxt = []
    j = i + 1
    while j < n:
        l, t = flat[j]; s = t.strip()
        if l != 3 or '<TABLE' in t: break
        if s.startswith('→'): j += 1; continue
        if text is None: text = s
        else: nxt.append(s)
        j += 1
    para['summary'] = {'title': title, 'text': text, 'next': nxt}
    return j

def parse_tf(flat, i, para):
    n = len(flat)
    qs = []
    j = i
    # 질문
    while j < n:
        l, t = flat[j]; s = t.strip()
        if s.startswith('❙정답'): break
        if '<TABLE' in t and j > i + 1: break
        if l == 3 and s and not re.fullmatch(r'\d+\.', s) and 'T/F' not in s and '본문의 내용' not in s and '<TABLE' not in t: qs.append({'q': s, 'a': None})
        j += 1
    # 정답
    k = j; ans = []
    while k < n and k < j + 40:
        l, t = flat[k]; s = t.strip()
        if k > j and (l != 3 and '<TABLE' not in t and not s.startswith('❙정답')): break
        if s in ('T', 'F'): ans.append(s)
        k += 1
    for q, a in zip(qs, ans): q['a'] = a
    para['tf'].extend(q for q in qs if q['a'])
    return k

if __name__ == '__main__':
    import json, sys
    flat = json.load(open(sys.argv[1]))['flat']
    out = parse(flat)
    for p in out['paragraphs']:
        print('==', p['no'], p['title'], 'sent', len(p['sentences']), 'G+', len(p['grammar']), 'tf', len(p['tf']), 'summary', bool(p['summary']))
        for s in p['sentences'][:3]:
            print(json.dumps(s, ensure_ascii=False)[:600])
