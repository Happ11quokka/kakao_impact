// === App — 라우팅 + 레이아웃 ===
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import BottomNav from './components/pixel/BottomNav';
import HomeField from './routes/HomeField';
import Inventory from './routes/Inventory';
import Workshop from './routes/Workshop';
import CollectionBook from './routes/CollectionBook';
import MyPage from './routes/MyPage';
import LoginCallback from './routes/LoginCallback';

export default function App() {
  return (
    <BrowserRouter>
      <div className="phone-frame-wrapper pixel-ui">
        <div className="phone-frame-bezel">
          <div className="phone-frame">
            <Routes>
              <Route path="/" element={<PageLayout><HomeField /></PageLayout>} />
              <Route path="/inventory" element={<PageLayout><Inventory /></PageLayout>} />
              <Route path="/workshop" element={<PageLayout><Workshop /></PageLayout>} />
              <Route path="/book" element={<PageLayout><CollectionBook /></PageLayout>} />
              <Route path="/me" element={<PageLayout><MyPage /></PageLayout>} />
              <Route path="/login/callback" element={<LoginCallback />} />
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
    <div className="pixel-ui" style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative' }}>
      {children}
      <BottomNav />
    </div>
  );
}
