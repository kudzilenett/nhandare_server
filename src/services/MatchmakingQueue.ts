import { v4 as uuidv4 } from "uuid";

interface QueuePlayer {
  userId: string;
  ticketId: string;
  createdAt: number;
  resolve: (matchId: string, color: "white" | "black") => void;
}

class MatchmakingQueue {
  private static instance: MatchmakingQueue;
  private queues: Map<string, QueuePlayer[]> = new Map();

  private constructor() {}

  static getInstance(): MatchmakingQueue {
    if (!MatchmakingQueue.instance) {
      MatchmakingQueue.instance = new MatchmakingQueue();
    }
    return MatchmakingQueue.instance;
  }

  addPlayer(
    gameType: string,
    userId: string,
    resolver: QueuePlayer["resolve"]
  ): string {
    const ticketId = uuidv4();
    // Ensure no duplicate tickets for the same user
    this.removeDuplicates(gameType, userId);

    const player: QueuePlayer = {
      userId,
      ticketId,
      createdAt: Date.now(),
      resolve: resolver,
    };

    if (!this.queues.has(gameType)) {
      this.queues.set(gameType, []);
    }

    const queue = this.queues.get(gameType)!;
    queue.push(player);
    return ticketId;
  }

  popOpponent(gameType: string, excludingUserId: string): QueuePlayer | null {
    const queue = this.queues.get(gameType) || [];
    const index = queue.findIndex((p) => p.userId !== excludingUserId);
    if (index === -1) return null;
    const [player] = queue.splice(index, 1);
    return player;
  }

  removeByTicket(ticketId: string): void {
    for (const queue of this.queues.values()) {
      const idx = queue.findIndex((p) => p.ticketId === ticketId);
      if (idx !== -1) {
        queue.splice(idx, 1);
        break;
      }
    }
  }

  getQueueLength(gameType: string): number {
    return (this.queues.get(gameType) || []).length;
  }

  /**
   * Find a queued player for a specific game type
   */
  findPlayer(gameType: string, userId: string): QueuePlayer | null {
    const queue = this.queues.get(gameType) || [];
    return queue.find((p) => p.userId === userId) || null;
  }

  /**
   * Remove any existing queued entries for a user to avoid duplicates
   */
  removeDuplicates(gameType: string, userId: string): void {
    const queue = this.queues.get(gameType) || [];
    this.queues.set(
      gameType,
      queue.filter((p) => p.userId !== userId)
    );
  }
}

export default MatchmakingQueue.getInstance();
