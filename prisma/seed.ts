/// <reference types="node" />
import { PrismaClient } from "@prisma/client";
import {
  TournamentCategory,
  AchievementType,
  TournamentStatus,
  MatchStatus,
  MatchResult,
  PaymentStatus,
  PaymentType,
} from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Utility function for rounding to cents
function roundToCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}

// Helper function to generate random date within a range
function randomDate(start: Date, end: Date): Date {
  return new Date(
    start.getTime() + Math.random() * (end.getTime() - start.getTime())
  );
}

// Helper to generate realistic Zimbabwe phone numbers
function generateZimbabwePhone(): string {
  const prefixes = ["263771", "263772", "263773", "263774", "263778"];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const suffix = Math.floor(Math.random() * 900000) + 100000;
  return `+${prefix}${suffix}`;
}

async function main() {
  console.log("🇿🇼 Seeding comprehensive Zimbabwe gaming platform (2025)...");

  // Clean up existing data (order matters due to foreign key constraints)
  await prisma.userAchievement.deleteMany();
  await prisma.achievement.deleteMany();
  await prisma.tournamentChatMessage.deleteMany();
  await prisma.challengeInvitation.deleteMany(); // Delete challenge invitations first
  await prisma.gameStatistic.deleteMany();
  await prisma.gameSession.deleteMany();
  await prisma.match.deleteMany();
  await prisma.tournamentPlayer.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.tournament.deleteMany();
  await prisma.mobileMoneyProvider.deleteMany();
  await prisma.institution.deleteMany();
  await prisma.zimbabweLocation.deleteMany();
  await prisma.game.deleteMany();
  await prisma.user.deleteMany();

  // 1. Create Zimbabwe locations
  console.log("📍 Creating Zimbabwe locations...");
  const locations = [
    // Major cities with coordinates
    {
      province: "Harare",
      city: "Harare",
      latitude: -17.8292,
      longitude: 31.0522,
    },
    {
      province: "Harare",
      city: "Chitungwiza",
      latitude: -18.01,
      longitude: 31.07,
    },
    { province: "Harare", city: "Epworth", latitude: -17.89, longitude: 31.15 },
    { province: "Harare", city: "Norton", latitude: -17.88, longitude: 30.7 },
    {
      province: "Bulawayo",
      city: "Bulawayo",
      latitude: -20.1594,
      longitude: 28.5886,
    },
    {
      province: "Bulawayo",
      city: "Cowdray Park",
      latitude: -20.12,
      longitude: 28.55,
    },
    {
      province: "Manicaland",
      city: "Mutare",
      latitude: -18.9707,
      longitude: 32.6473,
    },
    {
      province: "Manicaland",
      city: "Rusape",
      latitude: -18.5276,
      longitude: 32.1254,
    },
    {
      province: "Mashonaland Central",
      city: "Bindura",
      latitude: -17.3017,
      longitude: 31.3314,
    },
    {
      province: "Mashonaland East",
      city: "Marondera",
      latitude: -18.1851,
      longitude: 31.5539,
    },
    {
      province: "Mashonaland West",
      city: "Chinhoyi",
      latitude: -17.3667,
      longitude: 30.2,
    },
    {
      province: "Masvingo",
      city: "Masvingo",
      latitude: -20.0637,
      longitude: 30.8267,
    },
    {
      province: "Matabeleland North",
      city: "Hwange",
      latitude: -18.3759,
      longitude: 26.5019,
    },
    {
      province: "Matabeleland South",
      city: "Gwanda",
      latitude: -20.9333,
      longitude: 29.0167,
    },
    {
      province: "Midlands",
      city: "Gweru",
      latitude: -19.4167,
      longitude: 29.8167,
    },
    {
      province: "Midlands",
      city: "Kwekwe",
      latitude: -18.9167,
      longitude: 29.8167,
    },
  ];

  await prisma.zimbabweLocation.createMany({ data: locations });

  // 2. Create institutions
  console.log("🏫 Creating institutions...");
  const institutions = [
    {
      name: "University of Zimbabwe",
      type: "university",
      province: "Harare",
      city: "Harare",
    },
    {
      name: "National University of Science & Technology",
      type: "university",
      province: "Bulawayo",
      city: "Bulawayo",
    },
    {
      name: "Midlands State University",
      type: "university",
      province: "Midlands",
      city: "Gweru",
    },
    {
      name: "Africa University",
      type: "university",
      province: "Manicaland",
      city: "Mutare",
    },
    {
      name: "Chinhoyi University of Technology",
      type: "university",
      province: "Mashonaland West",
      city: "Chinhoyi",
    },
    {
      name: "Bindura University of Science Education",
      type: "university",
      province: "Mashonaland Central",
      city: "Bindura",
    },
    {
      name: "Great Zimbabwe University",
      type: "university",
      province: "Masvingo",
      city: "Masvingo",
    },
    {
      name: "CBZ Holdings",
      type: "company",
      province: "Harare",
      city: "Harare",
    },
    {
      name: "Econet Wireless",
      type: "company",
      province: "Harare",
      city: "Harare",
    },
    {
      name: "Delta Corporation",
      type: "company",
      province: "Harare",
      city: "Harare",
    },
    {
      name: "OK Zimbabwe",
      type: "company",
      province: "Harare",
      city: "Harare",
    },
    {
      name: "Zimplats",
      type: "company",
      province: "Mashonaland West",
      city: "Chinhoyi",
    },
  ];

  await prisma.institution.createMany({ data: institutions });

  // 3. Create mobile money providers
  console.log("📱 Creating mobile money providers...");
  const mobileMoneyProviders = [
    {
      name: "EcoCash",
      code: "ECOCASH",
      isActive: true,
      minAmount: 0,
      maxAmount: 10000,
    },
    {
      name: "OneMoney",
      code: "ONEMONEY",
      isActive: true,
      minAmount: 0,
      maxAmount: 10000,
    },
    {
      name: "Telecash",
      code: "TELECASH",
      isActive: true,
      minAmount: 0,
      maxAmount: 10000,
    },
    {
      name: "ZimSwitch",
      code: "ZIMSWITCH",
      isActive: true,
      minAmount: 0,
      maxAmount: 10000,
    },
  ];

  await prisma.mobileMoneyProvider.createMany({ data: mobileMoneyProviders });

  // 4. Create games
  console.log("🎮 Creating games...");
  const games = [
    {
      name: "Chess",
      description: "Strategic board game for two players",
      emoji: "♟️",
      minPlayers: 2,
      maxPlayers: 2,
      averageTimeMs: 1800000, // 30 minutes
      isActive: true,
      rules: { piece_movement: "standard", time_control: "30+0" },
      settings: {
        board_size: "8x8",
        starting_position: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",
      },
    },
    {
      name: "Checkers",
      description: "Classic strategy game also known as Draughts",
      emoji: "🔴",
      minPlayers: 2,
      maxPlayers: 2,
      averageTimeMs: 1200000, // 20 minutes
      isActive: true,
      rules: { board_size: "8x8", mandatory_capture: true },
      settings: { variant: "international" },
    },
    {
      name: "Tic Tac Toe",
      description: "Simple strategy game on a 3x3 grid",
      emoji: "⭕",
      minPlayers: 2,
      maxPlayers: 2,
      averageTimeMs: 300000, // 5 minutes
      isActive: true,
      rules: { board_size: "3x3", win_condition: "3_in_a_row" },
      settings: { symbols: ["X", "O"] },
    },
    {
      name: "Connect 4",
      description: "Connect four pieces in a row to win",
      emoji: "🔵",
      minPlayers: 2,
      maxPlayers: 2,
      averageTimeMs: 900000, // 15 minutes
      isActive: true,
      rules: { board_size: "7x6", win_condition: "4_in_a_row" },
      settings: { gravity: true },
    },
  ];

  const createdGames = await Promise.all(
    games.map((game) => prisma.game.create({ data: game }))
  );

  // 5. Create comprehensive users (50 users for extensive testing)
  console.log("👥 Creating comprehensive user profiles...");
  const userProfiles: any[] = [
    // Super Admin user
    {
      email: "admin@nhandare.co.zw",
      username: "admin",
      password: await bcrypt.hash("admin123", 10),
      firstName: "System",
      lastName: "Administrator",
      phoneNumber: generateZimbabwePhone(),
      province: "Harare",
      city: "Harare",
      location: "Harare, Zimbabwe",
      isActive: true,
      isVerified: true,
      points: 10000,
      rank: 1,
      role: "super_admin",
      permissions: [
        "users:manage",
        "tournaments:manage",
        "payments:manage",
        "games:manage",
        "analytics:view",
        "system:configure",
        "content:moderate",
      ],
    },
    // Regular Admin user
    {
      email: "admin.manager@nhandare.co.zw",
      username: "admin_manager",
      password: await bcrypt.hash("admin123", 10),
      firstName: "Admin",
      lastName: "Manager",
      phoneNumber: generateZimbabwePhone(),
      province: "Bulawayo",
      city: "Bulawayo",
      location: "Bulawayo, Zimbabwe",
      isActive: true,
      isVerified: true,
      points: 5000,
      rank: 2,
      role: "admin",
      permissions: [
        "users:manage",
        "tournaments:manage",
        "payments:view",
        "analytics:view",
      ],
    },
    // Moderator user
    {
      email: "moderator@nhandare.co.zw",
      username: "moderator",
      password: await bcrypt.hash("mod123", 10),
      firstName: "Content",
      lastName: "Moderator",
      phoneNumber: generateZimbabwePhone(),
      province: "Manicaland",
      city: "Mutare",
      location: "Mutare, Zimbabwe",
      isActive: true,
      isVerified: true,
      points: 2500,
      rank: 10,
      role: "moderator",
      permissions: ["content:moderate", "users:view", "tournaments:view"],
    },
  ];

  // Generate 49 more realistic users
  const firstNames = [
    "Tendai",
    "Chipo",
    "Tinashe",
    "Nyasha",
    "Blessing",
    "Tatenda",
    "Chiedza",
    "Anesu",
    "Rutendo",
    "Farai",
    "Panashe",
    "Nokutenda",
    "Takudzwa",
    "Chamu",
    "Rudo",
    "Simba",
    "Tafadzwa",
    "Vimbai",
    "Chenai",
    "Mukamuri",
    "Tapiwanashe",
    "Fungai",
    "Tadiwa",
    "Nyaradzo",
    "Munyaradzi",
    "Tariro",
    "Chengeto",
    "Tarisai",
    "Shamiso",
    "Tawanda",
  ];

  const lastNames = [
    "Moyo",
    "Ncube",
    "Sibanda",
    "Dube",
    "Nyoni",
    "Mthembu",
    "Banda",
    "Phiri",
    "Mwanza",
    "Soko",
    "Mukamuri",
    "Chigumbura",
    "Madziwa",
    "Marowa",
    "Chidzonga",
    "Mafukidze",
    "Musiyiwa",
    "Mudzingwa",
    "Chipunza",
    "Muchena",
    "Mutapa",
    "Zimbabwean",
  ];

  const provinces = [
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
  const universitiesAndCompanies = [
    "University of Zimbabwe",
    "National University of Science & Technology",
    "Midlands State University",
    "CBZ Holdings",
    "Econet Wireless",
    "Delta Corporation",
  ];

  for (let i = 0; i < 49; i++) {
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
    const province = provinces[Math.floor(Math.random() * provinces.length)];
    const isStudent = Math.random() < 0.6; // 60% students

    userProfiles.push({
      email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${i}@${
        isStudent ? "student." : ""
      }nhandare.co.zw`,
      username: `${firstName.toLowerCase()}_${lastName.toLowerCase()}_${i}`,
      password: await bcrypt.hash("password123", 10),
      firstName,
      lastName,
      phoneNumber: generateZimbabwePhone(),
      ecocashNumber: Math.random() < 0.8 ? generateZimbabwePhone() : null,
      mobileMoneyProvider:
        Math.random() < 0.8
          ? Math.random() < 0.7
            ? "ECOCASH"
            : "ONEMONEY"
          : null,
      province,
      city:
        province === "Harare"
          ? "Harare"
          : province === "Bulawayo"
          ? "Bulawayo"
          : "Main City",
      location: `${province}, Zimbabwe`,
      isStudent,
      institution: isStudent
        ? universitiesAndCompanies[Math.floor(Math.random() * 3)]
        : universitiesAndCompanies[
            Math.floor(Math.random() * universitiesAndCompanies.length)
          ],
      dateOfBirth: randomDate(new Date("1990-01-01"), new Date("2005-12-31")),
      gender: Math.random() < 0.5 ? "male" : "female",
      isActive: true,
      isVerified: Math.random() < 0.7, // 70% verified
      points: Math.floor(Math.random() * 5000) + 100,
      rank: Math.floor(Math.random() * 1000) + 2,
      gamesPlayed: Math.floor(Math.random() * 100) + 5,
      gamesWon: Math.floor(Math.random() * 50) + 2,
      winRate: Math.random() * 0.6 + 0.2, // 20% to 80% win rate
      bio: `Gaming enthusiast from ${province}. Love strategic games!`,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${firstName}${lastName}`,
      role: "user", // Regular users
      permissions: [], // No special permissions for regular users
      createdAt: randomDate(new Date("2024-01-01"), new Date("2024-12-31")),
      lastLogin: randomDate(new Date("2025-01-01"), new Date()),
    });
  }

  const createdUsers = await Promise.all(
    userProfiles.map((user) => prisma.user.create({ data: user }))
  );

  // 6. Create comprehensive tournaments (20 tournaments in various states)
  console.log("🏆 Creating comprehensive tournaments...");
  const currentDate = new Date();
  const oneWeekAgo = new Date(currentDate.getTime() - 7 * 24 * 60 * 60 * 1000);
  const oneWeekFromNow = new Date(
    currentDate.getTime() + 7 * 24 * 60 * 60 * 1000
  );
  const oneMonthFromNow = new Date(
    currentDate.getTime() + 30 * 24 * 60 * 60 * 1000
  );

  const tournamentTemplates: any[] = [
    // Open tournaments
    {
      title: "Zimbabwe National Chess Championship 2025",
      description: "Premier chess tournament featuring Zimbabwe's best players",
      gameId: createdGames[0].id,
      entryFee: 5.0,
      prizePool: 500.0,
      maxPlayers: 64,
      status: TournamentStatus.OPEN,
      province: "Harare",
      city: "Harare",
      location: "Rainbow Towers, Harare",
      venue: "Rainbow Towers Conference Centre",
      isOnlineOnly: false,
      targetAudience: "public",
      category: TournamentCategory.PUBLIC,
      difficultyLevel: "advanced",
      registrationStart: new Date(
        currentDate.getTime() - 2 * 24 * 60 * 60 * 1000
      ),
      registrationEnd: oneWeekFromNow,
      startDate: new Date(oneWeekFromNow.getTime() + 24 * 60 * 60 * 1000),
      endDate: new Date(oneWeekFromNow.getTime() + 3 * 24 * 60 * 60 * 1000),
    },
    {
      title: "UZ Student Chess League",
      description:
        "Monthly chess tournament for University of Zimbabwe students",
      gameId: createdGames[0].id,
      entryFee: 1.0,
      prizePool: 100.0,
      maxPlayers: 32,
      status: TournamentStatus.OPEN,
      province: "Harare",
      city: "Harare",
      location: "University of Zimbabwe",
      venue: "UZ Main Hall",
      isOnlineOnly: false,
      targetAudience: "university",
      category: TournamentCategory.UNIVERSITY,
      difficultyLevel: "intermediate",
      registrationStart: new Date(
        currentDate.getTime() - 1 * 24 * 60 * 60 * 1000
      ),
      registrationEnd: new Date(
        currentDate.getTime() + 5 * 24 * 60 * 60 * 1000
      ),
      startDate: new Date(currentDate.getTime() + 6 * 24 * 60 * 60 * 1000),
      endDate: new Date(currentDate.getTime() + 7 * 24 * 60 * 60 * 1000),
    },
    // Tournament starting soon (for testing)
    {
      title: "Friday Night Checkers Blitz",
      description: "Fast-paced checkers tournament every Friday",
      gameId: createdGames[1].id,
      entryFee: 0.5,
      prizePool: 50.0,
      maxPlayers: 16,
      status: TournamentStatus.OPEN,
      province: "Harare",
      city: "Harare",
      location: "Online",
      isOnlineOnly: true,
      targetAudience: "public",
      category: TournamentCategory.PUBLIC,
      difficultyLevel: "beginner",
      registrationStart: new Date(
        currentDate.getTime() - 3 * 24 * 60 * 60 * 1000
      ),
      registrationEnd: new Date(currentDate.getTime() + 2 * 60 * 60 * 1000), // 2 hours from now
      startDate: new Date(currentDate.getTime() + 3 * 60 * 60 * 1000), // 3 hours from now
      endDate: new Date(currentDate.getTime() + 6 * 60 * 60 * 1000), // 6 hours from now
    },
    // In-progress tournament
    {
      title: "Midlands Connect 4 Championship",
      description: "Regional Connect 4 tournament for Midlands province",
      gameId: createdGames[3].id,
      entryFee: 2.0,
      prizePool: 200.0,
      maxPlayers: 24,
      status: TournamentStatus.ACTIVE,
      province: "Midlands",
      city: "Gweru",
      location: "Gweru Polytechnic",
      venue: "Gweru Polytechnic Sports Hall",
      isOnlineOnly: false,
      targetAudience: "public",
      category: TournamentCategory.PUBLIC,
      difficultyLevel: "intermediate",
      registrationStart: new Date(
        currentDate.getTime() - 10 * 24 * 60 * 60 * 1000
      ),
      registrationEnd: new Date(
        currentDate.getTime() - 3 * 24 * 60 * 60 * 1000
      ),
      startDate: new Date(currentDate.getTime() - 2 * 24 * 60 * 60 * 1000),
      endDate: new Date(currentDate.getTime() + 1 * 24 * 60 * 60 * 1000),
    },
    // Completed tournament
    {
      title: "New Year Chess Classic 2025",
      description: "Special New Year chess tournament with great prizes",
      gameId: createdGames[0].id,
      entryFee: 3.0,
      prizePool: 300.0,
      maxPlayers: 32,
      status: TournamentStatus.COMPLETED,
      province: "Bulawayo",
      city: "Bulawayo",
      location: "Bulawayo Athletic Club",
      venue: "Bulawayo Athletic Club",
      isOnlineOnly: false,
      targetAudience: "public",
      category: TournamentCategory.PUBLIC,
      difficultyLevel: "intermediate",
      registrationStart: new Date("2024-12-15"),
      registrationEnd: new Date("2024-12-28"),
      startDate: new Date("2025-01-01"),
      endDate: new Date("2025-01-03"),
    },
  ];

  // Add more tournaments with various games and statuses
  for (let i = 0; i < 15; i++) {
    const game = createdGames[Math.floor(Math.random() * createdGames.length)];
    const province = provinces[Math.floor(Math.random() * provinces.length)];
    const isOnline = Math.random() < 0.4; // 40% online
    const status =
      Math.random() < 0.6
        ? TournamentStatus.OPEN
        : Math.random() < 0.3
        ? TournamentStatus.ACTIVE
        : TournamentStatus.COMPLETED;

    // Adjust dates based on status
    let regStart, regEnd, startDate, endDate;
    if (status === TournamentStatus.OPEN) {
      regStart = randomDate(
        new Date(currentDate.getTime() - 7 * 24 * 60 * 60 * 1000),
        currentDate
      );
      regEnd = randomDate(currentDate, oneWeekFromNow);
      startDate = new Date(regEnd.getTime() + 24 * 60 * 60 * 1000);
      endDate = new Date(startDate.getTime() + 2 * 24 * 60 * 60 * 1000);
    } else if (status === TournamentStatus.ACTIVE) {
      regStart = new Date(currentDate.getTime() - 10 * 24 * 60 * 60 * 1000);
      regEnd = new Date(currentDate.getTime() - 3 * 24 * 60 * 60 * 1000);
      startDate = new Date(currentDate.getTime() - 1 * 24 * 60 * 60 * 1000);
      endDate = randomDate(currentDate, oneWeekFromNow);
    } else {
      regStart = new Date(currentDate.getTime() - 20 * 24 * 60 * 60 * 1000);
      regEnd = new Date(currentDate.getTime() - 10 * 24 * 60 * 60 * 1000);
      startDate = new Date(currentDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      endDate = new Date(currentDate.getTime() - 3 * 24 * 60 * 60 * 1000);
    }

    tournamentTemplates.push({
      title: `${game.name} ${province} Tournament #${i + 1}`,
      description: `${game.name} tournament for ${province} province players`,
      gameId: game.id,
      entryFee: roundToCents(Math.random() * 3 + 0.5),
      prizePool: roundToCents(Math.random() * 200 + 50),
      maxPlayers: [8, 16, 24, 32][Math.floor(Math.random() * 4)],
      status,
      province,
      city:
        province === "Harare"
          ? "Harare"
          : province === "Bulawayo"
          ? "Bulawayo"
          : "Main City",
      location: isOnline ? "Online" : `${province} Gaming Center`,
      venue: isOnline ? undefined : `${province} Gaming Center`,
      isOnlineOnly: isOnline,
      targetAudience: Math.random() < 0.3 ? "university" : "public",
      category:
        Math.random() < 0.3
          ? TournamentCategory.UNIVERSITY
          : TournamentCategory.PUBLIC,
      difficultyLevel: ["beginner", "intermediate", "advanced"][
        Math.floor(Math.random() * 3)
      ],
      registrationStart: regStart,
      registrationEnd: regEnd,
      startDate,
      endDate,
    });
  }

  const createdTournaments = await Promise.all(
    tournamentTemplates.map((tournament) =>
      prisma.tournament.create({
        data: {
          ...tournament,
          prizeBreakdown: {
            first: roundToCents(tournament.prizePool * 0.6),
            second: roundToCents(tournament.prizePool * 0.25),
            third: roundToCents(tournament.prizePool * 0.15),
          },
        },
      })
    )
  );

  // 7. Create tournament players (registrations)
  console.log("👥 Creating tournament players...");
  const tournamentPlayers: any[] = [];

  for (const tournament of createdTournaments) {
    const maxRegistrations = Math.min(
      tournament.maxPlayers,
      tournament.status === TournamentStatus.COMPLETED
        ? tournament.maxPlayers
        : Math.floor(tournament.maxPlayers * (0.4 + Math.random() * 0.6))
    );

    // Randomly select users for this tournament
    const selectedUsers = createdUsers
      .slice(1) // Skip admin
      .sort(() => Math.random() - 0.5)
      .slice(0, maxRegistrations);

    selectedUsers.forEach((user, index) => {
      tournamentPlayers.push({
        userId: user.id,
        tournamentId: tournament.id,
        registeredAt: randomDate(
          tournament.registrationStart,
          tournament.registrationEnd
        ),
        joinedAt: randomDate(
          tournament.registrationStart,
          tournament.registrationEnd
        ),
        isActive:
          tournament.status !== TournamentStatus.COMPLETED
            ? true
            : index < maxRegistrations,
        seedNumber: index + 1,
        currentRound:
          tournament.status === TournamentStatus.COMPLETED
            ? Math.floor(Math.log2(maxRegistrations)) + 1
            : 1,
        isEliminated:
          tournament.status === TournamentStatus.COMPLETED ? index >= 3 : false,
        placement:
          tournament.status === TournamentStatus.COMPLETED
            ? index === 0
              ? 1
              : index === 1
              ? 2
              : index === 2
              ? 3
              : null
            : null,
        prizeWon:
          tournament.status === TournamentStatus.COMPLETED
            ? index === 0
              ? roundToCents(tournament.prizePool * 0.6)
              : index === 1
              ? roundToCents(tournament.prizePool * 0.25)
              : index === 2
              ? roundToCents(tournament.prizePool * 0.15)
              : 0
            : 0,
      });
    });
  }

  await prisma.tournamentPlayer.createMany({ data: tournamentPlayers });

  // 8. Create payments for tournament entries
  console.log("💳 Creating tournament payments...");
  const payments: any[] = [];

  for (const tp of tournamentPlayers) {
    const tournament = createdTournaments.find((t) => t.id === tp.tournamentId);
    if (tournament && tournament.entryFee > 0) {
      payments.push({
        userId: tp.userId,
        tournamentId: tp.tournamentId,
        amount: tournament.entryFee,
        currency: "USD",
        type: PaymentType.ENTRY_FEE,
        status: PaymentStatus.COMPLETED,
        paymentMethodCode: Math.random() < 0.7 ? "ECOCASH" : "ONEMONEY",
        mobileMoneyNumber: generateZimbabwePhone(),
        paymentConfirmedAt: tp.registeredAt,
        createdAt: tp.registeredAt,
      });
    }
  }

  await prisma.payment.createMany({ data: payments });

  // 9. Create matches for in-progress and completed tournaments
  console.log("⚔️ Creating tournament matches...");
  const matches: any[] = [];

  for (const tournament of createdTournaments) {
    if (
      tournament.status === TournamentStatus.ACTIVE ||
      tournament.status === TournamentStatus.COMPLETED
    ) {
      const tournamentPlayers = await prisma.tournamentPlayer.findMany({
        where: { tournamentId: tournament.id },
        include: { user: true },
      });

      // Create some matches
      for (let i = 0; i < tournamentPlayers.length - 1; i += 2) {
        if (i + 1 < tournamentPlayers.length) {
          const player1 = tournamentPlayers[i];
          const player2 = tournamentPlayers[i + 1];

          matches.push({
            player1Id: player1.userId,
            player2Id: player2.userId,
            gameId: tournament.gameId,
            tournamentId: tournament.id,
            round: 1,
            status:
              tournament.status === TournamentStatus.COMPLETED
                ? MatchStatus.COMPLETED
                : Math.random() < 0.5
                ? MatchStatus.ACTIVE
                : MatchStatus.COMPLETED,
            result:
              tournament.status === TournamentStatus.COMPLETED
                ? Math.random() < 0.5
                  ? MatchResult.PLAYER1_WIN
                  : MatchResult.PLAYER2_WIN
                : Math.random() < 0.3
                ? MatchResult.PLAYER1_WIN
                : Math.random() < 0.6
                ? MatchResult.PLAYER2_WIN
                : MatchResult.PENDING,
            winnerId: null, // Will be set based on result
            duration: Math.floor(Math.random() * 1800) + 300, // 5-35 minutes
            createdAt: randomDate(
              tournament.startDate,
              tournament.endDate || new Date()
            ),
            startedAt: randomDate(
              tournament.startDate,
              tournament.endDate || new Date()
            ),
            finishedAt:
              tournament.status === TournamentStatus.COMPLETED
                ? randomDate(
                    tournament.startDate,
                    tournament.endDate || new Date()
                  )
                : null,
          });
        }
      }
    }
  }

  const createdMatches = await Promise.all(
    matches.map((match) => {
      // Set winnerId based on result
      if (match.result === MatchResult.PLAYER1_WIN) {
        match.winnerId = match.player1Id;
      } else if (match.result === MatchResult.PLAYER2_WIN) {
        match.winnerId = match.player2Id;
      }
      return prisma.match.create({ data: match });
    })
  );

  // 10. Create game statistics
  console.log("📊 Creating game statistics...");
  const gameStats: any[] = [];

  for (const user of createdUsers.slice(1)) {
    // Skip admin
    for (const game of createdGames) {
      const gamesPlayed = Math.floor(Math.random() * 50) + 10;
      const gamesWon = Math.floor(gamesPlayed * (0.2 + Math.random() * 0.6));
      const gamesLost = gamesPlayed - gamesWon;

      gameStats.push({
        userId: user.id,
        gameId: game.id,
        gamesPlayed,
        gamesWon,
        gamesLost,
        gamesDrawn: Math.floor(Math.random() * 5),
        winRate: gamesWon / gamesPlayed,
        averageScore: Math.floor(Math.random() * 100) + 50,
        bestScore: Math.floor(Math.random() * 200) + 100,
        totalPlayTime: gamesPlayed * Math.floor(game.averageTimeMs / 1000),
        currentRating: Math.floor(Math.random() * 800) + 1000,
        peakRating: Math.floor(Math.random() * 1000) + 1200,
      });
    }
  }

  await prisma.gameStatistic.createMany({ data: gameStats });

  // 11. Create achievements
  console.log("🏅 Creating achievements...");
  const achievements = [
    {
      name: "First Steps",
      description: "Complete your first game",
      icon: "🎯",
      type: AchievementType.SPECIAL,
      requirements: { gamesPlayed: 1 },
      points: 25,
    },
    {
      name: "First Victory",
      description: "Win your first game",
      icon: "🎉",
      type: AchievementType.SPECIAL,
      requirements: { gamesWon: 1 },
      points: 50,
    },
    {
      name: "Chess Master",
      description: "Win 25 chess games",
      icon: "♟️",
      type: AchievementType.SPECIAL,
      requirements: { gamesWon: 25, gameType: "Chess" },
      points: 200,
    },
    {
      name: "Checkers Champion",
      description: "Win 20 checkers games",
      icon: "🔴",
      type: AchievementType.SPECIAL,
      requirements: { gamesWon: 20, gameType: "Checkers" },
      points: 180,
    },
    {
      name: "Quick Draw",
      description: "Win 15 Tic Tac Toe games",
      icon: "⚡",
      type: AchievementType.SPECIAL,
      requirements: { gamesWon: 15, gameType: "Tic Tac Toe" },
      points: 100,
    },
    {
      name: "Connect Master",
      description: "Win 18 Connect 4 games",
      icon: "🔵",
      type: AchievementType.SPECIAL,
      requirements: { gamesWon: 18, gameType: "Connect 4" },
      points: 150,
    },
    {
      name: "Tournament Warrior",
      description: "Participate in 5 tournaments",
      icon: "⚔️",
      type: AchievementType.PARTICIPATION,
      requirements: { tournamentsJoined: 5 },
      points: 300,
    },
    {
      name: "Tournament Champion",
      description: "Win your first tournament",
      icon: "🏆",
      type: AchievementType.TOURNAMENTS_WON,
      requirements: { tournamentsWon: 1 },
      points: 500,
    },
    {
      name: "Tournament Legend",
      description: "Win 3 tournaments",
      icon: "👑",
      type: AchievementType.TOURNAMENTS_WON,
      requirements: { tournamentsWon: 3 },
      points: 1000,
    },
    {
      name: "Zimbabwe Pride",
      description: "Represent Zimbabwe in 10 tournaments",
      icon: "🇿🇼",
      type: AchievementType.PARTICIPATION,
      requirements: { tournamentsJoined: 10 },
      points: 400,
    },
    {
      name: "Rising Star",
      description: "Reach 1400 rating",
      icon: "⭐",
      type: AchievementType.RATING_MILESTONE,
      requirements: { rating: 1400 },
      points: 350,
    },
    {
      name: "Expert Player",
      description: "Reach 1600 rating",
      icon: "🌟",
      type: AchievementType.RATING_MILESTONE,
      requirements: { rating: 1600 },
      points: 500,
    },
    {
      name: "Master Player",
      description: "Reach 1800 rating",
      icon: "💫",
      type: AchievementType.RATING_MILESTONE,
      requirements: { rating: 1800 },
      points: 750,
    },
    {
      name: "Win Streak",
      description: "Win 5 games in a row",
      icon: "🔥",
      type: AchievementType.WIN_STREAK,
      requirements: { winStreak: 5 },
      points: 200,
    },
    {
      name: "Dedication",
      description: "Play 100 games",
      icon: "💪",
      type: AchievementType.SPECIAL,
      requirements: { gamesPlayed: 100 },
      points: 400,
    },
  ];

  await prisma.achievement.createMany({ data: achievements });

  // 12. Create tournament chat messages
  console.log("💬 Creating tournament chat messages...");
  const chatMessages: any[] = [];

  for (const tournament of createdTournaments.slice(0, 10)) {
    // Add chat to first 10 tournaments
    const tournamentPlayers = await prisma.tournamentPlayer.findMany({
      where: { tournamentId: tournament.id },
      take: 5, // Get first 5 players
    });

    const sampleMessages = [
      "Good luck everyone! 🎮",
      "May the best player win! 💪",
      "Let's have a great tournament! 🏆",
      "Looking forward to some exciting matches! ⚡",
      "Best of luck to all participants! 🌟",
      "This should be an amazing tournament! 🎯",
      "Ready to give it my all! 🔥",
      "Great to see so many skilled players here! 👥",
      "Let's play fair and have fun! 🎲",
      "Tournament time! Let's do this! 🚀",
    ];

    for (let i = 0; i < Math.min(5, tournamentPlayers.length); i++) {
      const player = tournamentPlayers[i];
      const messageTime = randomDate(
        tournament.registrationStart,
        tournament.startDate
      );

      chatMessages.push({
        tournamentId: tournament.id,
        userId: player.userId,
        text: sampleMessages[Math.floor(Math.random() * sampleMessages.length)],
        createdAt: messageTime,
      });
    }
  }

  await prisma.tournamentChatMessage.createMany({ data: chatMessages });

  // Update tournament current players count
  console.log("📊 Updating tournament player counts...");
  for (const tournament of createdTournaments) {
    const playerCount = await prisma.tournamentPlayer.count({
      where: { tournamentId: tournament.id },
    });

    await prisma.tournament.update({
      where: { id: tournament.id },
      data: { currentPlayers: playerCount },
    });
  }

  console.log("✅ Comprehensive Zimbabwe gaming platform seeded successfully!");
  console.log(`📈 Created:`);
  console.log(`   - ${locations.length} Zimbabwe locations`);
  console.log(`   - ${institutions.length} institutions`);
  console.log(`   - ${mobileMoneyProviders.length} mobile money providers`);
  console.log(`   - ${createdGames.length} games`);
  console.log(`   - ${createdUsers.length} users`);
  console.log(`   - ${createdTournaments.length} tournaments`);
  console.log(`   - ${tournamentPlayers.length} tournament registrations`);
  console.log(`   - ${payments.length} payments`);
  console.log(`   - ${createdMatches.length} matches`);
  console.log(`   - ${gameStats.length} game statistics records`);
  console.log(`   - ${achievements.length} achievements`);
  console.log(`   - ${chatMessages.length} chat messages`);

  console.log("\n🎯 Tournament Status Summary:");
  const statusCounts = await prisma.tournament.groupBy({
    by: ["status"],
    _count: { status: true },
  });

  statusCounts.forEach(({ status, _count }) => {
    console.log(`   - ${status}: ${_count.status} tournaments`);
  });

  console.log("\n🎮 Ready for comprehensive testing!");
  console.log("   - Check tournaments starting soon for live testing");
  console.log("   - Multiple tournaments with players for bracket testing");
  console.log("   - Various tournament states for UI testing");
  console.log("   - Comprehensive user data for social features");
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
