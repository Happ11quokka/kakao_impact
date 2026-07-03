import { useNavigate } from "react-router-dom";
import { useSohwakhaengStore } from "@/store/sohwakhaeng-store";
import CelebrationParticles from "@/components/shared/CelebrationParticles";

export default function PointsCelebrationView() {
  const navigate = useNavigate();
  const { totalPoints, addPoints } = useSohwakhaengStore();

  const handleConfirm = () => {
    addPoints(10, "소확행 기록");
    navigate("/");
  };

  return (
    <div className="h-full bg-surface flex flex-col overflow-hidden">
      <CelebrationParticles />

      <main className="flex-1 flex flex-col items-center justify-center px-7">
        {/* Points display */}
        <div className="text-center animate-scale-pop">
          <span className="text-6xl font-bold text-tertiary tabular-nums">
            +10
          </span>
        </div>

        <p
          className="font-serif text-xl text-on-surface text-center mt-5 leading-snug animate-fade-slide-up"
          style={{ animationDelay: "0.2s" }}
        >
          오늘의 행복포인트가
          <br />
          적립됐어요
        </p>

        <span
          className="text-sm text-on-surface-variant mt-3 animate-fade-slide-up"
          style={{ animationDelay: "0.35s" }}
        >
          총 {(totalPoints + 10).toLocaleString()}P
        </span>
      </main>

      {/* Actions */}
      <div
        className="px-7 pb-12 space-y-3 animate-fade-slide-up"
        style={{ animationDelay: "0.5s" }}
      >
        <button
          onClick={handleConfirm}
          className="w-full bg-tertiary text-on-tertiary py-4 rounded-2xl font-semibold text-[15px] active:scale-[0.98] transition-transform"
        >
          적립하기
        </button>
        <button
          onClick={() => navigate("/")}
          className="w-full text-on-surface-variant text-sm py-2 active:opacity-60"
        >
          건너뛰기
        </button>
      </div>
    </div>
  );
}
