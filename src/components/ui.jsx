import { useEffect, useState, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { speak, ttsSupported } from '../lib/tts.js';

const BASE = import.meta.env.BASE_URL || '/';
export const LOGO = `${BASE}logo.png`;            // 가로형(한글 포함) — 로그인 화면
export const WORDMARK = `${BASE}logo-wordmark.png`; // WILLGROW 글자만 — 상단바
export const SYMBOL = `${BASE}w-symbol.png`;

export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const run = useCallback(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.resolve().then(fn).then((data) => alive && setState({ loading: false, data, error: null }))
      .catch((e) => alive && setState({ loading: false, data: null, error: e.message || String(e) }));
    return () => { alive = false; };
  }, deps); // eslint-disable-line
  useEffect(() => run(), [run]);
  return { ...state, reload: run };
}

export function Splash() {
  return <div className="splash"><img src={SYMBOL} alt="" /><div className="muted">불러오는 중…</div></div>;
}
export function Loading() { return <div className="center mt"><span className="spinner" /></div>; }
export function ErrorBox({ error }) { return error ? <div className="alert err mt">{error}</div> : null; }

export function TopBar({ title, back }) {
  const { profile, logout } = useAuth();
  const nav = useNavigate();
  return (
    <header className="topbar">
      {back && <button className="btn ghost sm" onClick={() => (typeof back === 'string' ? nav(back) : nav(-1))}>‹</button>}
      <Link to="/"><img className="logo" src={WORDMARK} alt="WILLGROW" /></Link>
      {title && <span style={{ fontWeight: 700, fontSize: 15 }}>{title}</span>}
      <div className="who">
        {profile && <span><b>{profile.name}</b>{profile.role === 'teacher' && !/선생님$/.test(profile.name) ? ' 선생님' : ''}</span>}
        <button className="btn ghost sm" onClick={logout}>로그아웃</button>
      </div>
    </header>
  );
}

export function BottomNav({ wrongCount }) {
  const { pathname } = useLocation();
  const items = [
    { to: '/', label: '홈' },
    { to: '/units', label: '학습' },
    { to: '/wrong', label: '오답노트', cnt: wrongCount },
  ];
  return (
    <nav className="bottomnav">
      {items.map((it) => (
        <Link key={it.to} to={it.to} className={pathname === it.to || (it.to !== '/' && pathname.startsWith(it.to)) ? 'on' : ''}>
          <span className="lbl">{it.label}{it.cnt > 0 && <span className="cnt">{it.cnt}</span>}</span>
        </Link>
      ))}
    </nav>
  );
}

export function TtsButton({ text, label = '듣기' }) {
  if (!ttsSupported) return null;
  return <button type="button" className="btn tts" onClick={(e) => { e.stopPropagation(); speak(text); }} aria-label="발음 듣기">{label}</button>;
}

export function Progress({ label, pct, sub }) {
  const cls = pct >= 80 ? '' : pct >= 50 ? 'yellow' : 'red';
  return (
    <div className="pbox">
      <div className="row"><span>{label}</span><b className="en">{pct ?? 0}%{sub ? <span className="muted small"> {sub}</span> : null}</b></div>
      <div className={`bar ${cls}`}><i style={{ width: `${Math.min(100, pct || 0)}%` }} /></div>
    </div>
  );
}

export function Toggle({ value, onChange, options }) {
  return (
    <div className="toggle">
      {options.map((o) => <button key={o.value} type="button" className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>{o.label}</button>)}
    </div>
  );
}

export function Empty({ children }) { return <div className="card soft center muted">{children}</div>; }

export const pctClass = (p) => (p >= 80 ? 'c-green' : p >= 50 ? 'c-yellow' : 'c-red');
export const gradeLabel = (u) => `${u?.publishers?.level || '중'}${u?.grade ?? ''}`;
export const unitLabel = (u) => u ? `${u.publishers?.name ? u.publishers.name + ' ' : ''}${gradeLabel(u)} Lesson ${u.unit_no}${u.title ? ' · ' + u.title : ''}` : '';

// 기출문제 텍스트의 <u>…</u>(밑줄) 표시를 실제 밑줄로 렌더링
export function RichText({ text }) {
  const str = String(text ?? '');
  if (!str.includes('<u>')) return str;
  const parts = str.split(/(<u>[\s\S]*?<\/u>)/g);
  return parts.map((p, i) => p.startsWith('<u>') ? <u key={i} style={{ textDecorationThickness: 2, textUnderlineOffset: 3 }}>{p.slice(3, -4)}</u> : <span key={i}>{p.replace(/<\/?u?>?$/g, '').replace(/<\/?u>/g, '')}</span>);
}
export const plainText = (s) => String(s ?? '').replace(/<\/?u>/g, '');
