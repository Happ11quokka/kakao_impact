import type { SohwakhaengRecord } from "@/types";
import { X, MapPin } from "lucide-react";

const EMOTION_COLORS: Record<string, string> = {
  편안함: "bg-[#2CB67D]/10 text-[#1A7A4E]",
  감사: "bg-[#9B7FE6]/10 text-[#5B3EB5]",
  여유: "bg-[#E8A838]/10 text-[#8F5A00]",
  평온함: "bg-[#5294E2]/10 text-[#1D5BA6]",
  행복: "bg-[#E86CA0]/10 text-[#A8316A]",
  감동: "bg-[#9B7FE6]/10 text-[#5B3EB5]",
  따뜻함: "bg-[#E8A838]/10 text-[#8F5A00]",
  설렘: "bg-[#E86CA0]/10 text-[#A8316A]",
  안정감: "bg-[#5294E2]/10 text-[#1D5BA6]",
};

export function RecordDetailSheet({
  record,
  onClose,
}: {
  record: SohwakhaengRecord;
  onClose: () => void;
}) {
  const dateStr = record.createdAt.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <>
      <div
        className="fixed inset-0 bg-on-surface/20 z-[60]"
        onClick={onClose}
      />

      <div
        className="fixed left-0 right-0 z-[70] bg-surface rounded-t-2xl max-h-[80vh] overflow-y-auto animate-slide-up safe-area-bottom"
        style={{ bottom: "var(--frame-inset-bottom)" }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="w-9 h-1 rounded-full bg-outline-variant" />
        </div>

        <div className="flex justify-end px-5">
          <button
            onClick={onClose}
            aria-label="닫기"
            className="p-1 text-on-surface-variant active:scale-95 transition-transform"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-5 pb-6 space-y-4">
          {/* Photo */}
          <div className="aspect-[4/5] rounded-2xl overflow-hidden">
            <img
              src={record.imageUrl}
              alt={record.rawUserText ?? "기록 사진"}
              className="w-full h-full object-cover"
            />
          </div>

          {/* Metadata */}
          <div className="flex items-center gap-1.5 text-on-surface-variant">
            <MapPin size={12} className="text-primary" />
            <span className="text-xs">{record.contextKeywords.join(" · ")}</span>
            <span className="text-[10px] ml-auto tabular-nums">{dateStr}</span>
          </div>

          {/* User Text */}
          {record.rawUserText && (
            <p className="font-serif text-base leading-relaxed text-on-surface">
              "{record.rawUserText}"
            </p>
          )}

          {/* Emotion Tags */}
          <div className="flex flex-wrap gap-1.5">
            {record.emotionTags.map((tag) => (
              <span
                key={tag}
                className={`px-3 py-1 rounded-lg text-xs font-medium ${EMOTION_COLORS[tag] ?? "bg-surface-container text-on-surface-variant"}`}
              >
                {tag}
              </span>
            ))}
          </div>

          {/* AI Comment */}
          {record.aiComment && (
            <div className="bg-surface-container rounded-xl p-4">
              <p className="text-xs font-semibold text-on-surface-variant mb-2 tracking-wider">
                AI 코멘트
              </p>
              <p className="font-serif text-sm leading-relaxed text-on-surface">
                {record.aiComment}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
