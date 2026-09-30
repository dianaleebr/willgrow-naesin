"""HWP5 텍스트 추출 (olefile + zlib, 외부 HWP 라이브러리 불필요)
사용: python3 hwp_text.py 파일.hwp  → 문단/표 구조를 JSON 으로 출력
"""
import sys, json, struct, zlib, olefile

EXT_CTRL = {1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23, 4, 5, 6, 7, 8, 19, 20}  # 8 WCHAR 짜리 컨트롤 문자
TAB = 9  # 탭도 8 WCHAR

def para_text(b: bytes) -> str:
    out = []
    i = 0
    n = len(b) - 1
    while i < n:
        c = b[i] | (b[i + 1] << 8)
        i += 2
        if c < 32:
            if c in EXT_CTRL:
                i += 14
            elif c == TAB:
                i += 14; out.append('\t')
            elif c in (10, 13):
                out.append('\n')
            continue
        out.append(chr(c) if not (0xD800 <= c <= 0xDFFF) else '')
    return ''.join(out)

def records(b: bytes):
    o, L = 0, len(b)
    while o + 4 <= L:
        h = struct.unpack_from('<I', b, o)[0]
        tag, level, size = h & 0x3FF, (h >> 10) & 0x3FF, (h >> 20) & 0xFFF
        o += 4
        if size == 0xFFF:
            size = struct.unpack_from('<I', b, o)[0]
            o += 4
        yield tag, level, b[o:o + size]
        o += size

def extract(path):
    ole = olefile.OleFileIO(path)
    fh = ole.openstream('FileHeader').read()
    flags = struct.unpack_from('<I', fh, 36)[0]
    compressed, encrypted, distributed = bool(flags & 1), bool(flags & 2), bool(flags & 4)
    if encrypted:
        raise SystemExit('암호화된 문서')
    secs = sorted([e for e in ole.listdir() if len(e) == 2 and e[0] in ('BodyText', 'ViewText') and e[1].startswith('Section')],
                  key=lambda e: int(e[1][7:]))
    items = []  # {'t': text} | {'table': rows, 'cols': cols} | {'cell': (col,row)}
    for e in secs:
        raw = ole.openstream(e).read()
        if e[0] == 'ViewText':
            items.append({'t': '[배포용 문서 — 텍스트 보호]'}); continue
        b = zlib.decompress(raw, -15) if compressed else raw
        for tag, level, data in records(b):
            if tag == 67:
                items.append({'l': level, 't': para_text(data)})
            elif tag == 77:  # TABLE
                rows, cols = struct.unpack_from('<HH', data, 4)
                items.append({'l': level, 'table': rows, 'cols': cols})
            elif tag == 72 and len(data) >= 14:  # LIST_HEADER (cell)
                col, row = struct.unpack_from('<HH', data, 6)
                items.append({'l': level, 'cell': [col, row]})
    return {'compressed': compressed, 'distributed': distributed, 'items': items}

def flat(items):
    """선형 표현: 문단은 [level, text], 표 시작은 [level, '<TABLE r x c>'] 문자열"""
    out = []
    for it in items:
        if 'table' in it: out.append([it['l'], f"<TABLE {it['table']}x{it['cols']}>"])
        elif 't' in it and it['t'].strip(): out.append([it['l'], it['t']])
    return out

if __name__ == '__main__':
    r = extract(sys.argv[1])
    print(json.dumps({'meta': {k: v for k, v in r.items() if k != 'items'}, 'flat': flat(r['items'])}, ensure_ascii=False, indent=0))
