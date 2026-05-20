// === App — 라우팅 + 레이아웃 + AuthGate (3탭: 캘린더/홈/설정) ===
import { useEffect, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AuthGate from './components/AuthGate';
import RequireOpsUser from './components/RequireOpsUser';
import BottomNav from './components/pixel/BottomNav';
import PageTracker from './lib/page-tracker';
import { subscribeInventory } from './lib/sse';
import Home from './routes/Home';
import Calendar from './routes/Calendar';
import Analysis from './routes/Analysis';
import OpsAnalytics from './routes/OpsAnalytics';
import Settings from './routes/Settings';
import Login from './routes/Login';
import LoginCallback from './routes/LoginCallback';
import { useInventoryStore } from './stores/inventory-store';
import { useRecordsStore } from './stores/records-store';

export default function App() {
  return (
    <BrowserRouter>
      <PageTracker />
      <Routes>
        {/* 운영자 대시보드는 phone-frame 밖, full viewport 데스크탑 레이아웃 */}
        <Route
          path="/ops/analytics"
          element={
            <RequireOpsUser>
              <OpsAnalytics />
            </RequireOpsUser>
          }
        />
        {/* 그 외 모든 라우트는 모바일 phone-frame 안에 */}
        <Route path="/*" element={<PhoneFrame />} />
      </Routes>
    </BrowserRouter>
  );
}

function PhoneFrame() {
  return (
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
  );
}

/** 공통 레이아웃: 콘텐츠 + 하단 네비 */
function PageLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}
    >
      <DataSync />
      {children}
      <BottomNav />
    </div>
  );
}

function DataSync() {
  useEffect(() => {
    return subscribeInventory({
      onEvent: (ev) => {
        if (ev.type === 'ping') return;
        if (ev.type === 'gem_added' || ev.type === 'sticker_added') {
          void useInventoryStore.getState().fetchInventory();
        }
        if (ev.type === 'record_updated') {
          void useRecordsStore.getState().fetchRecords();
          void useInventoryStore.getState().fetchInventory();
        }
      },
    });
  }, []);

  return null;
}
