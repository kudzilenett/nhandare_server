import { prisma } from "../config/database";
import { Tournament, TournamentPlayer, User } from "@prisma/client";

export interface ZimbabweTournamentData {
  title: string;
  description?: string;
  gameId: string;
  province: string;
  city: string;
  targetAudience: "university" | "corporate" | "public";
  category: "UNIVERSITY" | "CORPORATE" | "PUBLIC";
  institutionId?: string;
  entryFee: number;
  maxPlayers: number;
  registrationStart: Date;
  registrationEnd: Date;
  startDate: Date;
  endDate?: Date;
  prizePool: number;
  localCurrency?: string;
}

export interface UniversityTournamentData extends ZimbabweTournamentData {
  targetAudience: "university";
  category: "UNIVERSITY";
  institutionId: string;
  isInterUniversity?: boolean;
  participatingInstitutions?: string[];
}

export interface RegionalTournamentData extends ZimbabweTournamentData {
  targetAudience: "public";
  category: "PUBLIC";
  radius?: number; // km radius for location-based matching
  ageRestrictions?: {
    minAge?: number;
    maxAge?: number;
  };
}

export class ZimbabweTournamentService {
  // Zimbabwe provinces for validation
  static ZIMBABWE_PROVINCES = [
    "Harare",
    "Bulawayo",
    "Manicaland",
    "Mashonaland Central",
    "Mashonaland East",
    "Mashonaland West",
    "Masvingo",
    "Matabeleland North",
    "Matabeleland South",
    "Midlands",
  ];

  // Major Zimbabwe cities for enhanced location tracking
  static ZIMBABWE_CITIES = {
    Harare: ["Harare", "Chitungwiza", "Epworth", "Ruwa"],
    Bulawayo: ["Bulawayo", "Luveve", "Pumula"],
    Manicaland: ["Mutare", "Chimanimani", "Chipinge", "Nyanga"],
    "Mashonaland Central": ["Bindura", "Shamva", "Mazowe", "Guruve"],
    "Mashonaland East": ["Marondera", "Chivhu", "Murehwa", "Wedza"],
    "Mashonaland West": ["Chinhoyi", "Chegutu", "Kadoma", "Karoi"],
    Masvingo: ["Masvingo", "Chiredzi", "Gutu", "Bikita"],
    "Matabeleland North": ["Hwange", "Victoria Falls", "Lupane", "Tsholotsho"],
    "Matabeleland South": ["Beitbridge", "Gwanda", "Plumtree", "Kezi"],
    Midlands: ["Gweru", "Kwekwe", "Shurugwi", "Zvishavane"],
  };

  // Zimbabwe universities for tournament categorization
  static ZIMBABWE_UNIVERSITIES = [
    {
      code: "UZ",
      name: "University of Zimbabwe",
      city: "Harare",
      province: "Harare",
      type: "university",
    },
    {
      code: "NUST",
      name: "National University of Science and Technology",
      city: "Bulawayo",
      province: "Bulawayo",
      type: "university",
    },
    {
      code: "MSU",
      name: "Midlands State University",
      city: "Gweru",
      province: "Midlands",
      type: "university",
    },
    {
      code: "CUT",
      name: "Chinhoyi University of Technology",
      city: "Chinhoyi",
      province: "Mashonaland West",
      type: "university",
    },
    {
      code: "UB",
      name: "University of Bindura",
      city: "Bindura",
      province: "Mashonaland Central",
      type: "university",
    },
    {
      code: "GSU",
      name: "Great Zimbabwe University",
      city: "Masvingo",
      province: "Masvingo",
      type: "university",
    },
    {
      code: "AU",
      name: "Africa University",
      city: "Mutare",
      province: "Manicaland",
      type: "university",
    },
  ];

  /**
   * Create a Zimbabwe-specific tournament with enhanced metadata
   */
  static async createZimbabweTournament(
    data: ZimbabweTournamentData
  ): Promise<Tournament> {
    // Validate Zimbabwe location data
    this.validateZimbabweLocation(data.province, data.city);

    // Create tournament with enhanced Zimbabwe metadata
    const tournament = await prisma.tournament.create({
      data: {
        title: data.title,
        description: data.description,
        gameId: data.gameId,
        province: data.province,
        city: data.city,
        targetAudience: data.targetAudience,
        category: data.category,
        entryFee: data.entryFee,
        maxPlayers: data.maxPlayers,
        registrationStart: data.registrationStart,
        registrationEnd: data.registrationEnd,
        startDate: data.startDate,
        endDate: data.endDate,
        prizePool: data.prizePool,
        localCurrency: data.localCurrency || "USD",
        status: "OPEN",
        bracketType: "SINGLE_ELIMINATION",
        currentPlayers: 0,
        location: `${data.city}, ${data.province}`, // Required field
      },
    });

    // If institution-specific, create institution relationship
    if (data.institutionId) {
      await this.linkTournamentToInstitution(tournament.id, data.institutionId);
    }

    return tournament;
  }

  /**
   * Create inter-university tournament
   */
  static async createInterUniversityTournament(
    data: UniversityTournamentData
  ): Promise<Tournament> {
    // Validate university data
    if (!data.institutionId) {
      throw new Error("Institution ID required for university tournaments");
    }

    // Create the tournament
    const tournament = await this.createZimbabweTournament(data);

    // Set up inter-university specific features
    if (data.isInterUniversity && data.participatingInstitutions) {
      await this.setupInterUniversityFeatures(
        tournament.id,
        data.participatingInstitutions
      );
    }

    return tournament;
  }

  /**
   * Create regional tournament for specific area
   */
  static async createRegionalTournament(
    data: RegionalTournamentData
  ): Promise<Tournament> {
    // Validate regional data
    if (data.radius && data.radius > 100) {
      throw new Error("Tournament radius cannot exceed 100km");
    }

    // Create the tournament
    const tournament = await this.createZimbabweTournament(data);

    // Set up regional features
    if (data.radius) {
      await this.setupRegionalFeatures(tournament.id, data.radius);
    }

    return tournament;
  }

  /**
   * Get tournaments by Zimbabwe region
   */
  static async getTournamentsByRegion(
    province?: string,
    city?: string,
    radius?: number
  ): Promise<Tournament[]> {
    const where: any = {
      status: { in: ["OPEN", "CLOSED", "ACTIVE"] },
    };

    if (province) {
      where.province = province;
    }

    if (city) {
      where.city = city;
    }

    // If radius specified, use location-based filtering
    if (radius && radius > 0) {
      // This would require latitude/longitude data
      // For now, filter by province/city
      console.log(
        `Location-based filtering with ${radius}km radius not yet implemented`
      );
    }

    return await prisma.tournament.findMany({
      where,
      include: {
        game: true,
        _count: { select: { players: true } },
      },
      orderBy: { startDate: "asc" },
    });
  }

  /**
   * Get university tournaments
   */
  static async getUniversityTournaments(
    institutionId?: string
  ): Promise<Tournament[]> {
    const where: any = {
      category: "UNIVERSITY",
      status: { in: ["OPEN", "CLOSED", "ACTIVE"] },
    };

    if (institutionId) {
      where.institutionId = institutionId;
    }

    return await prisma.tournament.findMany({
      where,
      include: {
        game: true,
        _count: { select: { players: true } },
      },
      orderBy: { startDate: "asc" },
    });
  }

  /**
   * Get corporate tournaments
   */
  static async getCorporateTournaments(): Promise<Tournament[]> {
    return await prisma.tournament.findMany({
      where: {
        category: "CORPORATE",
        status: { in: ["OPEN", "CLOSED", "ACTIVE"] },
      },
      include: {
        game: true,
        _count: { select: { players: true } },
      },
      orderBy: { startDate: "asc" },
    });
  }

  /**
   * Validate Zimbabwe location data
   */
  private static validateZimbabweLocation(
    province: string,
    city: string
  ): void {
    if (!this.ZIMBABWE_PROVINCES.includes(province)) {
      throw new Error(
        `Invalid province: ${province}. Must be one of: ${this.ZIMBABWE_PROVINCES.join(
          ", "
        )}`
      );
    }

    const validCities =
      this.ZIMBABWE_CITIES[province as keyof typeof this.ZIMBABWE_CITIES];
    if (validCities && !validCities.includes(city)) {
      console.warn(
        `City ${city} not found in province ${province}. This may be a new city.`
      );
    }
  }

  /**
   * Link tournament to institution
   */
  private static async linkTournamentToInstitution(
    tournamentId: string,
    institutionId: string
  ): Promise<void> {
    // This would create a relationship between tournament and institution
    // For now, we'll store it in tournament metadata
    console.log(
      `Linking tournament ${tournamentId} to institution ${institutionId}`
    );
  }

  /**
   * Setup inter-university features
   */
  private static async setupInterUniversityFeatures(
    tournamentId: string,
    participatingInstitutions: string[]
  ): Promise<void> {
    // Setup inter-university specific features
    // This could include team formation, university brackets, etc.
    console.log(
      `Setting up inter-university features for tournament ${tournamentId}`
    );
  }

  /**
   * Setup regional features
   */
  private static async setupRegionalFeatures(
    tournamentId: string,
    radius: number
  ): Promise<void> {
    // Setup regional specific features
    // This could include location-based player matching, etc.
    console.log(
      `Setting up regional features for tournament ${tournamentId} with ${radius}km radius`
    );
  }

  /**
   * Get Zimbabwe tournament statistics
   */
  static async getZimbabweTournamentStats(): Promise<{
    totalTournaments: number;
    byProvince: Record<string, number>;
    byCategory: Record<string, number>;
    byTargetAudience: Record<string, number>;
  }> {
    const tournaments = await prisma.tournament.findMany({
      where: {
        status: { in: ["OPEN", "CLOSED", "ACTIVE", "COMPLETED"] },
      },
      select: {
        province: true,
        category: true,
        targetAudience: true,
      },
    });

    const stats = {
      totalTournaments: tournaments.length,
      byProvince: {} as Record<string, number>,
      byCategory: {} as Record<string, number>,
      byTargetAudience: {} as Record<string, number>,
    };

    tournaments.forEach((tournament) => {
      // Count by province
      if (tournament.province) {
        stats.byProvince[tournament.province] =
          (stats.byProvince[tournament.province] || 0) + 1;
      }

      // Count by category
      if (tournament.category) {
        stats.byCategory[tournament.category] =
          (stats.byCategory[tournament.category] || 0) + 1;
      }

      // Count by target audience
      if (tournament.targetAudience) {
        stats.byTargetAudience[tournament.targetAudience] =
          (stats.byTargetAudience[tournament.targetAudience] || 0) + 1;
      }
    });

    return stats;
  }
}
