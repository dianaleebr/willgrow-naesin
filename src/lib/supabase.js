import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && anon);

// 접속할 때마다 로그인 화면부터: 세션은 탭(앱)을 닫으면 사라지는 sessionStorage 에만 둠
export const setRemember = () => {};
const sessionOnly = {
  getItem: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  setItem: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} },
  removeItem: (k) => { try { sessionStorage.removeItem(k); localStorage.removeItem(k); } catch {} },
};
// 예전 버전이 localStorage 에 남긴 로그인 정보는 지움
try { Object.keys(localStorage).filter((k) => k.startsWith('sb-') && k.endsWith('-auth-token')).forEach((k) => localStorage.removeItem(k)); } catch {}

export const supabase = createClient(url || 'http://localhost:54321', anon || 'anon', {
  auth: { storage: sessionOnly, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
});

export const loginEmail = (loginId) => `${String(loginId).trim().toLowerCase()}@student.willgrow`;

// rpc 호출 도우미: 에러면 throw
export async function rpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data;
}
export function unwrap({ data, error }) {
  if (error) throw new Error(error.message);
  return data;
}
