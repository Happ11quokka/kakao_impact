import { Bell } from "lucide-react";
import { useSohwakhaengStore } from "@/store/sohwakhaeng-store";

export function TopAppBar() {
  const { totalPoints } = useSohwakhaengStore();

  return (
    <header
      className="fixed left-0 right-0 z-50 bg-surface/90 backdrop-blur-md"
      style={{ top: "var(--frame-inset-top)" }}
    >
      <div className="flex justify-between items-center px-5 py-3">
        <h1 className="font-serif text-xl font-bold text-on-surface tracking-tight">
          소확행
        </h1>
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-tertiary tabular-nums">
            {totalPoints.toLocaleString()}P
          </span>
          <button
            aria-label="알림"
            className="p-1 text-on-surface-variant active:scale-95 transition-transform"
          >
            <Bell size={20} />
          </button>
        </div>
      </div>
    </header>
  );
}
