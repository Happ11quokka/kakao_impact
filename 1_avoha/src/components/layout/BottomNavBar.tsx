import { Link, useLocation } from "react-router-dom";
import { Map, Sparkles, User } from "lucide-react";
import { cn } from "@/lib/utils";

export function BottomNavBar() {
  const location = useLocation();
  const path = location.pathname;

  const items = [
    { to: "/", label: "홈", icon: Map },
    { to: "/hobby", label: "추천", icon: Sparkles },
    { to: "/profile", label: "프로필", icon: User },
  ];

  return (
    <nav
      aria-label="메인 네비게이션"
      className="fixed left-0 right-0 z-50 flex justify-around items-center px-6 pb-5 pt-2.5 bg-surface/90 backdrop-blur-md border-t border-outline-variant/40 safe-area-bottom"
      style={{ bottom: "var(--frame-inset-bottom)" }}
    >
      {items.map(({ to, label, icon: Icon }) => {
        const isActive = path === to;
        return (
          <Link
            key={to}
            to={to}
            aria-label={label}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex flex-col items-center justify-center px-5 py-1 active:scale-90 transition-all duration-200",
              isActive ? "text-on-surface" : "text-on-surface-variant/50"
            )}
          >
            <Icon
              size={21}
              strokeWidth={isActive ? 2.5 : 1.8}
            />
            <span className={cn(
              "text-[10px] mt-0.5",
              isActive ? "font-semibold" : "font-normal"
            )}>
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
