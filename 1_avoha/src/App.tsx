import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { useSohwakhaengStore } from "@/store/sohwakhaeng-store";
import HomeMapView from "@/components/HomeMapView";
import CaptureView from "@/components/CaptureView";
import ChatbotView from "@/components/ChatbotView";
import InsightView from "@/components/InsightView";
import ProfileView from "@/components/ProfileView";
import OnboardingView from "@/components/OnboardingView";
import LoginView from "@/components/LoginView";
import HobbyRecommendationView from "@/components/HobbyRecommendationView";
import PointsCelebrationView from "@/components/PointsCelebrationView";

export default function App() {
  const { isOnboarded, isLoggedIn } = useSohwakhaengStore();

  if (!isOnboarded) return <OnboardingView />;
  if (!isLoggedIn) return <LoginView />;

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomeMapView />} />
          <Route path="/hobby" element={<HobbyRecommendationView />} />
          <Route path="/profile" element={<ProfileView />} />
        </Route>
        <Route path="/capture" element={<CaptureView />} />
        <Route path="/capture/chat" element={<ChatbotView />} />
        <Route path="/capture/insight" element={<InsightView />} />
        <Route path="/capture/points" element={<PointsCelebrationView />} />
      </Routes>
    </BrowserRouter>
  );
}
