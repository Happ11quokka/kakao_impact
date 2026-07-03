import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowUp } from "lucide-react";
import { mockChatScript, DEMO_CAPTURE_IMAGE } from "@/data/mock-data";
import { cn } from "@/lib/utils";

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-1 py-1">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-on-surface-variant/30 animate-typing-dot"
          style={{ animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </div>
  );
}

export default function ChatbotView() {
  const navigate = useNavigate();
  const [showQuestion, setShowQuestion] = useState(false);
  const [userText, setUserText] = useState("");
  const [skipHighlighted, setSkipHighlighted] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setShowQuestion(true), mockChatScript.typingDelayMs);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!showQuestion) return;
    const timer = setTimeout(() => setSkipHighlighted(true), 10000);
    return () => clearTimeout(timer);
  }, [showQuestion]);

  const handleSend = () => {
    if (!userText.trim() || isThinking) return;
    setIsThinking(true);
    setTimeout(() => navigate("/capture/insight"), mockChatScript.thinkingDelayMs);
  };

  const handleSkip = () => navigate("/capture/insight");

  return (
    <div className="h-full bg-surface flex flex-col overflow-hidden">
      {/* Top Bar */}
      <header
        className="fixed left-0 right-0 z-50 bg-surface/90 backdrop-blur-md"
        style={{ top: "var(--frame-inset-top)" }}
      >
        <div className="flex justify-between items-center px-5 py-3">
          <button
            onClick={() => navigate("/capture")}
            aria-label="뒤로가기"
            className="p-1 text-on-surface-variant active:scale-95 transition-transform"
          >
            <ArrowLeft size={22} />
          </button>
          <span className="text-sm font-semibold text-on-surface">소확행</span>
          <div className="w-8" />
        </div>
      </header>

      {/* Chat Content */}
      <main
        className="flex-grow pb-40 px-5 flex flex-col gap-4 overflow-y-auto"
        style={{ paddingTop: "calc(64px + var(--frame-inset-top))" }}
      >
        {/* Photo thumbnail */}
        <div className="w-14 h-14 rounded-xl overflow-hidden shadow-[var(--elevation-1)] mx-auto mt-2 animate-fade-slide-up">
          <img src={DEMO_CAPTURE_IMAGE} alt="캡처된 사진" className="w-full h-full object-cover" />
        </div>

        {/* AI Message */}
        <div
          className="flex flex-col gap-1.5 max-w-[85%] animate-fade-slide-up"
          style={{ animationDelay: "0.2s" }}
        >
          <span className="text-[11px] font-semibold text-on-surface-variant ml-1">소화</span>
          {!showQuestion ? (
            <div className="bg-surface-container rounded-2xl rounded-tl-lg p-3.5">
              <TypingIndicator />
            </div>
          ) : (
            <div className="bg-surface-container rounded-2xl rounded-tl-lg p-4">
              <p className="font-serif text-[15px] leading-relaxed text-on-surface whitespace-pre-line">
                {mockChatScript.aiQuestion}
              </p>
            </div>
          )}
        </div>

        {/* User bubble */}
        {isThinking && userText.trim() && (
          <div className="flex justify-end animate-fade-slide-up">
            <div className="bg-primary/8 rounded-2xl rounded-tr-lg px-4 py-3 max-w-[80%]">
              <p className="text-sm text-on-surface">{userText}</p>
            </div>
          </div>
        )}

        {/* AI thinking */}
        {isThinking && (
          <div className="flex flex-col gap-1.5 max-w-[85%] animate-fade-slide-up">
            <span className="text-[11px] font-semibold text-on-surface-variant ml-1">소화</span>
            <div className="bg-surface-container rounded-2xl rounded-tl-lg p-3.5">
              <TypingIndicator />
            </div>
          </div>
        )}

        <div className="flex-grow" />

        {showQuestion && !isThinking && (
          <p className="text-right text-on-surface-variant/40 text-xs pr-1">
            마음의 소리를 듣고 있어요...
          </p>
        )}
      </main>

      {/* Bottom Input */}
      <footer
        className="fixed left-0 right-0 z-50 bg-gradient-to-t from-surface via-surface to-transparent pt-6"
        style={{ bottom: "var(--frame-inset-bottom)" }}
      >
        <div className="px-5 pb-6 pt-2">
          <div className="flex justify-between items-center mb-3 px-0.5">
            <button
              onClick={handleSkip}
              className={cn(
                "text-xs transition-all",
                skipHighlighted
                  ? "text-primary font-semibold"
                  : "text-on-surface-variant/40"
              )}
            >
              건너뛰기
            </button>
            <button
              onClick={handleSend}
              disabled={!userText.trim() || isThinking}
              className="text-sm text-primary font-semibold disabled:opacity-20 transition-opacity"
            >
              완료
            </button>
          </div>

          <div className="relative flex items-center">
            <input
              ref={inputRef}
              className="w-full bg-surface-container rounded-2xl px-4 py-3 pr-12 text-sm text-on-surface placeholder:text-on-surface-variant/40 outline-none focus:ring-2 focus:ring-primary/10 transition-shadow"
              placeholder="작은 행복을 나눠주세요..."
              type="text"
              value={userText}
              onChange={(e) => setUserText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
              disabled={isThinking}
            />
            <button
              onClick={handleSend}
              disabled={!userText.trim() || isThinking}
              className="absolute right-1.5 w-8 h-8 rounded-xl bg-on-surface text-surface flex items-center justify-center active:scale-90 transition-transform disabled:opacity-20"
            >
              <ArrowUp size={16} />
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
