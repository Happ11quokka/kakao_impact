import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSohwakhaengStore } from "@/store/sohwakhaeng-store";
import { mockOnboardingInterests } from "@/data/mock-data";
import type { OnboardingStep, UserProfile } from "@/types";

export default function OnboardingView() {
  const { setOnboarded, setUserProfile, onboardingStep, setOnboardingStep } =
    useSohwakhaengStore();

  const [name, setName] = useState("");
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);

  const toggleInterest = (interest: string) => {
    setSelectedInterests((prev) =>
      prev.includes(interest)
        ? prev.filter((i) => i !== interest)
        : [...prev, interest]
    );
  };

  const handleComplete = () => {
    const profile: UserProfile = {
      id: "user-demo",
      name: name || "익명",
      interests: selectedInterests,
      avatarUrl: null,
      joinedAt: new Date(),
      totalPoints: 0,
    };
    setUserProfile(profile);
    setOnboarded(true);
    setOnboardingStep("complete");
  };

  const goTo = (step: OnboardingStep) => setOnboardingStep(step);

  return (
    <div className="h-full bg-surface flex flex-col overflow-hidden">
      {/* Welcome */}
      {onboardingStep === "welcome" && (
        <div className="flex-1 flex flex-col px-7 animate-fade-slide-up">
          <div className="flex-1 flex flex-col justify-center">
            <p className="text-xs font-medium text-on-surface-variant tracking-widest uppercase mb-6">
              Small but certain happiness
            </p>
            <h1 className="font-serif text-[42px] leading-[1.15] font-bold text-on-surface mb-4">
              소확행
            </h1>
            <p className="text-base text-on-surface-variant leading-relaxed max-w-[260px]">
              작은 순간도 놓치지 않고
              <br />
              기록하는 나만의 행복 아카이브
            </p>
          </div>

          <div className="pb-12">
            <button
              onClick={() => goTo("name")}
              className="w-full bg-on-surface text-surface py-4 rounded-2xl font-semibold text-[15px] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
            >
              시작하기
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Name Input */}
      {onboardingStep === "name" && (
        <div className="flex-1 flex flex-col px-7 animate-slide-left">
          <div className="pt-20">
            <span className="text-xs font-medium text-primary tracking-wider">
              01
            </span>
            <h2 className="text-2xl font-bold text-on-surface mt-2 mb-1">
              이름을 알려주세요
            </h2>
            <p className="text-sm text-on-surface-variant">
              앱에서 부를 이름이에요
            </p>
          </div>

          <div className="mt-10">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름"
              className="w-full bg-transparent border-b-2 border-outline-variant pb-3 text-xl text-on-surface placeholder:text-outline-variant focus:outline-none focus:border-primary transition-colors"
              autoFocus
            />
          </div>

          <div className="mt-auto pb-12">
            <button
              onClick={() => goTo("interests")}
              disabled={!name.trim()}
              className={cn(
                "w-full py-4 rounded-2xl font-semibold text-[15px] flex items-center justify-center gap-2 transition-all",
                name.trim()
                  ? "bg-on-surface text-surface active:scale-[0.98]"
                  : "bg-surface-container-high text-on-surface-variant/30 cursor-not-allowed"
              )}
            >
              다음
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Interest Selection */}
      {onboardingStep === "interests" && (
        <div className="flex-1 flex flex-col px-7 animate-slide-left">
          <div className="pt-20">
            <span className="text-xs font-medium text-primary tracking-wider">
              02
            </span>
            <h2 className="text-2xl font-bold text-on-surface mt-2 mb-1">
              관심사를 골라주세요
            </h2>
            <p className="text-sm text-on-surface-variant">
              {name}님에게 맞는 추천을 해드릴게요
            </p>
          </div>

          <div className="flex flex-wrap gap-2.5 mt-8">
            {mockOnboardingInterests.map((interest) => {
              const isSelected = selectedInterests.includes(interest);
              return (
                <button
                  key={interest}
                  onClick={() => toggleInterest(interest)}
                  className={cn(
                    "px-4 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-95",
                    isSelected
                      ? "bg-on-surface text-surface"
                      : "bg-surface-container text-on-surface-variant"
                  )}
                >
                  {isSelected && <Check size={13} className="inline mr-1 -mt-0.5" />}
                  {interest}
                </button>
              );
            })}
          </div>

          <div className="mt-auto pb-12">
            <button
              onClick={handleComplete}
              disabled={selectedInterests.length === 0}
              className={cn(
                "w-full py-4 rounded-2xl font-semibold text-[15px] flex items-center justify-center gap-2 transition-all",
                selectedInterests.length > 0
                  ? "bg-primary text-on-primary active:scale-[0.98]"
                  : "bg-surface-container-high text-on-surface-variant/30 cursor-not-allowed"
              )}
            >
              완료
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
