// === App — 라우팅 + 레이아웃 + AuthGate ===
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AuthGate from './components/AuthGate';
import BottomNav from './components/pixel/BottomNav';
import HomeField from './routes/HomeField';
import Inventory from './routes/Inventory';
import Workshop from './routes/Workshop';
import CollectionBook from './routes/CollectionBook';
import MyPage from './routes/MyPage';
import Login from './routes/Login';
import LoginCallback from './routes/LoginCallback';

export default function App() {
  return (
    <BrowserRouter>
      <div className="phone-frame-wrapper pixel-ui">
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
                      <HomeField />
                    </PageLayout>
                  </AuthGate>
                }
              />
              <Route
                path="/inventory"
                element={
                  <AuthGate>
                    <PageLayout>
                      <Inventory />
                    </PageLayout>
                  </AuthGate>
                }
              />
              <Route
                path="/workshop"
                element={
                  <AuthGate>
                    <PageLayout>
                      <Workshop />
                    </PageLayout>
                  </AuthGate>
                }
              />
              <Route
                path="/book"
                element={
                  <AuthGate>
                    <PageLayout>
                      <CollectionBook />
                    </PageLayout>
                  </AuthGate>
                }
              />
              <Route
                path="/me"
                element={
                  <AuthGate>
                    <PageLayout>
                      <MyPage />
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
      className="pixel-ui"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}
    >
      {children}
      <BottomNav />
    </div>
  );
}
