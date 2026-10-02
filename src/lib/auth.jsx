import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, loginEmail, rpc } from './supabase.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = 로딩중
  const [profile, setProfile] = useState(null);

  const loadProfile = useCallback(async () => {
    try { setProfile(await rpc('me')); } catch { setProfile(null); }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session && window.location.hash && window.location.hash !== '#/') window.location.hash = '#/';   // 로그인 전엔 항상 첫 화면
      setSession(data.session ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) loadProfile(); else setProfile(null);
  }, [session, loadProfile]);

  const login = async (loginId, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail(loginId), password });
    if (error) throw new Error(/invalid/i.test(error.message) ? '아이디 또는 비밀번호가 맞지 않습니다.' : error.message);
    window.location.hash = '#/';   // 로그인하면 홈부터
  };
  const logout = async () => { await supabase.auth.signOut(); window.location.hash = '#/'; };

  return (
    <AuthCtx.Provider value={{ session, profile, login, logout, reloadProfile: loadProfile }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
