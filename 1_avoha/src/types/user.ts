export interface UserProfile {
  id: string;
  name: string;
  interests: string[];
  avatarUrl: string | null;
  joinedAt: Date;
  totalPoints: number;
}

export type OnboardingStep = "welcome" | "name" | "interests" | "complete";
