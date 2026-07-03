import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { mockInsightData } from "@/data/mock-data";
import CelebrationParticles from "@/components/shared/CelebrationParticles";

export default function InsightView() {
  const navigate = useNavigate();

  return (
    <div className="h-full bg-surface overflow-auto">
      <CelebrationParticles />

      {/* Top Bar */}
      <header
        className="fixed left-0 right-0 z-50 bg-surface/90 backdrop-blur-md"
        style={{ top: "var(--frame-inset-top)" }}
      >
        <div className="flex justify-center items-center px-5 py-3">
          <span className="text-sm font-semibold text-on-surface">인사이트</span>
        </div>
      </header>

      <main
        className="px-5 pb-8"
        style={{ paddingTop: "calc(56px + var(--frame-inset-top))" }}
      >
        {/* Photo + User Text */}
        <section className="animate-fade-slide-up">
          <div className="relative">
            <div className="overflow-hidden rounded-2xl aspect-[4/5] shadow-[var(--elevation-2)]">
              <img
                alt="기록된 사진"
                className="w-full h-full object-cover"
                src={mockInsightData.imageUrl}
              />
            </div>
            <div className="absolute -bottom-4 right-4 left-8 bg-surface-container-lowest p-4 rounded-xl shadow-[var(--elevation-1)]">
              <p className="text-on-surface font-serif text-sm leading-relaxed line-clamp-3">
                "{mockInsightData.userText}"
              </p>
            </div>
          </div>
        </section>

        {/* AI Comment */}
        <section
          className="mt-10 animate-fade-slide-up"
          style={{ animationDelay: "0.2s" }}
        >
          <p className="text-xs font-semibold text-on-surface-variant mb-3 tracking-wider">
            AI 코멘트
          </p>
          <blockquote className="font-serif text-xl leading-snug text-on-surface">
            {mockInsightData.aiComment}
          </blockquote>

          <div className="flex flex-wrap gap-1.5 mt-4">
            {mockInsightData.emotionTags.map(({ label, colorClass }) => (
              <span
                key={label}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium ${colorClass}`}
              >
                {label}
              </span>
            ))}
          </div>
        </section>

        {/* Save Button */}
        <section
          className="mt-10 animate-fade-slide-up"
          style={{ animationDelay: "0.4s" }}
        >
          <button
            onClick={() => navigate("/capture/points")}
            aria-label="행복포인트 적립하기"
            className="w-full bg-on-surface text-surface py-4 rounded-2xl font-semibold text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            저장하고 포인트 받기
            <ArrowRight size={18} />
          </button>
        </section>
      </main>
    </div>
  );
}
