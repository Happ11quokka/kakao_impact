import type { SohwakhaengRecord, RecordPin, RecentCard, UserProfile, PointsTransaction, HobbyRecommendation, LocationRecallData } from "@/types";

// === Image URLs (from demo CDN) ===
const IMAGES = {
  flower: "https://lh3.googleusercontent.com/aida-public/AB6AXuAfEY8sqZk1gRQmuaY8Dw60Ir-hmJq3AG7gnZoYtrmT4fmzg_cJWW9iz73kBgk2HBpbwpUx3bsWnmitn2had1aJlljeGVjiwPfUnm_KQfctp_xePJohwKHi5yEpI3yVW2UQhkYtJ5XjYMqMll83ffzT0ar4r75Akrj05-K-5lqPBGFUlyjkepjFDwBBnnTyqZUWbBJuxiDK9seHaEMX64wiGD9Fq7OWrO-Z5H--XFHexgkZQsKPe97X_Qm1dwC4w1b29DddTHeleMU",
  cafe: "https://lh3.googleusercontent.com/aida-public/AB6AXuCd0qn8svWsRsuT6DkG-9SOglqXxONGZ3DCRGMIMJ9GM2wy4y3wKZ2JO5MS4FgIJ5-ZImV9t6yvnCvXLUCTxg87aGTq0IjgWoufVj70dBLsgHtCVXLhAVDgfDUYkSSj32sSQaoa0zGML_jgXSVQ6ss5zXqWl2TafLsUgqpEOpzbt_GGm2bg48EmcQpeCrxIYQ4KiW5T5qjqub6t68Kg--9M9qR_flE9UEi_ebq7NyfV5UtPM6QoJ0VCYntgEJRqKgttb-yDcH7S08w",
  sunset: "https://lh3.googleusercontent.com/aida-public/AB6AXuDovZqhvyRC96WTu1C98VPbThsUUf8zmFjoEz43PwZWO21J2Kuw-908Br57h37KnCaePfSTbhsv8CGICjCc0uW4bQUHVjgqzwL5g95QKDCgfYIWy2ATncCGoStMsfzS_7kY6c1ZrwDkRAq1nLCrfrPsg1srLoXDUNFBhNNmC2K6vPAHLQXP0o2rau-Igg_YLc_H15Cs8mHp9VAnlLt0Hi2l8fZsQqQwNkOYEDK0Lb2ZzHx_Sz5tTNZm2HOF07Vt_3q3jYfP8zX7q-I",
  bakery: "https://lh3.googleusercontent.com/aida-public/AB6AXuA0RermcoxtQhygVJ9fMyThTSxH32mitksvevXXXYQd94eb41j_58BBi5C_-ZvKPRzq_iQjIWN40f7577ONYqUZoivYOmEgn88tvXl1nvLe2Pgr7Tbnuz-sc6XS3sWh9d-o3VBgkoE0omv_pDdzyWcuYkxA57Dm0m9cfnqZnIA6uvFJ4UfsY-fScw5s7TgE5nYBZefPNu_QahO1d2R_5iIgHU6ZWZeZhXj-pnIKZ9DHS3mc80ofXKppfG5LnkWFUwd_EYj4FMf4zfc",
  lake: "https://lh3.googleusercontent.com/aida-public/AB6AXuBC9exZPwO8faqNu0hwF3yg2hvieiFz77oxRNrxoQha66A2BhLc5R44kmSijgJgBZ_dWvcHeJn4_oKFANU53IFNa27Qqy2pcPdyLvXmYtQg3CaaxDyjoAq6ZJ-0tFBZgHpOSLdItkZsiAWZW42I4n7MiWsn2EnV4J1kEPzF9KGRaY5oWkT_og4b0XAvukGsKuOo6Ba0a24Tut1XP-EimVCoRmNFZnjZCqgdqSbQK7bvHnUNQlRXApivOKnsNb7GJLt_wQ1m_0yt6E4",
  coffee: "https://lh3.googleusercontent.com/aida-public/AB6AXuASdaluEhOIC3PWubVzzM1RHbGq3Ph10Xqw0uwAZiqAZT_Wj9qCh_s5sigzxFz27cQW-jC7tAyEH5O8l2zXIXGeNyQAxu3z3-pQPPEpnHVuJfq0EeEp33K4RphGb9NgY4SWWnkNY4nrI_XvVWx59AeDfxM1oMURjt3xUTRTrVea0vkCnmcW0dkvr9DNw6FQ56EkJUXzznu7TrpvnGlF9e-Y0ALYJ1MVx38RZmCQhoZUUspROF_zELUKHCTkxcmPcBwSEHKmg9HRr7U",
  coffeeCup: "https://lh3.googleusercontent.com/aida-public/AB6AXuAFpGdABzlKtI0ipij77_HoWEso_8Wl8CoXfMZbzm0Bf-tW8Fy5E1XbKGTVRmvIYIRtDsQdT3tU9PaKiO0WwGAUnSXF0bYV7_3gFgKV6JLZnwMfKvRAc483z0rEP-4hJf8Amxq4zOV_24QwL5OV9hmVttJwsOed1EqiH0PLOg4JPASQVHtPCu5LvnGpO70H6EffZJMgHnPClel6zEYsrnpMkjiZmwBPNgpIgI9X0CSB4GqYrMblm2u941UErw3hKlw6k7P3UDRtnsk",
};

// === Mock Records ===
export const mockRecords: SohwakhaengRecord[] = [
  {
    id: "rec-001",
    userId: "user-demo",
    imageUrl: IMAGES.flower,
    createdAt: new Date("2026-04-07T09:30:00"),
    latitude: 37.5665,
    longitude: 126.978,
    rawUserText: "산책하다가 발견한 작은 들꽃이 너무 예뻤어요",
    visionTags: ["꽃", "자연", "봄", "풀"],
    emotionTags: ["편안함", "감사"],
    contextKeywords: ["산책", "자연", "봄"],
    aiComment: "작은 꽃 한 송이에서 봄을 발견하는 마음, 그게 바로 소확행이에요.",
    skipFlag: false,
    emotionPolarity: "positive",
  },
  {
    id: "rec-002",
    userId: "user-demo",
    imageUrl: IMAGES.cafe,
    createdAt: new Date("2026-04-06T15:20:00"),
    latitude: 37.55,
    longitude: 126.99,
    rawUserText: "조용한 카페에서 혼자만의 시간을 보냈어요",
    visionTags: ["카페", "실내", "조용함"],
    emotionTags: ["여유", "평온함"],
    contextKeywords: ["카페", "휴식", "혼자"],
    aiComment: "나만의 시간을 온전히 즐기는 것, 그것만으로도 충분히 특별한 하루예요.",
    skipFlag: false,
    emotionPolarity: "positive",
  },
  {
    id: "rec-003",
    userId: "user-demo",
    imageUrl: IMAGES.sunset,
    createdAt: new Date("2026-04-05T18:45:00"),
    latitude: 37.57,
    longitude: 127.0,
    rawUserText: "퇴근길 노을이 정말 아름다웠어요",
    visionTags: ["노을", "하늘", "저녁", "도시"],
    emotionTags: ["행복", "감동"],
    contextKeywords: ["퇴근", "노을", "저녁"],
    aiComment: "바쁜 하루 끝에 만난 노을, 하늘이 건넨 작은 선물이네요.",
    skipFlag: false,
    emotionPolarity: "positive",
  },
  {
    id: "rec-004",
    userId: "user-demo",
    imageUrl: IMAGES.bakery,
    createdAt: new Date("2026-04-04T08:15:00"),
    latitude: 37.5445,
    longitude: 126.972,
    rawUserText: "아침 공기 속 갓 구운 빵 냄새, 완벽한 하루의 시작",
    visionTags: ["빵", "베이커리", "아침"],
    emotionTags: ["따뜻함", "설렘"],
    contextKeywords: ["아침", "빵", "베이커리"],
    aiComment: "따뜻한 빵 한 조각에 담긴 행복, 오늘 하루도 좋은 시작이에요.",
    skipFlag: false,
    emotionPolarity: "positive",
  },
  {
    id: "rec-005",
    userId: "user-demo",
    imageUrl: IMAGES.lake,
    createdAt: new Date("2026-04-03T16:30:00"),
    latitude: 37.5580,
    longitude: 126.985,
    rawUserText: "고요한 수면 위로 비치는 산 그림자, 완전한 평온",
    visionTags: ["호수", "산", "물", "자연"],
    emotionTags: ["평온함", "안정감"],
    contextKeywords: ["호수", "자연", "산책"],
    aiComment: "고요한 풍경 앞에서 마음도 함께 쉬어가는 시간이었네요.",
    skipFlag: false,
    emotionPolarity: "positive",
  },
  {
    id: "rec-006",
    userId: "user-demo",
    imageUrl: IMAGES.coffeeCup,
    createdAt: new Date("2026-04-02T14:00:00"),
    latitude: 37.5620,
    longitude: 126.995,
    rawUserText: "따뜻한 커피 한 잔과 함께하는 이 시간이 오늘의 가장 큰 행복",
    visionTags: ["커피", "카페", "음료"],
    emotionTags: ["따뜻함", "여유"],
    contextKeywords: ["커피", "카페", "오후"],
    aiComment: "잠시 멈춰 쉬는 시간도 충분히 소중한 행복이 될 수 있어요.",
    skipFlag: false,
    emotionPolarity: "positive",
  },
];

// === Mock Pins (derived from records) ===
export const mockPins: RecordPin[] = mockRecords
  .filter((r) => r.latitude !== null && r.longitude !== null)
  .map((r) => ({
    id: r.id,
    latitude: r.latitude!,
    longitude: r.longitude!,
    thumbnailUrl: r.imageUrl,
    emotionKeyword: r.emotionTags[0] ?? "기록됨",
    shortText: (r.rawUserText ?? r.aiComment ?? "").slice(0, 50),
  }));

// === Mock Recent Cards (latest 4) ===
export const mockRecentCards: RecentCard[] = mockRecords
  .slice(0, 4)
  .map((r) => ({
    id: r.id,
    imageUrl: r.imageUrl,
    emotionKeyword: r.emotionTags[0] ?? "기록됨",
    shortText: (r.rawUserText ?? r.aiComment ?? "").slice(0, 50),
    createdAt: r.createdAt,
  }));

// === Map Marker Data (extended for display) ===
export const mockMarkers = [
  {
    id: "rec-001",
    position: [37.5665, 126.978] as [number, number],
    imageUrl: IMAGES.flower,
    label: "들꽃",
    emoji: "🌿",
    tag: "편안함",
    colorClass: "bg-[#34D399]/15 text-[#059669]",
    delay: "0s",
  },
  {
    id: "rec-002",
    position: [37.55, 126.99] as [number, number],
    imageUrl: IMAGES.cafe,
    label: "조용한 카페",
    emoji: "☕",
    tag: "여유",
    colorClass: "bg-[#FFB347]/15 text-[#B45309]",
    delay: "1.5s",
  },
  {
    id: "rec-003",
    position: [37.57, 127.0] as [number, number],
    imageUrl: IMAGES.sunset,
    label: "노을 산책",
    emoji: "😊",
    tag: "행복",
    colorClass: "bg-[#A78BFA]/15 text-[#6D28D9]",
    delay: "0.8s",
  },
  {
    id: "rec-004",
    position: [37.5445, 126.972] as [number, number],
    imageUrl: IMAGES.bakery,
    label: "아침 베이커리",
    emoji: "🥐",
    tag: "따뜻함",
    colorClass: "bg-[#FFB347]/15 text-[#B45309]",
    delay: "0.4s",
  },
  {
    id: "rec-005",
    position: [37.558, 126.985] as [number, number],
    imageUrl: IMAGES.lake,
    label: "노을빛 호수",
    emoji: "✨",
    tag: "평온함",
    colorClass: "bg-[#60A5FA]/15 text-[#1D4ED8]",
    delay: "1.2s",
  },
];

// === Weekly Summary Data ===
export const mockWeeklySummary = {
  topTriggers: ["자연", "커피"],
  emotionFrequency: [
    { label: "자연", percentage: 42, colorClass: "bg-[#34D399]/15 text-[#059669]" },
    { label: "커피", percentage: 28, colorClass: "bg-[#FFB347]/15 text-[#B45309]" },
    { label: "독서", percentage: 15, colorClass: "bg-[#A78BFA]/15 text-[#6D28D9]" },
    { label: "산책", percentage: 10, colorClass: "bg-[#60A5FA]/15 text-[#1D4ED8]" },
    { label: "음악", percentage: 5, colorClass: "bg-[#F472B6]/15 text-[#BE185D]" },
  ],
  dailyAverage: 4.8,
  happinessIndexChange: 12,
  preferredTimeSlots: [
    { label: "아침", emoji: "🌅", percentage: 35 },
    { label: "오후", emoji: "☀️", percentage: 45, highlight: true },
    { label: "저녁", emoji: "🌆", percentage: 15 },
    { label: "밤", emoji: "🌙", percentage: 5 },
  ],
  frequentPlaces: [
    { name: "카페", size: "lg" },
    { name: "공원", size: "md" },
    { name: "산책로", size: "md" },
    { name: "서점", size: "sm" },
    { name: "집", size: "sm" },
  ],
  totalRecords: 23,
  streakDays: 7,
};

// === Chatbot Script ===
export const mockChatScript = {
  aiQuestion: "이 사진, 왠지 마음이 편안해 보여요.\n어떤 순간이었나요?",
  typingDelayMs: 1500,
  thinkingDelayMs: 1500,
};

// === Capture demo image ===
export const DEMO_CAPTURE_IMAGE = IMAGES.flower;

// === Insight demo data ===
export const mockInsightData = {
  imageUrl: IMAGES.flower,
  userText: "산책하다가 발견한 작은 들꽃이 너무 예뻤어요.",
  aiComment: "작은 꽃 한 송이에서 봄을 발견하는 마음, 그게 바로 소확행이에요.",
  emotionTags: [
    { label: "편안함", colorClass: "bg-[#2CB67D]/10 text-[#1A7A4E]" },
    { label: "감사", colorClass: "bg-[#9B7FE6]/10 text-[#5B3EB5]" },
    { label: "봄", colorClass: "bg-[#E86CA0]/10 text-[#A8316A]" },
  ],
};

// === User Profile ===
export const mockUserProfile: UserProfile = {
  id: "user-demo",
  name: "민서",
  interests: ["카페", "산책", "음악"],
  avatarUrl: null,
  joinedAt: new Date("2026-03-01"),
  totalPoints: 1250,
};

// === Onboarding Interests ===
export const mockOnboardingInterests = [
  "카페", "산책", "독서", "음악", "요리", "운동",
  "여행", "사진", "영화", "미술", "요가", "베이킹",
];

// === Points History ===
export const mockPointsHistory: PointsTransaction[] = [
  { id: "pt-001", userId: "user-demo", amount: 10, reason: "소확행 기록", recordId: "rec-001", createdAt: new Date("2026-04-07T09:30:00") },
  { id: "pt-002", userId: "user-demo", amount: 10, reason: "소확행 기록", recordId: "rec-002", createdAt: new Date("2026-04-06T15:20:00") },
  { id: "pt-003", userId: "user-demo", amount: 5, reason: "3일 연속 기록 보너스", recordId: null, createdAt: new Date("2026-04-05T18:45:00") },
  { id: "pt-004", userId: "user-demo", amount: 10, reason: "소확행 기록", recordId: "rec-003", createdAt: new Date("2026-04-05T18:45:00") },
  { id: "pt-005", userId: "user-demo", amount: 10, reason: "소확행 기록", recordId: "rec-004", createdAt: new Date("2026-04-04T08:15:00") },
  { id: "pt-006", userId: "user-demo", amount: 5, reason: "7일 연속 기록 보너스", recordId: null, createdAt: new Date("2026-04-03T16:30:00") },
];

// === Hobby Recommendations ===
export const mockHobbyRecommendations: HobbyRecommendation[] = [
  {
    id: "hobby-m1",
    category: "music",
    title: "실리카겔 - Desert Eagle",
    subtitle: "실리카겔을 좋아하는 민서님, 이런 음악은 어때요?",
    description: "몽환적인 사운드와 강렬한 비트가 어우러진 인디 록",
    imageUrl: IMAGES.sunset,
    tags: ["인디 록", "일렉트로닉"],
    emotionMatch: ["설렘", "행복"],
  },
  {
    id: "hobby-m2",
    category: "music",
    title: "잔나비 - 주저하는 연인들을 위해",
    subtitle: "편안한 감성의 노래를 추천해요",
    description: "따뜻한 멜로디와 위로가 되는 가사",
    imageUrl: IMAGES.cafe,
    tags: ["인디 팝", "발라드"],
    emotionMatch: ["편안함", "따뜻함"],
  },
  {
    id: "hobby-m3",
    category: "music",
    title: "혁오 - Wi ing Wi ing",
    subtitle: "여유로운 순간에 어울리는 음악",
    description: "리드미컬한 기타와 독특한 보컬의 조화",
    imageUrl: IMAGES.coffee,
    tags: ["인디 록", "얼터너티브"],
    emotionMatch: ["여유", "평온함"],
  },
  {
    id: "hobby-a1",
    category: "activity",
    title: "아침 요가",
    subtitle: "스트레스가 쌓이는 요즘, 요가를 통해 호흡해봐요",
    description: "15분 모닝 요가로 하루를 시작해보세요",
    imageUrl: IMAGES.lake,
    tags: ["운동", "명상"],
    emotionMatch: ["편안함", "평온함", "안정감"],
  },
  {
    id: "hobby-a2",
    category: "activity",
    title: "수채화 그리기",
    subtitle: "색으로 감정을 표현해보는 건 어때요?",
    description: "초보자도 쉽게 시작할 수 있는 수채화 클래스",
    imageUrl: IMAGES.flower,
    tags: ["미술", "창작"],
    emotionMatch: ["감사", "편안함"],
  },
  {
    id: "hobby-a3",
    category: "activity",
    title: "동네 베이커리 투어",
    subtitle: "새로운 빵집을 발견하는 즐거움",
    description: "숨겨진 동네 베이커리를 찾아 떠나보세요",
    imageUrl: IMAGES.bakery,
    tags: ["맛집", "산책"],
    emotionMatch: ["따뜻함", "설렘"],
  },
  {
    id: "hobby-e1",
    category: "entertainment",
    title: "뮤지컬 '디어 에반 핸슨'",
    subtitle: "감동적인 배우가 나오는 뮤지컬이에요!",
    description: "외로운 청소년의 성장 이야기를 담은 뮤지컬",
    imageUrl: IMAGES.sunset,
    tags: ["뮤지컬", "공연"],
    emotionMatch: ["감동", "행복"],
  },
  {
    id: "hobby-e2",
    category: "entertainment",
    title: "다큐멘터리 '마이 옥토퍼스 티처'",
    subtitle: "자연과 교감하는 따뜻한 다큐",
    description: "바다 속 문어와의 특별한 우정 이야기",
    imageUrl: IMAGES.lake,
    tags: ["다큐", "자연"],
    emotionMatch: ["편안함", "감사", "평온함"],
  },
  {
    id: "hobby-e3",
    category: "entertainment",
    title: "전시 '빛의 시어터'",
    subtitle: "빛과 음악이 만드는 몰입형 전시",
    description: "명화 속으로 들어가는 몰입형 미디어아트",
    imageUrl: IMAGES.flower,
    tags: ["전시", "미디어아트"],
    emotionMatch: ["설렘", "행복", "감동"],
  },
];

// === Location Recall Data ===
export const mockLocationRecalls: LocationRecallData[] = [
  {
    locationName: "광화문 근처",
    recordIds: ["rec-001", "rec-003"],
    message: "민서 님이 기록한 순간을 모아봤어요",
    latitude: 37.5665,
    longitude: 126.978,
  },
  {
    locationName: "을지로 카페거리",
    recordIds: ["rec-002", "rec-006"],
    message: "이 근처에서 행복한 순간을 보냈었어요",
    latitude: 37.55,
    longitude: 126.99,
  },
];
