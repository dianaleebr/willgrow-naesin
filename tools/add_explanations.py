"""content/*.json 에 해설 사전(content/_explanations.json)을 적용.
 - exam_questions: 해설 없는 문항에 생성 해설 추가
 - dialogue_blanks: 해설 없는 항목에 표현 설명 추가
 - blanks(w3): "정답 문장" 앞에 단어 뜻·문법 메모 추가
사용: python3 tools/add_explanations.py content
"""
import json, glob, os, re, sys, hashlib
OUT = sys.argv[1] if len(sys.argv) > 1 else 'content'
def h(s): return hashlib.md5(s.encode()).hexdigest()[:12]
path = os.path.join(OUT, '_explanations.json')
D = json.load(open(path)) if os.path.exists(path) else {}
ne = nd = nw = 0
for n in sorted(x for x in glob.glob(os.path.join(OUT, '*.json')) if not os.path.basename(x).startswith('_')):
    d = json.load(open(n))
    for q in d['exam_questions']:
        if q.get('explanation'): continue
        e = D.get(h(q['question'] + '|' + '|'.join(q.get('choices') or [])))
        if e: q['explanation'] = e; ne += 1
    for b in d.get('dialogue_blanks', []):
        if b.get('explanation'): continue
        e = D.get(h('d|' + b['prompt'] + '|' + '|'.join(b['answers'])))
        if e: b['explanation'] = e; nd += 1
    for b in d['blanks']:
        if b['difficulty'] != 'w3': continue
        e = D.get(h('w3|' + b['prompt'] + '|' + '|'.join(b['answers'])))
        if e and not (b.get('explanation') or '').startswith(e):
            b['explanation'] = (e + ' ' + (b.get('explanation') or '')).strip(); nw += 1
    json.dump(d, open(n, 'w'), ensure_ascii=False, indent=1)
print(f'explanations applied: exam {ne}, dialogue {nd}, w3 {nw}')
