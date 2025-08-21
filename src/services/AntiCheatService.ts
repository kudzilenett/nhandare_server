import { prisma } from "../config/database";
import { Match, GameSession, User } from "@prisma/client";

export interface CheatDetectionResult {
  userId: string;
  matchId: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  suspiciousPatterns: string[];
  confidence: number; // 0-1
  recommendations: string[];
  timestamp: Date;
}

export interface MoveAnalysis {
  moveNumber: number;
  timestamp: Date;
  timeTaken: number; // milliseconds
  moveComplexity: number; // 1-10 scale
  isSuspicious: boolean;
  reason?: string;
}

export interface PlayerBehavior {
  userId: string;
  averageMoveTime: number;
  moveTimeVariance: number;
  suspiciousMoves: number;
  totalMoves: number;
  riskScore: number; // 0-100
}

export class AntiCheatService {
  // Thresholds for suspicious behavior detection
  static THRESHOLDS = {
    // Move timing thresholds (milliseconds)
    SUSPICIOUS_MOVE_TIME: 500, // Move completed too quickly
    IMPOSSIBLE_MOVE_TIME: 100, // Physically impossible speed
    UNUSUAL_PATTERN_TIME: 2000, // Unusual timing pattern

    // Move complexity thresholds
    MIN_COMPLEXITY_FOR_TIME: 3, // Minimum complexity for suspicious timing

    // Risk scoring thresholds
    HIGH_RISK_SCORE: 70, // Score above which to flag
    CRITICAL_RISK_SCORE: 90, // Score above which to investigate

    // Pattern detection thresholds
    MIN_SUSPICIOUS_MOVES: 3, // Minimum suspicious moves to flag
    MIN_MATCHES_FOR_ANALYSIS: 5, // Minimum matches for player analysis
  };

  /**
   * Analyze a match for potential cheating
   */
  static async analyzeMatch(matchId: string): Promise<CheatDetectionResult[]> {
    const match = await prisma.match.findUnique({
      where: { id: matchId },
      include: {
        player1: true,
        player2: true,
      },
    });

    if (!match) {
      throw new Error("Match not found");
    }

    // Get game session separately
    const gameSession = await prisma.gameSession.findFirst({
      where: { matchId },
    });

    if (!gameSession) {
      throw new Error("Game session not found");
    }

    const results: CheatDetectionResult[] = [];

    // Analyze both players
    const player1Analysis = await this.analyzePlayerInMatch(
      match.player1Id,
      matchId,
      gameSession
    );

    const player2Analysis = await this.analyzePlayerInMatch(
      match.player2Id,
      matchId,
      gameSession
    );

    if (player1Analysis) results.push(player1Analysis);
    if (player2Analysis) results.push(player2Analysis);

    return results;
  }

  /**
   * Analyze a specific player's behavior in a match
   */
  private static async analyzePlayerInMatch(
    userId: string,
    matchId: string,
    gameSession: GameSession
  ): Promise<CheatDetectionResult | null> {
    // Get move history for this player
    const moves = await this.getPlayerMoves(userId, matchId, gameSession);

    if (moves.length === 0) return null;

    // Analyze move timing and patterns
    const moveAnalysis = this.analyzeMoveTiming(moves);
    const patternAnalysis = this.analyzeMovePatterns(moves);
    const statisticalAnalysis = await this.analyzePlayerStatistics(
      userId,
      matchId
    );

    // Calculate overall risk score
    const riskScore = this.calculateRiskScore(
      moveAnalysis,
      patternAnalysis,
      await statisticalAnalysis
    );

    // Determine risk level
    const riskLevel = this.determineRiskLevel(riskScore);

    // Collect suspicious patterns
    const resolvedStatisticalAnalysis = await statisticalAnalysis;
    const suspiciousPatterns = this.collectSuspiciousPatterns(
      moveAnalysis,
      patternAnalysis,
      resolvedStatisticalAnalysis
    );

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      riskLevel,
      suspiciousPatterns
    );

    // Only return result if there are suspicious patterns
    if (suspiciousPatterns.length === 0) return null;

    return {
      userId,
      matchId,
      riskLevel,
      suspiciousPatterns,
      confidence: this.calculateConfidence(suspiciousPatterns, riskScore),
      recommendations,
      timestamp: new Date(),
    };
  }

  /**
   * Get player moves from game session
   */
  private static async getPlayerMoves(
    userId: string,
    matchId: string,
    gameSession: GameSession
  ): Promise<MoveAnalysis[]> {
    // Parse game session data to extract moves
    const gameData = gameSession.gameState as any;

    if (!gameData || !gameData.moves) return [];

    const moves: MoveAnalysis[] = [];
    const playerMoves = gameData.moves.filter(
      (move: any) => move.playerId === userId
    );

    for (let i = 0; i < playerMoves.length; i++) {
      const move = playerMoves[i];
      const nextMove = playerMoves[i + 1];

      // Calculate time taken for this move
      const timeTaken = nextMove
        ? new Date(nextMove.timestamp).getTime() -
          new Date(move.timestamp).getTime()
        : 0;

      // Analyze move complexity
      const moveComplexity = this.analyzeMoveComplexity(
        move,
        gameData.gameState
      );

      // Determine if move is suspicious
      const isSuspicious = this.isMoveSuspicious(timeTaken, moveComplexity);

      moves.push({
        moveNumber: i + 1,
        timestamp: new Date(move.timestamp),
        timeTaken,
        moveComplexity,
        isSuspicious,
        reason: isSuspicious
          ? this.getSuspiciousReason(timeTaken, moveComplexity)
          : undefined,
      });
    }

    return moves;
  }

  /**
   * Analyze move timing patterns
   */
  private static analyzeMoveTiming(moves: MoveAnalysis[]): {
    averageTime: number;
    variance: number;
    suspiciousMoves: number;
    patterns: string[];
  } {
    if (moves.length === 0) {
      return { averageTime: 0, variance: 0, suspiciousMoves: 0, patterns: [] };
    }

    const times = moves.map((m) => m.timeTaken);
    const averageTime =
      times.reduce((sum, time) => sum + time, 0) / times.length;

    // Calculate variance
    const variance =
      times.reduce((sum, time) => sum + Math.pow(time - averageTime, 2), 0) /
      times.length;

    // Count suspicious moves
    const suspiciousMoves = moves.filter((m) => m.isSuspicious).length;

    // Detect timing patterns
    const patterns = this.detectTimingPatterns(moves);

    return {
      averageTime,
      variance,
      suspiciousMoves,
      patterns,
    };
  }

  /**
   * Analyze move patterns for suspicious behavior
   */
  private static analyzeMovePatterns(moves: MoveAnalysis[]): {
    patterns: string[];
    consistency: number;
    anomalies: number;
  } {
    const patterns: string[] = [];
    let consistency = 0;
    let anomalies = 0;

    // Check for consistent move timing (too perfect)
    const moveTimes = moves.map((m) => m.timeTaken);
    const timeVariance = this.calculateVariance(moveTimes);

    if (timeVariance < 100 && moveTimes.length > 5) {
      patterns.push("Unusually consistent move timing");
      anomalies++;
    }

    // Check for alternating fast/slow moves
    let alternatingPatterns = 0;
    for (let i = 1; i < moves.length - 1; i++) {
      const current = moves[i].timeTaken;
      const previous = moves[i - 1].timeTaken;
      const next = moves[i + 1].timeTaken;

      if (
        (current < previous && current < next) ||
        (current > previous && current > next)
      ) {
        alternatingPatterns++;
      }
    }

    if (alternatingPatterns > moves.length * 0.6) {
      patterns.push("Suspicious alternating move timing pattern");
      anomalies++;
    }

    // Check for moves that are too fast for their complexity
    const complexFastMoves = moves.filter(
      (m) =>
        m.moveComplexity >= this.THRESHOLDS.MIN_COMPLEXITY_FOR_TIME &&
        m.timeTaken < this.THRESHOLDS.SUSPICIOUS_MOVE_TIME
    ).length;

    if (complexFastMoves > 0) {
      patterns.push(
        `${complexFastMoves} complex moves completed suspiciously fast`
      );
      anomalies++;
    }

    // Calculate consistency score
    consistency = Math.max(0, 100 - anomalies * 20);

    return { patterns, consistency, anomalies };
  }

  /**
   * Analyze player's historical statistics
   */
  private static async analyzePlayerStatistics(
    userId: string,
    matchId: string
  ): Promise<{
    historicalAverage: number;
    improvementRate: number;
    consistency: number;
    anomalies: number;
  }> {
    // Get player's recent matches
    const recentMatches = await prisma.match.findMany({
      where: {
        OR: [{ player1Id: userId }, { player2Id: userId }],
        status: "COMPLETED",
        id: { not: matchId },
      },
      orderBy: { finishedAt: "desc" },
      take: 10,
    });

    if (recentMatches.length < 3) {
      return {
        historicalAverage: 0,
        improvementRate: 0,
        consistency: 100,
        anomalies: 0,
      };
    }

    // Calculate historical performance metrics
    const performanceMetrics = await Promise.all(
      recentMatches.map(async (match) => {
        const gameSession = await prisma.gameSession.findFirst({
          where: { matchId: match.id },
        });

        if (!gameSession) return null;

        const moves = await this.getPlayerMoves(userId, match.id, gameSession);
        return moves.length > 0
          ? moves.reduce((sum, m) => sum + m.timeTaken, 0) / moves.length
          : 0;
      })
    );

    const validMetrics = performanceMetrics.filter(
      (m) => m !== null
    ) as number[];

    if (validMetrics.length === 0) {
      return {
        historicalAverage: 0,
        improvementRate: 0,
        consistency: 100,
        anomalies: 0,
      };
    }

    const historicalAverage =
      validMetrics.reduce((sum, m) => sum + m, 0) / validMetrics.length;

    // Calculate improvement rate (negative = improving)
    const improvementRate =
      validMetrics[validMetrics.length - 1] - validMetrics[0];

    // Calculate consistency
    const variance = this.calculateVariance(validMetrics);
    const consistency = Math.max(0, 100 - variance / 1000);

    // Count anomalies (significant deviations from average)
    const anomalies = validMetrics.filter(
      (m) => Math.abs(m - historicalAverage) > historicalAverage * 0.5
    ).length;

    return {
      historicalAverage,
      improvementRate,
      consistency,
      anomalies,
    };
  }

  /**
   * Calculate overall risk score
   */
  private static calculateRiskScore(
    moveAnalysis: ReturnType<typeof this.analyzeMoveTiming>,
    patternAnalysis: ReturnType<typeof this.analyzeMovePatterns>,
    statisticalAnalysis: Awaited<
      ReturnType<typeof this.analyzePlayerStatistics>
    >
  ): number {
    let riskScore = 0;

    // Move timing analysis (40% weight)
    if (moveAnalysis.suspiciousMoves > 0) {
      riskScore +=
        (moveAnalysis.suspiciousMoves / moveAnalysis.averageTime) * 20;
    }

    if (moveAnalysis.variance < 100) {
      riskScore += 15; // Too consistent
    }

    // Pattern analysis (35% weight)
    riskScore += (100 - patternAnalysis.consistency) * 0.35;
    riskScore += patternAnalysis.anomalies * 10;

    // Statistical analysis (25% weight)
    if (statisticalAnalysis.anomalies > 0) {
      riskScore += statisticalAnalysis.anomalies * 8;
    }

    if (statisticalAnalysis.consistency < 50) {
      riskScore += 20;
    }

    // Cap at 100
    return Math.min(100, Math.max(0, riskScore));
  }

  /**
   * Determine risk level based on score
   */
  private static determineRiskLevel(
    riskScore: number
  ): "low" | "medium" | "high" | "critical" {
    if (riskScore >= this.THRESHOLDS.CRITICAL_RISK_SCORE) return "critical";
    if (riskScore >= this.THRESHOLDS.HIGH_RISK_SCORE) return "high";
    if (riskScore >= 40) return "medium";
    return "low";
  }

  /**
   * Collect all suspicious patterns
   */
  private static collectSuspiciousPatterns(
    moveAnalysis: ReturnType<typeof this.analyzeMoveTiming>,
    patternAnalysis: ReturnType<typeof this.analyzeMovePatterns>,
    statisticalAnalysis: Awaited<
      ReturnType<typeof this.analyzePlayerStatistics>
    >
  ): string[] {
    const patterns: string[] = [];

    // Add move timing patterns
    patterns.push(...moveAnalysis.patterns);

    // Add move pattern analysis
    patterns.push(...patternAnalysis.patterns);

    // Add statistical anomalies
    if (statisticalAnalysis.anomalies > 0) {
      patterns.push(
        `${statisticalAnalysis.anomalies} statistical anomalies detected`
      );
    }

    if (statisticalAnalysis.consistency < 50) {
      patterns.push("Inconsistent historical performance");
    }

    return patterns;
  }

  /**
   * Generate recommendations based on risk level
   */
  private static generateRecommendations(
    riskLevel: string,
    patterns: string[]
  ): string[] {
    const recommendations: string[] = [];

    switch (riskLevel) {
      case "critical":
        recommendations.push("Immediate match suspension recommended");
        recommendations.push("Require manual review by tournament officials");
        recommendations.push("Consider temporary account suspension");
        break;

      case "high":
        recommendations.push("Flag for manual review");
        recommendations.push("Monitor future matches closely");
        recommendations.push("Consider additional verification");
        break;

      case "medium":
        recommendations.push("Monitor player behavior");
        recommendations.push("Flag for review if pattern continues");
        break;

      case "low":
        recommendations.push("Continue monitoring");
        recommendations.push("No immediate action required");
        break;
    }

    // Add pattern-specific recommendations
    if (patterns.some((p) => p.includes("timing"))) {
      recommendations.push("Investigate move timing patterns");
    }

    if (patterns.some((p) => p.includes("complex"))) {
      recommendations.push("Review complex move execution");
    }

    return recommendations;
  }

  /**
   * Calculate confidence in detection
   */
  private static calculateConfidence(
    patterns: string[],
    riskScore: number
  ): number {
    // Base confidence on number of patterns and risk score
    let confidence = Math.min(
      0.9,
      patterns.length * 0.2 + (riskScore / 100) * 0.5
    );

    // Higher confidence for more specific patterns
    if (patterns.some((p) => p.includes("impossible"))) {
      confidence = Math.min(1, confidence + 0.2);
    }

    if (patterns.some((p) => p.includes("consistent"))) {
      confidence = Math.min(1, confidence + 0.15);
    }

    return Math.round(confidence * 100) / 100;
  }

  /**
   * Analyze move complexity
   */
  private static analyzeMoveComplexity(move: any, gameState: any): number {
    // This is a simplified complexity analysis
    // In a real implementation, this would analyze the actual game logic

    // Factors that increase complexity:
    let complexity = 1;

    if (move.involvesCalculation) complexity += 2;
    if (move.involvesStrategy) complexity += 2;
    if (move.involvesMultiplePieces) complexity += 1;
    if (move.involvesSacrifice) complexity += 3;
    if (move.involvesEndgame) complexity += 1;

    return Math.min(10, complexity);
  }

  /**
   * Check if a move is suspicious
   */
  private static isMoveSuspicious(
    timeTaken: number,
    complexity: number
  ): boolean {
    // Move is suspicious if it's too fast for its complexity
    if (
      complexity >= this.THRESHOLDS.MIN_COMPLEXITY_FOR_TIME &&
      timeTaken < this.THRESHOLDS.SUSPICIOUS_MOVE_TIME
    ) {
      return true;
    }

    // Move is suspicious if it's impossibly fast
    if (timeTaken < this.THRESHOLDS.IMPOSSIBLE_MOVE_TIME) {
      return true;
    }

    return false;
  }

  /**
   * Get reason why move is suspicious
   */
  private static getSuspiciousReason(
    timeTaken: number,
    complexity: number
  ): string {
    if (timeTaken < this.THRESHOLDS.IMPOSSIBLE_MOVE_TIME) {
      return "Move completed impossibly fast";
    }

    if (
      complexity >= this.THRESHOLDS.MIN_COMPLEXITY_FOR_TIME &&
      timeTaken < this.THRESHOLDS.SUSPICIOUS_MOVE_TIME
    ) {
      return "Complex move completed suspiciously fast";
    }

    return "Unusual move timing pattern";
  }

  /**
   * Detect timing patterns in moves
   */
  private static detectTimingPatterns(moves: MoveAnalysis[]): string[] {
    const patterns: string[] = [];

    if (moves.length < 3) return patterns;

    // Check for alternating fast/slow pattern
    let alternatingCount = 0;
    for (let i = 1; i < moves.length - 1; i++) {
      const current = moves[i].timeTaken;
      const previous = moves[i - 1].timeTaken;
      const next = moves[i + 1].timeTaken;

      if (
        (current < previous && current < next) ||
        (current > previous && current > next)
      ) {
        alternatingCount++;
      }
    }

    if (alternatingCount > moves.length * 0.6) {
      patterns.push("Alternating fast/slow move pattern detected");
    }

    // Check for sudden performance improvement
    const firstHalf = moves.slice(0, Math.floor(moves.length / 2));
    const secondHalf = moves.slice(Math.floor(moves.length / 2));

    if (firstHalf.length > 0 && secondHalf.length > 0) {
      const firstHalfAvg =
        firstHalf.reduce((sum, m) => sum + m.timeTaken, 0) / firstHalf.length;
      const secondHalfAvg =
        secondHalf.reduce((sum, m) => sum + m.timeTaken, 0) / secondHalf.length;

      if (secondHalfAvg < firstHalfAvg * 0.5) {
        patterns.push("Sudden significant performance improvement");
      }
    }

    return patterns;
  }

  /**
   * Calculate variance of a number array
   */
  private static calculateVariance(numbers: number[]): number {
    if (numbers.length === 0) return 0;

    const mean = numbers.reduce((sum, num) => sum + num, 0) / numbers.length;
    const squaredDifferences = numbers.map((num) => Math.pow(num - mean, 2));
    return (
      squaredDifferences.reduce((sum, diff) => sum + diff, 0) / numbers.length
    );
  }

  /**
   * Get comprehensive player behavior analysis
   */
  static async getPlayerBehaviorAnalysis(
    userId: string
  ): Promise<PlayerBehavior> {
    const recentMatches = await prisma.match.findMany({
      where: {
        OR: [{ player1Id: userId }, { player2Id: userId }],
        status: "COMPLETED",
      },
      orderBy: { finishedAt: "desc" },
      take: 20,
    });

    if (recentMatches.length === 0) {
      return {
        userId,
        averageMoveTime: 0,
        moveTimeVariance: 0,
        suspiciousMoves: 0,
        totalMoves: 0,
        riskScore: 0,
      };
    }

    // Analyze all moves across recent matches
    let allMoves: MoveAnalysis[] = [];

    for (const match of recentMatches) {
      const gameSession = await prisma.gameSession.findFirst({
        where: { matchId: match.id },
      });

      if (gameSession) {
        const moves = await this.getPlayerMoves(userId, match.id, gameSession);
        allMoves.push(...moves);
      }
    }

    if (allMoves.length === 0) {
      return {
        userId,
        averageMoveTime: 0,
        moveTimeVariance: 0,
        suspiciousMoves: 0,
        totalMoves: 0,
        riskScore: 0,
      };
    }

    const moveTimes = allMoves.map((m) => m.timeTaken);
    const averageMoveTime =
      moveTimes.reduce((sum, time) => sum + time, 0) / moveTimes.length;
    const moveTimeVariance = this.calculateVariance(moveTimes);
    const suspiciousMoves = allMoves.filter((m) => m.isSuspicious).length;
    const totalMoves = allMoves.length;

    // Calculate overall risk score
    const riskScore = Math.min(
      100,
      (suspiciousMoves / totalMoves) * 50 +
        (moveTimeVariance < 100 ? 30 : 0) +
        (suspiciousMoves > 5 ? 20 : 0)
    );

    return {
      userId,
      averageMoveTime,
      moveTimeVariance,
      suspiciousMoves,
      totalMoves,
      riskScore,
    };
  }
}
