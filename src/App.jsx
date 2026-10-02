import { HashRouter, Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth.jsx';
import { TopBar, BottomNav, Splash, useAsync } from './components/ui.jsx';
import { countOpenWrong } from './lib/api.js';
import Login from './pages/Login.jsx';
import Password from './pages/Password.jsx';
import Home from './pages/student/Home.jsx';
import { UnitList, UnitMenu } from './pages/student/Units.jsx';
import { Words, WordTest, Dialogue, DialogueBlank, Reading, ReadingBlank, Exam, ReadingAnalysis } from './pages/student/Materials.jsx';
import WrongNotes from './pages/student/WrongNotes.jsx';
import Dashboard, { WrongTop } from './pages/teacher/Dashboard.jsx';
import Students from './pages/teacher/Students.jsx';
import Content from './pages/teacher/Content.jsx';
import Ranges from './pages/teacher/Ranges.jsx';
import Assign from './pages/teacher/Assign.jsx';
import Settings from './pages/teacher/Settings.jsx';

function StudentShell() {
  const { pathname } = useLocation();
  const wrong = useAsync(countOpenWrong, [pathname]);
  const isHome = pathname === '/';
  return (
    <>
      <TopBar back={!isHome} />
      <main className="page">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/password" element={<Password />} />
          <Route path="/units" element={<UnitList />} />
          <Route path="/unit/:unitId" element={<UnitMenu />} />
          <Route path="/unit/:unitId/words" element={<Words />} />
          <Route path="/unit/:unitId/word-test" element={<WordTest />} />
          <Route path="/unit/:unitId/dialogue" element={<Dialogue />} />
          <Route path="/unit/:unitId/dialogue-blank" element={<DialogueBlank />} />
          <Route path="/unit/:unitId/reading" element={<Reading />} />
          <Route path="/unit/:unitId/reading-blank" element={<ReadingBlank />} />
          <Route path="/unit/:unitId/reading-analysis" element={<ReadingAnalysis />} />
          <Route path="/unit/:unitId/exam" element={<Exam />} />
          <Route path="/wrong" element={<WrongNotes />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BottomNav wrongCount={wrong.data || 0} />
    </>
  );
}

function TeacherShell() {
  const tabs = [['/', '진도율'], ['/students', '학생 계정'], ['/content', '콘텐츠'], ['/ranges', '시험범위'], ['/assign', '숙제·수업'], ['/wrong', '오답 분석'], ['/settings', '설정'], ['/units', '학생 화면 보기']];
  return (
    <>
      <TopBar title="선생님" />
      <nav className="tnav">{tabs.map(([to, l]) => <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'on' : '')}>{l}</NavLink>)}</nav>
      <main className="page wide">
        <Routes>
          <Route path="/password" element={<Password />} />
          <Route path="/" element={<Dashboard />} />
          <Route path="/students" element={<Students />} />
          <Route path="/content" element={<Content />} />
          <Route path="/ranges" element={<Ranges />} />
          <Route path="/assign" element={<Assign />} />
          <Route path="/wrong" element={<WrongTop />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/units" element={<TeacherPreviewNote><UnitList /></TeacherPreviewNote>} />
          <Route path="/unit/:unitId" element={<UnitMenu />} />
          <Route path="/unit/:unitId/words" element={<Words />} />
          <Route path="/unit/:unitId/word-test" element={<WordTest />} />
          <Route path="/unit/:unitId/dialogue" element={<Dialogue />} />
          <Route path="/unit/:unitId/dialogue-blank" element={<DialogueBlank />} />
          <Route path="/unit/:unitId/reading" element={<Reading />} />
          <Route path="/unit/:unitId/reading-blank" element={<ReadingBlank />} />
          <Route path="/unit/:unitId/reading-analysis" element={<ReadingAnalysis />} />
          <Route path="/unit/:unitId/exam" element={<Exam />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}

function TeacherPreviewNote({ children }) {
  return <div className="stack"><div className="alert ok">학생이 보는 화면과 같아요 (선생님 계정은 모든 출판사 유닛이 보입니다). 여기서 풀면 기록은 선생님 계정에 남습니다.</div>{children}</div>;
}

function Gate() {
  const { session, profile } = useAuth();
  if (session === undefined) return <Splash />;
  if (!session) return <Login />;
  if (!profile) return <Splash />;
  return profile.role === 'teacher' ? <TeacherShell /> : <StudentShell />;
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Gate />
      </HashRouter>
    </AuthProvider>
  );
}
