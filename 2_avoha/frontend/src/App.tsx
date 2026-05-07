// === App — 라우팅 + 레이아웃 + AuthGate (3탭: 캘린더/홈/설정) ===
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AuthGate from './components/AuthGate';
import BottomNav from './components/pixel/BottomNav';
import Home from './routes/Home';
import Calendar from './routes/Calendar';
import Analysis from './routes/Analysis';
import Settings from './routes/Settings';
import Login from './routes/Login';
import LoginCallback from './routes/LoginCallback';

export default function App() {
  return (
    <BrowserRouter>
      <div className="phone-frame-wrapper">
        <div className="phone-frame-bezel">
          <div className="phone-frame">
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/login/callback" element={<LoginCallback />} />
              <Route
                path="/"
                element={
                  <AuthGate>
                    <PageLayout>
                      <Home />
                    </PageLayout>
                  </AuthGate>
                }
              />
              <Route
                path="/calendar"
                element={
                  <AuthGate>
                    <PageLayout>
                      <Calendar />
                    </PageLayout>
                  </AuthGate>
                }
              />
              <Route
                path="/analysis"
                element={
                  <AuthGate>
                    <PageLayout>
                      <Analysis />
                    </PageLayout>
                  </AuthGate>
                }
              />
              <Route
                path="/settings"
                element={
                  <AuthGate>
                    <PageLayout>
                      <Settings />
                    </PageLayout>
                  </AuthGate>
                }
              />
            </Routes>
          </div>
        </div>
      </div>
    </BrowserRouter>
  );
}

/** 공통 레이아웃: 콘텐츠 + 하단 네비 */
function PageLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}
    >
      {children}
      <BottomNav />
    </div>
  );
}
