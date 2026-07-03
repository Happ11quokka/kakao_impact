export interface HobbyRecommendation {
  id: string;
  category: "music" | "activity" | "entertainment";
  title: string;
  subtitle: string;
  description: string;
  imageUrl: string;
  tags: string[];
  emotionMatch: string[];
}

export interface LocationRecallData {
  locationName: string;
  recordIds: string[];
  message: string;
  latitude: number;
  longitude: number;
}
