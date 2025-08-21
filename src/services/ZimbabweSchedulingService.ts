import { Tournament } from "@prisma/client";

export interface SchedulingData {
  province?: string;
  city?: string;
  targetAudience?: "university" | "corporate" | "public";
  preferredTime?: "morning" | "afternoon" | "evening" | "night";
  maxDuration?: number; // in hours
  isWeekend?: boolean;
}

export interface OptimalTimeSlot {
  startTime: Date;
  endTime: Date;
  reason: string;
  confidence: number; // 0-1
}

export interface LoadSheddingSchedule {
  province: string;
  city: string;
  schedule: {
    day: string;
    timeSlots: Array<{
      start: string;
      end: string;
      severity: "low" | "medium" | "high";
    }>;
  }[];
}

export class ZimbabweSchedulingService {
  // Zimbabwe timezone: CAT (UTC+2)
  static ZIMBABWE_TIMEZONE = "Africa/Harare";
  static ZIMBABWE_UTC_OFFSET = 2; // hours

  // Peak gaming hours in Zimbabwe (based on local research)
  static PEAK_HOURS = {
    weekdays: {
      morning: { start: "06:00", end: "08:00" }, // Before work/school
      afternoon: { start: "12:00", end: "14:00" }, // Lunch break
      evening: { start: "18:00", end: "22:00" }, // After work/school
      night: { start: "22:00", end: "00:00" }, // Late night gaming
    },
    weekends: {
      morning: { start: "09:00", end: "12:00" }, // Weekend mornings
      afternoon: { start: "14:00", end: "17:00" }, // Weekend afternoons
      evening: { start: "18:00", end: "23:00" }, // Weekend evenings
      night: { start: "23:00", end: "02:00" }, // Late weekend gaming
    },
  };

  // Load shedding patterns by province (simplified - would be updated from real data)
  static LOAD_SHEDDING_PATTERNS: Record<string, LoadSheddingSchedule> = {
    Harare: {
      province: "Harare",
      city: "Harare",
      schedule: [
        {
          day: "monday",
          timeSlots: [
            { start: "06:00", end: "10:00", severity: "medium" },
            { start: "18:00", end: "22:00", severity: "high" },
          ],
        },
        {
          day: "tuesday",
          timeSlots: [
            { start: "06:00", end: "10:00", severity: "medium" },
            { start: "18:00", end: "22:00", severity: "high" },
          ],
        },
        {
          day: "wednesday",
          timeSlots: [
            { start: "06:00", end: "10:00", severity: "medium" },
            { start: "18:00", end: "22:00", severity: "high" },
          ],
        },
        {
          day: "thursday",
          timeSlots: [
            { start: "06:00", end: "10:00", severity: "medium" },
            { start: "18:00", end: "22:00", severity: "high" },
          ],
        },
        {
          day: "friday",
          timeSlots: [
            { start: "06:00", end: "10:00", severity: "medium" },
            { start: "18:00", end: "22:00", severity: "high" },
          ],
        },
        {
          day: "saturday",
          timeSlots: [
            { start: "10:00", end: "14:00", severity: "low" },
            { start: "20:00", end: "00:00", severity: "medium" },
          ],
        },
        {
          day: "sunday",
          timeSlots: [
            { start: "10:00", end: "14:00", severity: "low" },
            { start: "20:00", end: "00:00", severity: "medium" },
          ],
        },
      ],
    },
    Bulawayo: {
      province: "Bulawayo",
      city: "Bulawayo",
      schedule: [
        {
          day: "monday",
          timeSlots: [
            { start: "08:00", end: "12:00", severity: "medium" },
            { start: "16:00", end: "20:00", severity: "high" },
          ],
        },
        {
          day: "tuesday",
          timeSlots: [
            { start: "08:00", end: "12:00", severity: "medium" },
            { start: "16:00", end: "20:00", severity: "high" },
          ],
        },
        {
          day: "wednesday",
          timeSlots: [
            { start: "08:00", end: "12:00", severity: "medium" },
            { start: "16:00", end: "20:00", severity: "high" },
          ],
        },
        {
          day: "thursday",
          timeSlots: [
            { start: "08:00", end: "12:00", severity: "medium" },
            { start: "16:00", end: "20:00", severity: "high" },
          ],
        },
        {
          day: "friday",
          timeSlots: [
            { start: "08:00", end: "12:00", severity: "medium" },
            { start: "16:00", end: "20:00", severity: "high" },
          ],
        },
        {
          day: "saturday",
          timeSlots: [
            { start: "12:00", end: "16:00", severity: "low" },
            { start: "18:00", end: "22:00", severity: "medium" },
          ],
        },
        {
          day: "sunday",
          timeSlots: [
            { start: "12:00", end: "16:00", severity: "low" },
            { start: "18:00", end: "22:00", severity: "medium" },
          ],
        },
      ],
    },
  };

  // University schedules (simplified)
  static UNIVERSITY_SCHEDULES = {
    UZ: {
      // University of Zimbabwe
      examPeriods: [
        { start: "2025-05-01", end: "2025-05-30" },
        { start: "2025-11-01", end: "2025-11-30" },
      ],
      holidayPeriods: [
        { start: "2025-04-01", end: "2025-04-15" },
        { start: "2025-08-01", end: "2025-08-31" },
        { start: "2025-12-15", end: "2026-01-15" },
      ],
    },
    NUST: {
      // National University of Science and Technology
      examPeriods: [
        { start: "2025-05-15", end: "2025-06-15" },
        { start: "2025-11-15", end: "2025-12-15" },
      ],
      holidayPeriods: [
        { start: "2025-04-15", end: "2025-05-01" },
        { start: "2025-08-15", end: "2025-09-15" },
        { start: "2025-12-20", end: "2026-01-20" },
      ],
    },
  };

  /**
   * Suggest optimal tournament times considering Zimbabwe factors
   */
  static async suggestOptimalTournamentTime(
    data: SchedulingData
  ): Promise<OptimalTimeSlot[]> {
    const suggestions: OptimalTimeSlot[] = [];
    const now = new Date();
    const currentDay = this.getDayOfWeek(now);
    const isWeekend = currentDay === "saturday" || currentDay === "sunday";

    // Get load shedding schedule for the area
    const loadSheddingSchedule = this.getLoadSheddingSchedule(
      data.province,
      data.city
    );

    // Consider target audience preferences
    const audiencePreferences = this.getAudiencePreferences(
      data.targetAudience
    );

    // Generate suggestions for next 7 days
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const targetDate = new Date(now);
      targetDate.setDate(now.getDate() + dayOffset);
      const targetDay = this.getDayOfWeek(targetDate);
      const isTargetWeekend =
        targetDay === "saturday" || targetDay === "sunday";

      // Get available time slots avoiding load shedding
      const availableSlots = this.getAvailableTimeSlots(
        targetDate,
        targetDay,
        loadSheddingSchedule,
        audiencePreferences,
        isTargetWeekend
      );

      suggestions.push(...availableSlots);
    }

    // Sort by confidence (highest first)
    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Get load shedding schedule for a specific area
   */
  private static getLoadSheddingSchedule(
    province?: string,
    city?: string
  ): LoadSheddingSchedule | null {
    if (!province) return null;

    // Try to find exact match first
    const exactMatch = this.LOAD_SHEDDING_PATTERNS[`${province}_${city}`];
    if (exactMatch) return exactMatch;

    // Fall back to province-level schedule
    const provinceMatch = this.LOAD_SHEDDING_PATTERNS[province];
    if (provinceMatch) return provinceMatch;

    return null;
  }

  /**
   * Get audience-specific preferences
   */
  private static getAudiencePreferences(
    targetAudience?: "university" | "corporate" | "public"
  ): {
    preferredTimes: string[];
    avoidTimes: string[];
    maxDuration: number;
  } {
    switch (targetAudience) {
      case "university":
        return {
          preferredTimes: ["evening", "night", "weekend_morning"],
          avoidTimes: ["morning", "afternoon"], // During classes
          maxDuration: 4, // hours
        };
      case "corporate":
        return {
          preferredTimes: ["evening", "weekend_morning", "weekend_afternoon"],
          avoidTimes: ["morning", "afternoon"], // During work hours
          maxDuration: 3, // hours
        };
      case "public":
      default:
        return {
          preferredTimes: ["evening", "weekend_morning", "weekend_afternoon"],
          avoidTimes: [],
          maxDuration: 6, // hours
        };
    }
  }

  /**
   * Get available time slots avoiding load shedding
   */
  private static getAvailableTimeSlots(
    date: Date,
    day: string,
    loadSheddingSchedule: LoadSheddingSchedule | null,
    audiencePreferences: any,
    isWeekend: boolean
  ): OptimalTimeSlot[] {
    const slots: OptimalTimeSlot[] = [];
    const peakHours = isWeekend
      ? this.PEAK_HOURS.weekends
      : this.PEAK_HOURS.weekdays;

    // Check each time period
    Object.entries(peakHours).forEach(([period, timeRange]) => {
      const startTime = this.parseTimeString(timeRange.start, date);
      const endTime = this.parseTimeString(timeRange.end, date);

      // Check if this time conflicts with load shedding
      const hasLoadShedding = this.hasLoadSheddingConflict(
        day,
        timeRange.start,
        timeRange.end,
        loadSheddingSchedule
      );

      if (!hasLoadShedding) {
        const confidence = this.calculateConfidence(
          period,
          audiencePreferences,
          isWeekend
        );

        slots.push({
          startTime,
          endTime,
          reason: `Optimal ${period} time, no load shedding conflicts`,
          confidence,
        });
      }
    });

    return slots;
  }

  /**
   * Check if a time slot conflicts with load shedding
   */
  private static hasLoadSheddingConflict(
    day: string,
    startTime: string,
    endTime: string,
    loadSheddingSchedule: LoadSheddingSchedule | null
  ): boolean {
    if (!loadSheddingSchedule) return false;

    const daySchedule = loadSheddingSchedule.schedule.find(
      (s) => s.day === day
    );
    if (!daySchedule) return false;

    return daySchedule.timeSlots.some((slot) => {
      // Check if there's any overlap between tournament time and load shedding
      const loadStart = this.parseTimeString(slot.start, new Date());
      const loadEnd = this.parseTimeString(slot.end, new Date());
      const tournamentStart = this.parseTimeString(startTime, new Date());
      const tournamentEnd = this.parseTimeString(endTime, new Date());

      return !(tournamentEnd <= loadStart || tournamentStart >= loadEnd);
    });
  }

  /**
   * Calculate confidence score for a time slot
   */
  private static calculateConfidence(
    period: string,
    audiencePreferences: any,
    isWeekend: boolean
  ): number {
    let confidence = 0.5; // Base confidence

    // Boost if it's a preferred time for the audience
    if (audiencePreferences.preferredTimes.includes(period)) {
      confidence += 0.3;
    }

    // Boost for weekend times
    if (isWeekend) {
      confidence += 0.2;
    }

    // Penalize if it's an avoided time
    if (audiencePreferences.avoidTimes.includes(period)) {
      confidence -= 0.4;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Parse time string to Date object
   */
  private static parseTimeString(timeStr: string, baseDate: Date): Date {
    const [hours, minutes] = timeStr.split(":").map(Number);
    const date = new Date(baseDate);
    date.setHours(hours, minutes, 0, 0);
    return date;
  }

  /**
   * Get day of week as string
   */
  private static getDayOfWeek(date: Date): string {
    const days = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ];
    return days[date.getDay()];
  }

  /**
   * Convert local time to Zimbabwe time
   */
  static convertToZimbabweTime(date: Date): Date {
    const zimbabweDate = new Date(date);
    zimbabweDate.setHours(zimbabweDate.getHours() + this.ZIMBABWE_UTC_OFFSET);
    return zimbabweDate;
  }

  /**
   * Convert Zimbabwe time to local time
   */
  static convertFromZimbabweTime(date: Date): Date {
    const localDate = new Date(date);
    localDate.setHours(localDate.getHours() - this.ZIMBABWE_UTC_OFFSET);
    return localDate;
  }

  /**
   * Check if a date falls during university exam/holiday period
   */
  static isUniversityExamPeriod(date: Date, universityCode: string): boolean {
    const university =
      this.UNIVERSITY_SCHEDULES[
        universityCode as keyof typeof this.UNIVERSITY_SCHEDULES
      ];
    if (!university) return false;

    return university.examPeriods.some((period) => {
      const start = new Date(period.start);
      const end = new Date(period.end);
      return date >= start && date <= end;
    });
  }

  /**
   * Check if a date falls during university holiday period
   */
  static isUniversityHolidayPeriod(
    date: Date,
    universityCode: string
  ): boolean {
    const university =
      this.UNIVERSITY_SCHEDULES[
        universityCode as keyof typeof this.UNIVERSITY_SCHEDULES
      ];
    if (!university) return false;

    return university.holidayPeriods.some((period) => {
      const start = new Date(period.start);
      const end = new Date(period.end);
      return date >= start && date <= end;
    });
  }

  /**
   * Get recommended tournament duration for audience
   */
  static getRecommendedDuration(
    targetAudience?: "university" | "corporate" | "public"
  ): number {
    switch (targetAudience) {
      case "university":
        return 4; // 4 hours - students can play longer
      case "corporate":
        return 3; // 3 hours - working professionals have time constraints
      case "public":
      default:
        return 6; // 6 hours - general public can play extended periods
    }
  }
}
