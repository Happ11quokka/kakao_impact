import { Outlet } from "react-router-dom";
import { TopAppBar } from "./TopAppBar";
import { BottomNavBar } from "./BottomNavBar";

export function Layout() {
  return (
    <div className="h-full flex flex-col bg-surface text-on-surface overflow-hidden">
      <TopAppBar />
      <div className="flex-grow flex flex-col relative overflow-hidden" style={{ paddingTop: "calc(56px + var(--frame-inset-top))" }}>
        <Outlet />
      </div>
      <BottomNavBar />
    </div>
  );
}
