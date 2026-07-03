// === Inventory 화면 — 광물/스티커/챗봇 기록 보관함 ===
import { useEffect, useState } from 'react';
import { useInventoryStore } from '../stores/inventory-store';
import GemStone from '../components/pixel/GemStone';
import { getEmotion } from '../data/emotions';
import { TIER_NAMES, type GemTier } from '../types/gem';
import { FIELD_SKY, fieldPageChrome, useFieldTimePhase } from '../lib/field-time';
import { api, ApiError, type ChatbotRecordDto } from '../lib/api';

type Tab = 'gems' | 'stickers' | 'chatbot';

// 챗봇(Openbuilder) 원석명 → 내부 emotion code 매핑 (frontend/src/data/emotions.ts 기준).
const GEM_NAME_TO_EMOTION_CODE: Record<string, string> = {
  월장석: 'untroubled',
  아쿠아마린: 'serenity',
  황수정: 'pride',
  루비: 'joy',
  앰버: 'satisfaction',
  로즈쿼츠: 'flutter',
  사파이어: 'sadness',
  가넷: 'annoyance',
  연수정: 'regret',
  오팔: 'solace',
};

export default function Inventory() {
  const phase = useFieldTimePhase();
  const chrome = fieldPageChrome(phase);
  const [tab, setTab] = useState<Tab>('gems');
  const [selectedGemId, setSelectedGemId] = useState<string | null>(null);
  const { gems, stickers, fetchInventory } = useInventoryStore();

  const [chatbotRecords, setChatbotRecords] = useState<ChatbotRecordDto[]>([]);
  const [chatbotError, setChatbotError] = useState<string | null>(null);
  const [chatbotLoaded, setChatbotLoaded] = useState(false);

  useEffect(() => {
    fetchInventory();
    api
      .chatbotRecords()
      .then((res) => {
        setChatbotRecords(res.records);
        setChatbotError(null);
      })
      .catch((err) => {
        setChatbotError(
          err instanceof ApiError ? `${err.status} ${err.code}` : '챗봇 기록을 불러오지 못했어요',
        );
      })
      .finally(() => setChatbotLoaded(true));
  }, [fetchInventory]);

  const activeGems = gems.filter(g => !g.consumedAt);
  const selectedGem = activeGems.find(g => g.id === selectedGemId);

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative',
      background: FIELD_SKY[phase],
      transition: 'background 2s ease',
    }}>
      {/* 헤더 */}
      <div style={{ padding: '20px 16px 0', textAlign: 'center' }}>
        <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 700, color: chrome.title }}>
          인벤토리
        </h1>
      </div>

      {/* 탭 */}
      <div style={{ display: 'flex', margin: '16px 16px 0', borderRadius: 'var(--radius-md)', background: chrome.tabBg, padding: 3 }}>
        {(['gems', 'stickers', 'chatbot'] as Tab[]).map(t => {
          const label =
            t === 'gems'
              ? `🪨 광물 (${activeGems.length})`
              : t === 'stickers'
              ? `🖼️ 스티커 (${stickers.length})`
              : `💬 챗봇 (${chatbotRecords.length})`;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1,
                padding: '10px 0',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                background: tab === t ? chrome.tabActiveBg : 'transparent',
                color: tab === t ? chrome.tabActive : chrome.tabInactive,
                fontWeight: tab === t ? 700 : 400,
                fontSize: 13,
                cursor: 'pointer',
                transition: 'all var(--duration-fast) var(--easing-out)',
                boxShadow: tab === t ? 'var(--elevation-1)' : 'none',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* 콘텐츠 */}
      <div className="no-scrollbar" style={{ flex: 1, overflow: 'auto', padding: 16 }}>
        {tab === 'chatbot' ? (
          !chatbotLoaded ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: chrome.muted }}>
              <div className="animate-float" style={{ fontSize: 48, marginBottom: 12 }}>💬</div>
              <p style={{ fontSize: 14 }}>챗봇 기록 불러오는 중...</p>
            </div>
          ) : chatbotError ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: chrome.muted }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
              <p style={{ fontSize: 14, color: chrome.title }}>챗봇 기록 불러오기 실패</p>
              <p style={{ fontSize: 12, marginTop: 6 }}>{chatbotError}</p>
            </div>
          ) : chatbotRecords.length === 0 ? (
            <div className="animate-fade-slide-up" style={{ textAlign: 'center', padding: '60px 20px', color: chrome.muted }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🤖</div>
              <p style={{ fontSize: 16, fontWeight: 600, color: chrome.title }}>아직 챗봇 기록이 없어요</p>
              <p style={{ fontSize: 13, marginTop: 8 }}>
                카카오톡 닥토공방에서 일상을 보내면
                <br />
                여기에 차곡차곡 쌓여요 💎
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {chatbotRecords.map((rec, i) => {
                const emoCode = GEM_NAME_TO_EMOTION_CODE[rec.gem];
                const emotion = emoCode ? getEmotion(emoCode) : null;
                const dt = new Date(rec.createdAt);
                const dtStr = dt.toLocaleString('ko-KR', {
                  month: 'numeric',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                });
                return (
                  <div
                    key={rec.id}
                    className="animate-fade-slide-up"
                    style={{
                      animationDelay: `${i * 40}ms`,
                      display: 'flex',
                      gap: 12,
                      padding: 12,
                      borderRadius: 'var(--radius-md)',
                      background: chrome.card,
                      border: `2px solid ${emotion?.hexColor ?? '#E0D8CC'}`,
                      boxShadow: 'var(--elevation-1)',
                    }}
                  >
                    <div
                      style={{
                        width: 48,
                        height: 48,
                        flexShrink: 0,
                        borderRadius: 'var(--radius-sm)',
                        background: emotion?.hexColor ? `${emotion.hexColor}22` : '#F8F0E8',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 22,
                        border: `1px solid ${emotion?.hexColor ?? '#D8CCBA'}40`,
                      }}
                    >
                      {rec.hasPhoto && rec.imageUrl ? (
                        <img
                          src={rec.imageUrl}
                          alt="사진"
                          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'var(--radius-sm)' }}
                        />
                      ) : (
                        '💎'
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: chrome.title }}>
                          {rec.gem}
                        </span>
                        {emotion?.nameKo && (
                          <span style={{ fontSize: 11, color: chrome.cardTextMuted }}>
                            ({emotion.nameKo})
                          </span>
                        )}
                        <span style={{ fontSize: 10, color: chrome.cardTextMuted, marginLeft: 'auto' }}>
                          {dtStr}
                        </span>
                      </div>
                      {rec.recordText && (
                        <p
                          style={{
                            fontSize: 12,
                            color: chrome.cardTextMuted,
                            marginTop: 4,
                            lineHeight: 1.5,
                            wordBreak: 'break-word',
                          }}
                        >
                          {rec.recordText}
                        </p>
                      )}
                      {rec.aiGems && rec.aiGems !== rec.gem && (
                        <p style={{ fontSize: 10, color: chrome.cardTextMuted, marginTop: 4, opacity: 0.7 }}>
                          AI 초기 판단: {rec.aiGems}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : tab === 'gems' ? (
          activeGems.length === 0 ? (
            <div className="animate-fade-slide-up" style={{ textAlign: 'center', padding: '60px 20px', color: chrome.muted }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🌱</div>
              <p style={{ fontSize: 16, fontWeight: 600, color: chrome.title }}>아직 채집한 광물이 없어요</p>
              <p style={{ fontSize: 13, marginTop: 8 }}>카카오톡에서 일상을 보내면<br/>감정 광물이 여기에 쌓여요</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
              {activeGems.map((gem, i) => {
                const emotion = getEmotion(gem.emotionCode);
                return (
                  <div
                    key={gem.id}
                    className="animate-scale-pop"
                    onClick={() => setSelectedGemId(gem.id === selectedGemId ? null : gem.id)}
                    style={{
                      animationDelay: `${i * 50}ms`,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 6,
                      padding: 10,
                      borderRadius: 'var(--radius-md)',
                      background: chrome.card,
                      border: `2px solid ${gem.tier === 1 ? 'var(--color-tier-1)' : emotion?.hexColor || '#ccc'}`,
                      borderStyle: gem.tier === 1 ? 'dashed' : 'solid',
                      boxShadow: gem.tier >= 3 ? `0 0 12px ${emotion?.hexColor}40` : 'var(--elevation-1)',
                      cursor: 'pointer',
                      transition: 'transform var(--duration-fast) var(--easing-out)',
                    }}
                  >
                    <GemStone gem={gem} size={36} />
                    <span style={{ fontSize: 10, color: chrome.cardTextMuted, textAlign: 'center' }}>
                      {emotion?.nameKo}
                    </span>
                    <span style={{ fontSize: 9, color: chrome.cardTextMuted }}>
                      {TIER_NAMES[gem.tier as GemTier]}
                    </span>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          stickers.length === 0 ? (
            <div className="animate-fade-slide-up" style={{ textAlign: 'center', padding: '60px 20px', color: chrome.muted }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📸</div>
              <p style={{ fontSize: 16, fontWeight: 600, color: chrome.title }}>아직 스티커가 없어요</p>
              <p style={{ fontSize: 13, marginTop: 8 }}>카카오톡에서 사진을 보내면<br/>누끼 스티커가 만들어져요</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              {stickers.map((sticker, i) => (
                <div
                  key={sticker.id}
                  className="animate-scale-pop"
                  style={{
                    animationDelay: `${i * 80}ms`,
                    background: chrome.card,
                    borderRadius: 'var(--radius-md)',
                    padding: 10,
                    boxShadow: 'var(--elevation-2)',
                    textAlign: 'center',
                  }}
                >
                  {/* 폴라로이드 프레임 */}
                  <div
                    style={{
                      width: '100%',
                      aspectRatio: '1',
                      background: 'var(--color-surface-dim)',
                      borderRadius: 'var(--radius-sm)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 32,
                    }}
                  >
                    📸
                  </div>
                  <p style={{ fontSize: 11, color: chrome.cardTextMuted, marginTop: 8 }}>
                    {sticker.caption || '일상 스티커'}
                  </p>
                </div>
              ))}
            </div>
          )
        )}
      </div>

      {/* 바텀시트: 선택된 보석 히스토리 */}
      {selectedGem && (
        <div
          className="animate-slide-up"
          style={{
            position: 'absolute',
            bottom: 64,
            left: 0,
            right: 0,
            background: chrome.sheet,
            borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
            boxShadow: 'var(--elevation-3)',
            padding: '20px 16px',
            zIndex: 20,
          }}
        >
          <div style={{ width: 32, height: 4, background: 'var(--color-surface-dim)', borderRadius: 2, margin: '0 auto 16px' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <GemStone gem={selectedGem} size={48} />
            <div>
              <p style={{ fontWeight: 700, fontSize: 16 }}>
                {getEmotion(selectedGem.emotionCode)?.gemName} · {TIER_NAMES[selectedGem.tier as GemTier]}
              </p>
              <p style={{ color: 'var(--color-ink-muted)', fontSize: 13, marginTop: 4 }}>
                {selectedGem.sourceText || '카카오톡 메시지로 획득'}
              </p>
              <p style={{ color: 'var(--color-ink-muted)', fontSize: 11, marginTop: 4 }}>
                {new Date(selectedGem.createdAt).toLocaleString('ko-KR')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
