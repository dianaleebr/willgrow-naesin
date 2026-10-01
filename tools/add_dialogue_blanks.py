"""이미 변환된 content/*.json 에 대화문 빈칸(핵심 표현 위주)만 추가/갱신하고 bundles 를 다시 묶는다.
사용: python3 tools/add_dialogue_blanks.py txt content
"""
import json, re, os, sys, glob
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dialogue_blanks

TXT = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/txt'
OUT = sys.argv[2] if len(sys.argv) > 2 else '/home/claude/willgrow-naesin/content'

def key_of(fname):
    m = re.match(r'\(2022개정\)\d{4}년_(중\d|공통영어\d)_([^_]+)_([^_]+)_(.+)\.json$', fname)
    if not m: return None
    grade_s, pub, lesson, kind = m.groups()
    grade = int(grade_s[1]) if grade_s.startswith('중') else 10 + int(grade_s[-1])
    pub = pub.replace('NE능률', '능률')
    if grade_s.startswith('공통영어'): pub = f'{pub} {grade_s}'
    lm = re.match(r'(\d+)과', lesson)
    if lm: unit = int(lm.group(1))
    else:
        sm = re.search(r'(\d+)', lesson); unit = 90 + (int(sm.group(1)) if sm else 0)
    return (pub, grade, unit, kind)

naesin = {}
for f in sorted(os.listdir(TXT)):
    k = key_of(f)
    if k and '내용정리' in k[3]:
        pub, grade, unit, _ = k
        name = f"{pub}_{'중'+str(grade) if grade < 10 else '고'}_{unit:02d}.json".replace(' ', '')
        naesin.setdefault(name, f)   # (1) 중복본은 첫 파일 사용

total = 0
for n in sorted(x for x in glob.glob(os.path.join(OUT, '*.json')) if not os.path.basename(x).startswith('_')):
    b = os.path.basename(n); d = json.load(open(n))
    items = []
    if b in naesin and d.get('dialogues'):
        flat = json.load(open(os.path.join(TXT, naesin[b])))['flat']
        items = dialogue_blanks.build(flat, d['dialogues'])
        for it in items:
            hint = it.pop('hint', None)
            if hint: it['ko'] = (it.get('ko') or '') + (' · ' if it.get('ko') else '') + '빈칸: ' + hint
    d['dialogue_blanks'] = items; total += len(items)
    json.dump(d, open(n, 'w'), ensure_ascii=False, indent=1)
    print(b, 'lines', sum(len(x['lines']) for x in d['dialogues']), '→ blanks', len(items), '| 핵심표현형', sum(1 for i in items if i.get('explanation') or '빈칸:' in (i.get('ko') or '')))
print('total', total)

# 기출문제 지문 해석(passage_ko) 붙이기
import subprocess
subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'exam_translate.py'), OUT], check=True)

# bundles 다시 묶기
bd = os.path.join(OUT, 'bundles'); os.makedirs(bd, exist_ok=True)
groups = {}
for n in sorted(glob.glob(os.path.join(OUT, '*.json'))):
    if os.path.basename(n).startswith('_'): continue
    d = json.load(open(n)); groups.setdefault(d['publisher'], []).append(d)
for pub, arr in groups.items():
    arr.sort(key=lambda d: (d['grade'], d['unit']))
    name = f"{pub}_전체{len(arr)}과.json".replace(' ', '')
    json.dump(arr, open(os.path.join(bd, name), 'w'), ensure_ascii=False)
    print('bundle', name, len(arr))
