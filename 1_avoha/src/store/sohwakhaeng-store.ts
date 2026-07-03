import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  ConversationState,
  ConversationContext,
  RecordPin,
  RecentCard,
  SohwakhaengRecord,
  UserProfile,
  OnboardingStep,
  PointsTransaction,
  HobbyRecommendation,
  LocationRecallData,
} from "@/types";
import { ConversationStateManager } from "@/services/conversation-state-manager";
import {
  mockPins,
  mockRecentCards,
  mockRecords,
  mockWeeklySummary,
  mockUserProfile,
  mockPointsHistory,
  mockHobbyRecommendations,
} from "@/data/mock-data";

interface SohwakhaengStore {
  // FSM
  fsm: ConversationStateManager;
  conversationState: ConversationState;
  context: ConversationContext;
  resetFsm: () => void;
  dispatchEvent: (event: Parameters<ConversationStateManager["transition"]>[0]) => void;

  // Auth & Onboarding
  isOnboarded: boolean;
  isLoggedIn: boolean;
  userProfile: UserProfile | null;
  onboardingStep: OnboardingStep;
  setOnboarded: (v: boolean) => void;
  setLoggedIn: (v: boolean) => void;
  setUserProfile: (p: UserProfile) => void;
  setOnboardingStep: (s: OnboardingStep) => void;

  // Points
  totalPoints: number;
  pointsHistory: PointsTransaction[];
  showPointsCelebration: boolean;
  addPoints: (amount: number, reason: string, recordId?: string) => void;
  setShowPointsCelebration: (v: boolean) => void;

  // Recommendations
  hobbyRecommendations: HobbyRecommendation[];

  // Location recall
  locationRecallVisible: boolean;
  activeLocationRecall: LocationRecallData | null;
  setLocationRecallVisible: (v: boolean) => void;
  triggerLocationRecall: (data: LocationRecallData) => void;

  // Map data
  recordPins: RecordPin[];
  recentCards: RecentCard[];
  records: SohwakhaengRecord[];
  setRecordPins: (pins: RecordPin[]) => void;
  setRecentCards: (cards: RecentCard[]) => void;

  // Bottom sheet
  selectedRecord: SohwakhaengRecord | null;
  setSelectedRecord: (r: SohwakhaengRecord | null) => void;

  // Weekly summary
  weeklySummary: typeof mockWeeklySummary;

  // UI state
  skipHighlighted: boolean;
  setSkipHighlighted: (v: boolean) => void;
  isAiThinking: boolean;
  setIsAiThinking: (v: boolean) => void;
  loading: boolean;
  setLoading: (v: boolean) => void;
  error: string | null;
  setError: (e: string | null) => void;
}

export const useSohwakhaengStore = create<SohwakhaengStore>()(
  persist(
    (set) => {
      const fsm = new ConversationStateManager();
      return {
        fsm,
        conversationState: fsm.getCurrentState(),
        context: fsm.getContext(),
        resetFsm: () => {
          const newFsm = new ConversationStateManager();
          set({
            fsm: newFsm,
            conversationState: newFsm.getCurrentState(),
            context: newFsm.getContext(),
            skipHighlighted: false,
            isAiThinking: false,
            error: null,
          });
        },
        dispatchEvent: (event) =>
          set((state) => {
            const newState = state.fsm.transition(event);
            return {
              conversationState: newState,
              context: state.fsm.getContext(),
            };
          }),

        // Auth & Onboarding
        isOnboarded: false,
        isLoggedIn: false,
        userProfile: null,
        onboardingStep: "welcome" as OnboardingStep,
        setOnboarded: (v) => set({ isOnboarded: v }),
        setLoggedIn: (v) => set({ isLoggedIn: v }),
        setUserProfile: (p) => set({ userProfile: p }),
        setOnboardingStep: (s) => set({ onboardingStep: s }),

        // Points
        totalPoints: mockUserProfile.totalPoints,
        pointsHistory: mockPointsHistory,
        showPointsCelebration: false,
        addPoints: (amount, reason, recordId) =>
          set((state) => ({
            totalPoints: state.totalPoints + amount,
            pointsHistory: [
              {
                id: `pt-${Date.now()}`,
                userId: "user-demo",
                amount,
                reason,
                recordId: recordId ?? null,
                createdAt: new Date(),
              },
              ...state.pointsHistory,
            ],
            showPointsCelebration: true,
          })),
        setShowPointsCelebration: (v) => set({ showPointsCelebration: v }),

        // Recommendations
        hobbyRecommendations: mockHobbyRecommendations,

        // Location recall
        locationRecallVisible: false,
        activeLocationRecall: null,
        setLocationRecallVisible: (v) => set({ locationRecallVisible: v }),
        triggerLocationRecall: (data) =>
          set({ locationRecallVisible: true, activeLocationRecall: data }),

        // Pre-populated with mock data
        recordPins: mockPins,
        recentCards: mockRecentCards,
        records: mockRecords,
        setRecordPins: (pins) => set({ recordPins: pins }),
        setRecentCards: (cards) => set({ recentCards: cards }),

        // Bottom sheet
        selectedRecord: null,
        setSelectedRecord: (r) => set({ selectedRecord: r }),

        // Weekly summary
        weeklySummary: mockWeeklySummary,

        // UI state
        skipHighlighted: false,
        setSkipHighlighted: (v) => set({ skipHighlighted: v }),
        isAiThinking: false,
        setIsAiThinking: (v) => set({ isAiThinking: v }),
        loading: false,
        setLoading: (v) => set({ loading: v }),
        error: null,
        setError: (e) => set({ error: e }),
      };
    },
    {
      name: "sohwakhaeng-storage",
      partialize: (state) => ({
        isOnboarded: state.isOnboarded,
        isLoggedIn: state.isLoggedIn,
        userProfile: state.userProfile,
        totalPoints: state.totalPoints,
      }),
    }
  )
);
