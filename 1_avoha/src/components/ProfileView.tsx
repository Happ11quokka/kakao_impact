import { Settings, Heart, MapPin, Calendar } from "lucide-react";
import { useSohwakhaengStore } from "@/store/sohwakhaeng-store";
import { mockWeeklySummary, mockRecords } from "@/data/mock-data";

export default function ProfileView() {
  const { userProfile, totalPoints } = useSohwakhaengStore();
  const userName = userProfile?.name ?? "사용자";
  const interests = userProfile?.interests ?? [];

  return (
    <main
      className="h-full overflow-y-auto pb-24 px-5"
      style={{ paddingTop: "calc(56px + var(--frame-inset-top))" }}
    >
      {/* Profile Header */}
      <section className="pt-4 mb-8 animate-fade-slide-up">
        <h2 className="text-2xl font-bold text-on-surface">{userName}님</h2>
        <p className="text-sm text-on-surface-variant mt-1">
          소소하지만 확실한 행복을 모으는 중
        </p>
      </section>

      {/* Points */}
      <section
        className="mb-6 animate-fade-slide-up"
        style={{ animationDelay: "0.05s" }}
      >
        <div className="bg-surface-container rounded-2xl p-5">
          <p className="text-xs font-medium text-on-surface-variant mb-1">
            행복포인트
          </p>
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold text-tertiary tabular-nums">
              {totalPoints.toLocaleString()}
            </span>
            <span className="text-sm text-on-surface-variant">P</span>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section
        className="grid grid-cols-3 gap-2.5 mb-6 animate-fade-slide-up"
        style={{ animationDelay: "0.1s" }}
      >
        <div className="bg-surface-container rounded-2xl p-4 text-center">
          <Heart size={16} className="text-primary mx-auto mb-2" />
          <p className="text-xl font-bold text-on-surface tabular-nums">
            {mockWeeklySummary.totalRecords}
          </p>
          <p className="text-[10px] text-on-surface-variant mt-0.5">기록</p>
        </div>
        <div className="bg-surface-container rounded-2xl p-4 text-center">
          <MapPin size={16} className="text-secondary mx-auto mb-2" />
          <p className="text-xl font-bold text-on-surface tabular-nums">
            {mockRecords.length}
          </p>
          <p className="text-[10px] text-on-surface-variant mt-0.5">장소</p>
        </div>
        <div className="bg-surface-container rounded-2xl p-4 text-center">
          <Calendar size={16} className="text-tertiary mx-auto mb-2" />
          <p className="text-xl font-bold text-on-surface tabular-nums">
            {mockWeeklySummary.streakDays}
          </p>
          <p className="text-[10px] text-on-surface-variant mt-0.5">연속</p>
        </div>
      </section>

      {/* Interests */}
      {interests.length > 0 && (
        <section
          className="mb-6 animate-fade-slide-up"
          style={{ animationDelay: "0.15s" }}
        >
          <h3 className="text-xs font-semibold text-on-surface-variant mb-2.5 tracking-wider">
            관심사
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {interests.map((tag) => (
              <span
                key={tag}
                className="px-3 py-1.5 rounded-lg bg-secondary/8 text-secondary text-xs font-medium"
              >
                {tag}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Emotion Keywords */}
      <section
        className="mb-6 animate-fade-slide-up"
        style={{ animationDelay: "0.2s" }}
      >
        <h3 className="text-xs font-semibold text-on-surface-variant mb-2.5 tracking-wider">
          감정 키워드
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {["편안함", "따뜻함", "여유", "행복", "감사", "평온함", "설렘", "안정감"].map((tag) => (
            <span
              key={tag}
              className="px-3 py-1.5 rounded-lg bg-primary/6 text-primary text-xs font-medium"
            >
              {tag}
            </span>
          ))}
        </div>
      </section>

      {/* Settings */}
      <section
        className="animate-fade-slide-up"
        style={{ animationDelay: "0.25s" }}
      >
        <button className="w-full flex items-center gap-3 p-4 rounded-2xl bg-surface-container active:bg-surface-container-high transition-colors">
          <Settings size={18} className="text-on-surface-variant" />
          <span className="text-sm text-on-surface">설정</span>
          <span className="ml-auto text-on-surface-variant text-[10px]">준비 중</span>
        </button>
      </section>
    </main>
  );
}
