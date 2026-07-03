import { Sparkles, TrendingUp, Flame } from "lucide-react";
import { mockWeeklySummary } from "@/data/mock-data";

export default function SummaryView() {
  const summary = mockWeeklySummary;

  return (
    <main className="h-full overflow-y-auto pb-20 px-4 space-y-8">
      {/* Weekly Headline */}
      <section className="space-y-4 animate-fade-slide-up pt-2">
        <h2 className="font-serif text-2xl text-on-surface leading-tight">
          이번 주 행복 트리거는{" "}
          <span className="text-primary italic underline underline-offset-4 decoration-primary/20">
            [{summary.topTriggers[0]}]
          </span>
          과{" "}
          <span className="text-primary italic underline underline-offset-4 decoration-primary/20">
            [{summary.topTriggers[1]}]
          </span>
        </h2>

        {/* Emotion Cloud */}
        <div className="bg-surface-container rounded-2xl p-5 min-h-[200px] relative">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] tracking-widest text-on-surface-variant font-medium">
              감정 빈도
            </span>
            <Sparkles className="text-primary" size={16} />
          </div>

          <div className="relative h-[160px]">
            {summary.emotionFrequency.map((item, i) => {
              const positions = [
                "top-2 left-2",
                "bottom-6 right-4",
                "top-1/2 left-1/4",
                "bottom-2 left-6",
                "top-8 right-2",
              ];
              const sizes = [
                "text-sm px-4 py-2",
                "text-xs px-3.5 py-1.5",
                "text-xs px-3 py-1.5",
                "text-[10px] px-3 py-1",
                "text-[10px] px-2.5 py-1",
              ];
              return (
                <div
                  key={item.label}
                  className={`absolute ${positions[i]} ${item.colorClass} ${sizes[i]} rounded-full font-medium shadow-sm animate-float`}
                  style={{ animationDelay: `${i * 0.4}s` }}
                >
                  {item.label} {item.percentage}%
                </div>
              );
            })}
          </div>
        </div>

        {/* Daily Average */}
        <div className="bg-surface-container rounded-2xl p-5">
          <span className="text-[10px] tracking-widest text-on-surface-variant font-medium">
            일일 평균
          </span>
          <div className="flex items-baseline gap-1 mt-2 animate-count-up">
            <span className="text-4xl font-serif text-primary">
              {summary.dailyAverage}
            </span>
            <span className="text-on-surface-variant text-sm">/ 5</span>
          </div>
          <div className="mt-3 space-y-1.5">
            <div
              className="h-1.5 w-full bg-outline-variant/20 rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={92}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="h-full bg-gradient-to-r from-primary to-[#FF8E8E] w-[92%] rounded-full animate-progress" />
            </div>
            <div className="flex items-center gap-1 text-[10px] text-on-surface-variant">
              <TrendingUp size={10} className="text-secondary" />
              평소보다 {summary.happinessIndexChange}% 높은 행복 지수
            </div>
          </div>
        </div>
      </section>

      {/* Time Slots */}
      <section className="space-y-3 animate-fade-slide-up" style={{ animationDelay: "0.2s" }}>
        <h3 className="font-serif text-lg text-on-surface">선호 시간대</h3>
        <div className="grid grid-cols-4 gap-2">
          {summary.preferredTimeSlots.map((slot) => (
            <div
              key={slot.label}
              className={`rounded-2xl p-3 text-center space-y-1 ${
                slot.highlight
                  ? "bg-primary/10 border border-primary/20"
                  : "bg-surface-container"
              }`}
            >
              <span className="text-2xl">{slot.emoji}</span>
              <p className={`text-[11px] font-medium ${slot.highlight ? "text-primary" : "text-on-surface"}`}>
                {slot.label}
              </p>
              <p className={`text-[10px] ${slot.highlight ? "text-primary" : "text-on-surface-variant"}`}>
                {slot.percentage}%
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Places */}
      <section className="space-y-3 animate-fade-slide-up" style={{ animationDelay: "0.3s" }}>
        <h3 className="font-serif text-lg text-on-surface">자주 찾는 장소</h3>
        <div className="flex flex-wrap gap-2">
          {summary.frequentPlaces.map((place) => {
            const sizeClass =
              place.size === "lg"
                ? "px-4 py-2 text-sm bg-primary/10 text-primary"
                : place.size === "md"
                  ? "px-3.5 py-1.5 text-xs bg-secondary/10 text-secondary"
                  : "px-3 py-1.5 text-[11px] bg-surface-container-high text-on-surface-variant";
            return (
              <span key={place.name} className={`rounded-full font-medium ${sizeClass}`}>
                {place.name}
              </span>
            );
          })}
        </div>
      </section>

      {/* Streak */}
      <section className="animate-fade-slide-up" style={{ animationDelay: "0.4s" }}>
        <div className="bg-gradient-to-r from-primary to-[#FF8E8E] rounded-2xl p-5 text-white flex items-center gap-4">
          <Flame size={32} />
          <div>
            <p className="text-lg font-bold">{summary.streakDays}일 연속 기록 중!</p>
            <p className="text-white/80 text-xs mt-0.5">
              총 {summary.totalRecords}개의 소확행을 기록했어요
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
