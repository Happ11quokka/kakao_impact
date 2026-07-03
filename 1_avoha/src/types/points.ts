export interface PointsTransaction {
  id: string;
  userId: string;
  amount: number;
  reason: string;
  recordId: string | null;
  createdAt: Date;
}
