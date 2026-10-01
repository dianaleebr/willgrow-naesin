"""content/*.json 의 exam_questions 품질 점검 — 유형별 건수와 예시 출력
사용: python3 tools/audit_exam.py content [--show N]
"""
import json, glob, os, re, sys
from collections import Counter, defaultdict

OUT = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else '/home/claude/willgrow-naesin/content'
SHOW = int(sys.argv[sys.argv.index('--show') + 1]) if '--show' in sys.argv else 2
HANGUL = re.compile(r'[가-힣]')
STEM = re.compile(r'(것은|것을|말은|하시오|쓰시오|고르시오|완성하시오|배열하시오|영작하시오|답하시오|바꾸시오|고치시오|찾으시오|은\?|는\?|까\?|가\?|요\?|나\?|지\?)\s*[.?]?\s*$')

def problems(q):
    out = []
    text = q['question']; ch = q.get('choices') or []; ans = q.get('answer') or ''
    lines = [l for l in text.split('\n') if l.strip()]
    stem_i = [i for i, l in enumerate(lines) if STEM.search(l.strip()) and HANGUL.search(l) and not re.match(r'^[①②③④⑤ⓐ-ⓔ(]', l.strip())]
    body = text.split('\n\n', 1)[1] if text.startswith('[지문]') and '\n\n' in text else text
    allt = text + '\n' + '\n'.join(ch)
    if re.search(r'</u>', allt) and allt.count('<u>') != allt.count('</u>'): out.append('tag_unbalanced')
    if '______</u>' in allt or '<u>______' in allt: out.append('tag_on_blank')
    if len(stem_i) > 1: out.append('multi_stem')
    if re.search(r'^[ⓐ-ⓔ]\s*\S+\s*→', body, re.M) or re.search(r'^\(?[1-5]\)?\s*[A-Za-z].*→', body, re.M): out.append('answer_leak_arrow')
    if q['type'] == 'mc':
        if len(ch) != 5: out.append(f'mc_choices_{len(ch)}')
        if not ans.isdigit() or not (1 <= int(ans) <= max(len(ch), 1)): out.append('mc_bad_answer')
        if len(set(c.strip() for c in ch)) != len(ch): out.append('mc_dup_choice')
        if any(not c.strip() for c in ch): out.append('mc_empty_choice')
    else:
        if not ans.strip(): out.append('essay_no_answer')
        if re.fullmatch(r'[①②③④⑤]', ans.strip()): out.append('essay_answer_is_mark')
        if len(ans) > 300: out.append('essay_answer_long')
    if '우리말' in text and '어색' in text and not any(HANGUL.search(c) for c in ch) and not HANGUL.search(body.replace('우리말', '').replace('어색', '')[:0] + ''.join(l for l in lines if not STEM.search(l))): out.append('korean_meaning_missing')
    if '<보기>' in text or '보기>' in text or '[보기]' in text:
        if not re.search(r'<보기>\s*\S|\[보기\]\s*\S|보기\]?\s*[:：]\s*\S', text.replace('\n', ' ')) and not re.search(r'<보기>|\[보기\]', text.split('\n', 1)[-1] if len(lines) > 1 else ''): out.append('bogi_missing')
    if re.search(r'\(A\)', body) and not any(re.search(r'\(A\)', l) for l in lines if not STEM.search(l)): out.append('ref_A_missing')
    if re.search(r'빈칸', text) and not re.search(r'_{2,}|\(A\)|\(a\)|\( \)|\(\s+\)|＿|___', allt) and q['type'] == 'mc': out.append('blank_missing_mc')
    if re.search(r'(다음|아래)\s*(글|대화|표|그림|도표|포스터|광고|안내문|메모|편지|이메일|문자|일기)', text) and not text.startswith('[지문]') and len(lines) <= 1: out.append('context_missing')
    if re.search(r'밑줄', text) and '<u>' not in allt: out.append('underline_missing')
    if re.search(r'[❶❷❸❹❺]', allt): out.append('answer_mark_in_text')
    if re.search(r'정답\s*[:：]|해설\s*[:：]', text): out.append('answer_label_in_text')
    if re.search(r'\(1\)', text) and re.search(r'\(2\)', text) and q['type'] == 'essay' and not re.search(r'\(2\)|2\)', ans): out.append('multi_part_answer_short')
    return out

cnt = Counter(); samples = defaultdict(list); total = 0; per_file = defaultdict(Counter)
for n in sorted(glob.glob(os.path.join(OUT, '*.json'))):
    d = json.load(open(n)); b = os.path.basename(n)
    seen = set()
    for q in d['exam_questions']:
        total += 1
        ps = problems(q)
        key = q['question'] + '|' + '|'.join(q.get('choices') or [])
        if key in seen: ps.append('duplicate')
        seen.add(key)
        for p in ps:
            cnt[p] += 1; per_file[b][p] += 1
            if len(samples[p]) < SHOW: samples[p].append((b, q['term'], json.dumps(q, ensure_ascii=False)[:420]))
print('total questions', total)
for p, c in cnt.most_common():
    print(f'\n### {p}: {c}')
    for s in samples[p]: print('  -', s[0], s[1], '|', s[2])
