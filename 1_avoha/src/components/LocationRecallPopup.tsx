import { X, MapPin, ChevronRight } from "lucide-react";
import { useSohwakhaengStore } from "@/store/sohwakhaeng-store";

export default function LocationRecallPopup() {
  const {
    activeLocationRecall,
    setLocationRecallVisible,
    records,
    setSelectedRecord,
  } = useSohwakhaengStore();

  if (!activeLocationRecall) return null;

  const matchedRecords = records.filter((r) =>
    activeLocationRecall.recordIds.includes(r.id)
  );

  const handleViewDetail = (recordId: string) => {
    const record = records.find((r) => r.id === recordId);
    if (record) {
      setSelectedRecord(record);
      setLocationRecallVisible(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 bg-on-surface/20 z-[800]"
        onClick={() => setLocationRecallVisible(false)}
      />

      <div
        className="fixed left-0 right-0 z-[810] animate-slide-up"
        style={{ bottom: "var(--frame-inset-bottom)" }}
      >
        <div className="bg-surface rounded-t-2xl shadow-[var(--elevation-3)] px-5 pt-3 pb-8 max-h-[50vh] overflow-auto">
          {/* Handle */}
          <div className="flex justify-center mb-3">
            <div className="w-9 h-1 rounded-full bg-outline-variant" />
          </div>

          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-on-surface">
                {activeLocationRecall.message}
              </p>
              <div className="flex items-center gap-1 mt-1">
                <MapPin size={11} className="text-primary" />
                <span className="text-xs text-on-surface-variant">
                  {activeLocationRecall.locationName}
                </span>
              </div>
            </div>
            <button
              onClick={() => setLocationRecallVisible(false)}
              className="p-1 text-on-surface-variant active:scale-90 transition-transform"
            >
              <X size={18} />
            </button>
          </div>

          {/* Record Cards */}
          <div className="space-y-2">
            {matchedRecords.map((record) => (
              <button
                key={record.id}
                onClick={() => handleViewDetail(record.id)}
                className="w-full flex items-center gap-3 bg-surface-container rounded-xl p-3 active:scale-[0.98] transition-transform text-left"
              >
                <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
                  <img
                    src={record.imageUrl}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-on-surface line-clamp-1">
                    {record.rawUserText ?? record.aiComment}
                  </p>
                  <div className="flex gap-1 mt-1">
                    {record.emotionTags.slice(0, 2).map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded text-[10px] bg-primary/6 text-primary"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <ChevronRight size={14} className="text-on-surface-variant/40 flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
