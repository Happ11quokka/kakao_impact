import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ImagePlus, MessageCircle } from "lucide-react";
import { DEMO_CAPTURE_IMAGE, mockInsightData } from "@/data/mock-data";

const EMOTION_BG: Record<string, string> = {
  편안함: "bg-[#2CB67D]/10 border-[#2CB67D]/20 text-[#1A7A4E]",
  감사: "bg-[#2CB67D]/10 border-[#2CB67D]/20 text-[#1A7A4E]",
  행복: "bg-[#E86CA0]/10 border-[#E86CA0]/20 text-[#A8316A]",
  설렘: "bg-[#E86CA0]/10 border-[#E86CA0]/20 text-[#A8316A]",
  따뜻함: "bg-[#E8A838]/10 border-[#E8A838]/20 text-[#8F5A00]",
  여유: "bg-[#E8A838]/10 border-[#E8A838]/20 text-[#8F5A00]",
  평온함: "bg-[#5294E2]/10 border-[#5294E2]/20 text-[#1D5BA6]",
  안정감: "bg-[#5294E2]/10 border-[#5294E2]/20 text-[#1D5BA6]",
};

function getToastStyle() {
  const firstTag = mockInsightData.emotionTags[0]?.label ?? "편안함";
  return EMOTION_BG[firstTag] ?? EMOTION_BG["편안함"];
}

export default function CaptureView() {
  const navigate = useNavigate();
  const [photo, setPhoto] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [toast, setToast] = useState<"visible" | "hiding" | null>(null);

  const handleAddPhoto = () => setPhoto(DEMO_CAPTURE_IMAGE);

  const handleSave = () => {
    setToast("visible");
  };

  // Toast lifecycle: visible 2.5s → hiding 0.3s → navigate
  useEffect(() => {
    if (toast === "visible") {
      const t = setTimeout(() => setToast("hiding"), 2500);
      return () => clearTimeout(t);
    }
    if (toast === "hiding") {
      const t = setTimeout(() => navigate("/capture/points"), 300);
      return () => clearTimeout(t);
    }
  }, [toast, navigate]);

  const toastStyle = getToastStyle();

  return (
    <div className="h-full bg-surface flex flex-col overflow-auto">
      {/* Top Bar */}
      <header
        className="fixed left-0 right-0 z-50 bg-surface/90 backdrop-blur-md"
        style={{ top: "var(--frame-inset-top)" }}
      >
        <div className="flex justify-between items-center px-5 py-3">
          <button
            onClick={() => navigate("/")}
            aria-label="뒤로가기"
            className="p-1 text-on-surface-variant active:scale-95 transition-transform"
          >
            <ArrowLeft size={22} />
          </button>
          <span className="text-sm font-semibold text-on-surface">순간 포착</span>
          <div className="w-8" />
        </div>
      </header>

      {/* AI Toast */}
      {toast && (
        <div
          className="fixed left-4 right-4 z-[100]"
          style={{ top: "calc(56px + var(--frame-inset-top) + 8px)" }}
        >
          <div
            className={`rounded-2xl border p-4 shadow-[var(--elevation-2)] ${toastStyle} ${
              toast === "visible" ? "animate-slide-down" : "animate-slide-down-out"
            }`}
          >
            <p className="font-serif text-sm leading-relaxed">
              {mockInsightData.aiComment}
            </p>
            <div className="flex gap-1.5 mt-2">
              {mockInsightData.emotionTags.slice(0, 2).map(({ label }) => (
                <span
                  key={label}
                  className="text-[10px] font-semibold opacity-70"
                >
                  #{label}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <main
        className="flex-grow pb-8 px-5 flex flex-col"
        style={{ paddingTop: "calc(64px + var(--frame-inset-top))" }}
      >
        {!photo ? (
          /* Empty state */
          <section className="flex-1 flex flex-col items-center justify-center animate-fade-slide-up">
            <button
              onClick={handleAddPhoto}
              className="w-full aspect-[4/5] rounded-2xl border-2 border-dashed border-outline-variant flex flex-col items-center justify-center gap-4 active:scale-[0.98] active:border-primary transition-all"
            >
              <div className="w-16 h-16 rounded-2xl bg-surface-container flex items-center justify-center">
                <ImagePlus size={28} className="text-on-surface-variant" />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-on-surface">사진 추가하기</p>
                <p className="text-xs text-on-surface-variant mt-1">
                  오늘의 소확행을 포착해보세요
                </p>
              </div>
            </button>
          </section>
        ) : (
          /* Photo added */
          <>
            <section className="animate-fade-slide-up">
              <div className="aspect-[3/4] rounded-2xl overflow-hidden shadow-[var(--elevation-2)]">
                <img
                  alt="포착한 순간"
                  className="w-full h-full object-cover"
                  src={photo}
                />
              </div>
            </section>

            {/* Comment input */}
            <section
              className="mt-5 animate-fade-slide-up"
              style={{ animationDelay: "0.1s" }}
            >
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="이 순간을 기록해보세요"
                rows={2}
                className="w-full bg-surface-container rounded-2xl px-4 py-3 text-sm text-on-surface placeholder:text-on-surface-variant/40 outline-none focus:ring-2 focus:ring-primary/10 resize-none transition-shadow"
              />
            </section>

            {/* Actions */}
            <section
              className="mt-4 flex flex-col gap-3 animate-fade-slide-up"
              style={{ animationDelay: "0.2s" }}
            >
              <button
                onClick={handleSave}
                disabled={toast !== null}
                className="w-full bg-on-surface text-surface py-3.5 rounded-2xl font-semibold text-[15px] active:scale-[0.98] transition-transform disabled:opacity-50"
              >
                저장하기
              </button>
              <button
                onClick={() => navigate("/capture/chat")}
                className="flex items-center justify-center gap-1.5 text-on-surface-variant text-sm py-1 active:text-primary transition-colors"
              >
                <MessageCircle size={14} />
                소화와 대화하기
              </button>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
