import { Link } from "react-router-dom";
import { Camera, ArrowRight } from "lucide-react";
import { useSohwakhaengStore } from "@/store/sohwakhaeng-store";

export default function HobbyRecommendationView() {
  const { hobbyRecommendations, userProfile, records } = useSohwakhaengStore();
  const userName = userProfile?.name ?? "사용자";

  const musicRecs = hobbyRecommendations.filter((r) => r.category === "music");
  const activityRecs = hobbyRecommendations.filter((r) => r.category === "activity");
  const entertainmentRecs = hobbyRecommendations.filter((r) => r.category === "entertainment");

  const userEmotionTags = [...new Set(records.flatMap((r) => r.emotionTags))];

  return (
    <div
      className="h-full overflow-auto pb-28"
      style={{ paddingTop: "calc(56px + var(--frame-inset-top))" }}
    >
      <div className="px-5">
        {/* Hero */}
        <section className="mb-8 animate-fade-slide-up">
          <h2 className="text-2xl font-bold text-on-surface leading-snug">
            {userName}님을 위한
            <br />
            <span className="text-primary">추천</span>
          </h2>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {userEmotionTags.slice(0, 5).map((tag) => (
              <span
                key={tag}
                className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-surface-container text-on-surface-variant"
              >
                {tag}
              </span>
            ))}
          </div>
        </section>

        {/* Record Prompt */}
        <section
          className="mb-8 animate-fade-slide-up"
          style={{ animationDelay: "0.1s" }}
        >
          <Link
            to="/capture"
            className="flex items-center justify-between bg-surface-container rounded-2xl p-4 active:scale-[0.98] transition-transform"
          >
            <div>
              <p className="text-sm font-semibold text-on-surface">
                새로운 순간을 기록해볼까요?
              </p>
              <p className="text-xs text-on-surface-variant mt-0.5">
                오늘의 소확행을 포착하세요
              </p>
            </div>
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center flex-shrink-0">
              <Camera className="text-on-primary" size={18} />
            </div>
          </Link>
        </section>

        {/* Music */}
        <section
          className="mb-8 animate-fade-slide-up"
          style={{ animationDelay: "0.15s" }}
        >
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-base font-bold text-on-surface">음악</h3>
            <span className="text-xs text-on-surface-variant">더보기</span>
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-5 px-5 pb-1">
            {musicRecs.map((rec) => (
              <div
                key={rec.id}
                className="flex-shrink-0 w-40 rounded-2xl overflow-hidden bg-surface-container-lowest shadow-[var(--elevation-1)]"
              >
                <div className="aspect-square overflow-hidden">
                  <img
                    src={rec.imageUrl}
                    alt={rec.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-3">
                  <p className="text-sm font-medium text-on-surface line-clamp-1">
                    {rec.title}
                  </p>
                  <p className="text-[11px] text-on-surface-variant mt-0.5 line-clamp-2 leading-relaxed">
                    {rec.subtitle}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Activities */}
        <section
          className="mb-8 animate-fade-slide-up"
          style={{ animationDelay: "0.2s" }}
        >
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-base font-bold text-on-surface">활동</h3>
          </div>
          <div className="space-y-2.5">
            {activityRecs.map((rec) => (
              <div
                key={rec.id}
                className="flex items-center gap-3.5 bg-surface-container-lowest rounded-2xl p-3 shadow-[var(--elevation-1)]"
              >
                <div className="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0">
                  <img
                    src={rec.imageUrl}
                    alt={rec.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-on-surface">{rec.title}</p>
                  <p className="text-[11px] text-on-surface-variant mt-0.5 line-clamp-1">
                    {rec.subtitle}
                  </p>
                </div>
                <ArrowRight size={16} className="text-on-surface-variant/40 flex-shrink-0" />
              </div>
            ))}
          </div>
        </section>

        {/* Entertainment */}
        <section
          className="mb-8 animate-fade-slide-up"
          style={{ animationDelay: "0.25s" }}
        >
          <div className="flex items-baseline justify-between mb-3">
            <h3 className="text-base font-bold text-on-surface">공연 & 전시</h3>
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-5 px-5 pb-1">
            {entertainmentRecs.map((rec) => (
              <div
                key={rec.id}
                className="flex-shrink-0 w-48 rounded-2xl overflow-hidden bg-surface-container-lowest shadow-[var(--elevation-1)]"
              >
                <div className="aspect-[16/10] overflow-hidden">
                  <img
                    src={rec.imageUrl}
                    alt={rec.title}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-3">
                  <p className="text-sm font-medium text-on-surface line-clamp-1">
                    {rec.title}
                  </p>
                  <p className="text-[11px] text-on-surface-variant mt-0.5 line-clamp-2 leading-relaxed">
                    {rec.subtitle}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
