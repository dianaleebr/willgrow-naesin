import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && anon);

// "로그인 상태 유지" 체크 → localStorage, 아니면 탭을 닫으면 사라지는 sessionStorage
const REMEMBER_KEY = 'wg_remember';
export const setRemember = (on) => { try { localStorage.setItem(REMEMBER_KEY, on ? '1' : '0'); } catch {} };
const remember = () => { try { return localStorage.getItem(REMEMBER_KEY) !== '0'; } catch { return true; } };
const store = () => (remember() ? localStorage : sessionStorage);
const dynamicStorage = {
  getItem: (k) => store().getItem(k) ?? (remember() ? null : localStorage.getItem(k)),
  setItem: (k, v) => store().setItem(k, v),
  removeItem: (k) => { localStorage.removeItem(k); sessionStorage.removeItem(k); },
};

export const supabase = createClient(url || 'http://localhost:54321', anon || 'anon', {
  auth: { storage: dynamicStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
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
