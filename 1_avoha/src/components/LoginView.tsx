import { useSohwakhaengStore } from "@/store/sohwakhaeng-store";

export default function LoginView() {
  const { setLoggedIn, userProfile } = useSohwakhaengStore();
  const userName = userProfile?.name ?? "사용자";

  return (
    <div className="h-full bg-surface flex flex-col overflow-hidden">
      <div className="flex-1 flex flex-col justify-end px-7 pb-12 animate-fade-slide-up">
        {/* Brand Mark */}
        <div className="flex-1 flex flex-col justify-center">
          <h1 className="font-serif text-[52px] leading-none font-bold text-on-surface mb-3">
            소확행
          </h1>
          <p className="text-on-surface-variant text-base leading-relaxed">
            {userName}님,
            <br />
            포착한 순간을 공유해주세요
          </p>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <button
            onClick={() => setLoggedIn(true)}
            className="w-full bg-on-surface text-surface py-4 rounded-2xl font-semibold text-[15px] active:scale-[0.98] transition-transform"
          >
            시작하기
          </button>
          <button
            onClick={() => setLoggedIn(true)}
            className="w-full text-on-surface-variant text-sm py-2 active:opacity-60"
          >
            게스트로 둘러보기
          </button>
        </div>
      </div>
    </div>
  );
}
