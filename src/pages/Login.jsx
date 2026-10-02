import { useState } from 'react';
import { useAuth } from '../lib/auth.jsx';
import { WORDMARK } from '../components/ui.jsx';
import { isConfigured } from '../lib/supabase.js';

export default function Login() {
  const { login } = useAuth();
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { await login(id, pw); } catch (ex) { setErr(ex.message); } finally { setBusy(false); }
  };

  return (
    <div className="login-wrap">
      <form className="login-box stack" onSubmit={submit}>
        <img src={WORDMARK} alt="WILLGROW" />
        <h1><span>내신</span>마스터</h1>
        {!isConfigured && <div className="alert err">Supabase 설정(.env)이 없습니다. README를 확인하세요.</div>}
        <div>
          <label className="field">아이디</label>
          <input className="input" value={id} onChange={(e) => setId(e.target.value)} autoComplete="username" autoCapitalize="off" required />
        </div>
        <div>
          <label className="field">비밀번호</label>
          <input className="input" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required />
        </div>
        {err && <div className="error">{err}</div>}
        <button className="btn primary lg block" disabled={busy}>{busy ? '로그인 중…' : '로그인'}</button>
      </form>
    </div>
  );
}
