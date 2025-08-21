import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting comprehensive seeding...");

  // Clear existing data
  await clearExistingData();

  // Create games
  const games = await createGames();
  console.log("✅ Games created");

  // Create users with different roles
  const users = await createUsers();
  console.log("✅ Users created");

  // Create tournaments
  const tournaments = await createTournaments(games, users);
  console.log("✅ Tournaments created");

  // Create tournament players
  await createTournamentPlayers(tournaments, users);
  console.log("✅ Tournament players created");

  // Create matches
  const matches = await createMatches(tournaments, users);
  console.log("✅ Matches created");

  // Create game statistics
  await createGameStatistics(users, games);
  console.log("✅ Game statistics created");

  // Create tournament social events
  await createTournamentEvents(tournaments, users);
  console.log("✅ Tournament events created");

  // Create tournament highlights
  await createTournamentHighlights(tournaments, users);
  console.log("✅ Tournament highlights created");

  // Create tournament spectators
  await createTournamentSpectators(tournaments, users);
  console.log("✅ Tournament spectators created");

  // Create user activities
  await createUserActivities(users);
  console.log("✅ User activities created");

  // Create flagged content
  await createFlaggedContent(users);
  console.log("✅ Flagged content created");

  // Create user moderations
  await createUserModerations(users);
  console.log("✅ User moderations created");

  // Create audit logs
  await createAuditLogs(users);
  console.log("✅ Audit logs created");

  // Create payments
  await createPayments(users, tournaments);
  console.log("✅ Payments created");

  console.log("🎉 Comprehensive seeding completed!");
}

async function clearExistingData() {
  const tables = [
    "audit_logs",
    "user_moderations",
    "flagged_content",
    "user_activities",
    "tournament_spectators",
    "tournament_highlights",
    "tournament_events",
    "game_statistics",
    "matches",
    "tournament_players",
    "payments",
    "tournaments",
    "users",
    "games",
  ];

  for (const table of tables) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE;`);
  }
}

async function createGames() {
  const gamesData = [
    {
      name: "Chess",
      description: "Strategic board game for two players",
      emoji: "♟️",
      minPlayers: 2,
      maxPlayers: 2,
      averageTimeMs: 900000, // 15 minutes
      rules: {
        timeControl: "10+0",
        format: "Standard",
        specialRules: [],
      },
      settings: {
        allowDraw: true,
        autoPromote: false,
        moveValidation: true,
      },
    },
    {
      name: "Checkers",
      description: "Classic draughts game",
      emoji: "🔴",
      minPlayers: 2,
      maxPlayers: 2,
      averageTimeMs: 600000, // 10 minutes
      rules: {
        timeControl: "5+0",
        format: "International",
        specialRules: ["King moves", "Multiple jumps"],
      },
      settings: {
        allowDraw: true,
        autoKing: true,
        moveValidation: true,
      },
    },
    {
      name: "Connect 4",
      description: "Four in a row strategy game",
      emoji: "🔵",
      minPlayers: 2,
      maxPlayers: 2,
      averageTimeMs: 300000, // 5 minutes
      rules: {
        timeControl: "3+0",
        format: "Standard",
        specialRules: ["Gravity effect"],
      },
      settings: {
        boardSize: "7x6",
        winCondition: 4,
        moveValidation: true,
      },
    },
    {
      name: "Tic-Tac-Toe",
      description: "Quick three in a row game",
      emoji: "❌",
      minPlayers: 2,
      maxPlayers: 2,
      averageTimeMs: 120000, // 2 minutes
      rules: {
        timeControl: "1+0",
        format: "Standard",
        specialRules: [],
      },
      settings: {
        boardSize: "3x3",
        winCondition: 3,
        moveValidation: true,
      },
    },
  ];

  const games = [];
  for (const gameData of gamesData) {
    const game = await prisma.game.create({
      data: gameData,
    });
    games.push(game);
  }

  return games;
}

async function createUsers() {
  const usersData = [
    // Admin users
    {
      email: "admin@nhandare.com",
      username: "admin",
      password: await hash("admin123", 12),
      firstName: "System",
      lastName: "Administrator",
      role: "super_admin",
      permissions: ["*"],
      isActive: true,
      isVerified: true,
      province: "Harare",
      city: "Harare",
      location: "Harare, Zimbabwe",
      phoneNumber: "+263771234567",
      ecocashNumber: "+263771234567",
      mobileMoneyProvider: "ECOCASH",
      preferredLanguage: "en",
      isStudent: false,
      institution: "Nhandare Gaming",
      points: 0,
      rank: 1,
      gamesPlayed: 0,
      gamesWon: 0,
      winRate: 0,
    },
    {
      email: "moderator@nhandare.com",
      username: "moderator",
      password: await hash("mod123", 12),
      firstName: "Content",
      lastName: "Moderator",
      role: "moderator",
      permissions: ["content:moderate", "user:moderate"],
      isActive: true,
      isVerified: true,
      province: "Bulawayo",
      city: "Bulawayo",
      location: "Bulawayo, Zimbabwe",
      phoneNumber: "+263772345678",
      ecocashNumber: "+263772345678",
      mobileMoneyProvider: "ECOCASH",
      preferredLanguage: "en",
      isStudent: false,
      institution: "Nhandare Gaming",
      points: 0,
      rank: 2,
      gamesPlayed: 0,
      gamesWon: 0,
      winRate: 0,
    },
    // Regular users
    {
      email: "chessmaster@nhandare.com",
      username: "ChessMaster2024",
      password: await hash("chess123", 12),
      firstName: "Tendai",
      lastName: "Moyo",
      role: "user",
      permissions: [],
      isActive: true,
      isVerified: true,
      province: "Harare",
      city: "Harare",
      location: "Harare, Zimbabwe",
      phoneNumber: "+263773456789",
      ecocashNumber: "+263773456789",
      mobileMoneyProvider: "ECOCASH",
      preferredLanguage: "en",
      isStudent: true,
      institution: "University of Zimbabwe",
      points: 2450,
      rank: 1,
      gamesPlayed: 156,
      gamesWon: 132,
      winRate: 84.6,
    },
    {
      email: "grandmaster@nhandare.com",
      username: "GrandmasterZim",
      password: await hash("grand123", 12),
      firstName: "Kudzi",
      lastName: "Zvourerenexo",
      role: "user",
      permissions: [],
      isActive: true,
      isVerified: true,
      province: "Manicaland",
      city: "Mutare",
      location: "Mutare, Zimbabwe",
      phoneNumber: "+263774567890",
      ecocashNumber: "+263774567890",
      mobileMoneyProvider: "ONEMONEY",
      preferredLanguage: "en",
      isStudent: false,
      institution: "Chess Academy",
      points: 2380,
      rank: 2,
      gamesPlayed: 142,
      gamesWon: 118,
      winRate: 83.1,
    },
    {
      email: "chesschampion@nhandare.com",
      username: "ChessChampion",
      password: await hash("champ123", 12),
      firstName: "Blessing",
      lastName: "Ndlovu",
      role: "user",
      permissions: [],
      isActive: true,
      isVerified: true,
      province: "Bulawayo",
      city: "Bulawayo",
      location: "Bulawayo, Zimbabwe",
      phoneNumber: "+263775678901",
      ecocashNumber: "+263775678901",
      mobileMoneyProvider: "ECOCASH",
      preferredLanguage: "sn",
      isStudent: true,
      institution: "National University of Science and Technology",
      points: 2310,
      rank: 3,
      gamesPlayed: 128,
      gamesWon: 105,
      winRate: 82.0,
    },
    {
      email: "zimbabwechess@nhandare.com",
      username: "ZimbabweChess",
      password: await hash("zim123", 12),
      firstName: "Tatenda",
      lastName: "Chingombe",
      role: "user",
      permissions: [],
      isActive: true,
      isVerified: true,
      province: "Mashonaland East",
      city: "Marondera",
      location: "Marondera, Zimbabwe",
      phoneNumber: "+263776789012",
      ecocashNumber: "+263776789012",
      mobileMoneyProvider: "TELECASH",
      preferredLanguage: "nd",
      isStudent: false,
      institution: "Chess Federation",
      points: 2250,
      rank: 4,
      gamesPlayed: 115,
      gamesWon: 92,
      winRate: 80.0,
    },
    {
      email: "chesspro@nhandare.com",
      username: "ChessPro",
      password: await hash("pro123", 12),
      firstName: "Farai",
      lastName: "Mukwena",
      role: "user",
      permissions: [],
      isActive: true,
      isVerified: true,
      province: "Harare",
      city: "Harare",
      location: "Harare, Zimbabwe",
      phoneNumber: "+263777890123",
      ecocashNumber: "+263777890123",
      mobileMoneyProvider: "ECOCASH",
      preferredLanguage: "en",
      isStudent: true,
      institution: "Harare Institute of Technology",
      points: 2180,
      rank: 5,
      gamesPlayed: 98,
      gamesWon: 78,
      winRate: 79.6,
    },
  ];

  const users = [];
  for (const userData of usersData) {
    const user = await prisma.user.create({
      data: userData,
    });
    users.push(user);
  }

  return users;
}

async function createTournaments(
  games: { id: string; name: string }[],
  users: any[]
) {
  const tournamentsData = [
    {
      title: "Zimbabwe Chess Championship 2024",
      description: "Annual national chess championship for all skill levels",
      prizePool: 5000.0,
      entryFee: 25.0,
      maxPlayers: 64,
      currentPlayers: 32,
      status: "ACTIVE" as any,
      province: "Harare",
      city: "Harare",
      location: "Harare, Zimbabwe",
      venue: "Harare International Conference Centre",
      isOnlineOnly: false,
      targetAudience: "open",
      category: "open",
      difficultyLevel: "advanced",
      prizeBreakdown: {
        "1st": 2000,
        "2nd": 1200,
        "3rd": 800,
        "4th": 500,
        "5th": 300,
        "6th": 200,
      },
      localCurrency: "USD",
      platformFeeRate: 0.2,
      registrationStart: new Date("2024-01-01"),
      registrationEnd: new Date("2024-01-15"),
      startDate: new Date("2024-01-20"),
      endDate: new Date("2024-01-25"),
      gameId: games.find((g) => g.name === "Chess")?.id || "",
      bracketType: "SINGLE_ELIMINATION" as any,
      bracket: {
        rounds: [
          {
            round: 1,
            matches: [
              {
                id: "match1",
                player1: "player1",
                player2: "player2",
                status: "completed",
              },
              {
                id: "match2",
                player1: "player3",
                player2: "player4",
                status: "completed",
              },
            ],
          },
        ],
        totalRounds: 6,
      },
    },
    {
      title: "Bulawayo Checkers Open",
      description: "Regional checkers tournament for Bulawayo players",
      prizePool: 1000.0,
      entryFee: 10.0,
      maxPlayers: 32,
      currentPlayers: 24,
      status: "ACTIVE",
      province: "Bulawayo",
      city: "Bulawayo",
      location: "Bulawayo, Zimbabwe",
      venue: "Bulawayo City Hall",
      isOnlineOnly: false,
      targetAudience: "regional",
      category: "open",
      difficultyLevel: "intermediate",
      prizeBreakdown: {
        "1st": 500,
        "2nd": 300,
        "3rd": 200,
      },
      localCurrency: "USD",
      platformFeeRate: 0.2,
      registrationStart: new Date("2024-01-05"),
      registrationEnd: new Date("2024-01-18"),
      startDate: new Date("2024-01-22"),
      endDate: new Date("2024-01-24"),
      gameId: games.find((g) => g.name === "Checkers")?.id || "",
      bracketType: "SWISS_SYSTEM",
      bracket: {
        rounds: [
          {
            round: 1,
            matches: [
              {
                id: "match1",
                player1: "player1",
                player2: "player2",
                status: "completed",
              },
            ],
          },
        ],
        totalRounds: 5,
      },
    },
    {
      title: "Student Connect 4 Challenge",
      description: "University students only - Connect 4 tournament",
      prizePool: 500.0,
      entryFee: 5.0,
      maxPlayers: 16,
      currentPlayers: 16,
      status: "ACTIVE",
      province: "Harare",
      city: "Harare",
      location: "Harare, Zimbabwe",
      venue: "University of Zimbabwe",
      isOnlineOnly: true,
      targetAudience: "university",
      category: "students",
      difficultyLevel: "beginner",
      prizeBreakdown: {
        "1st": 250,
        "2nd": 150,
        "3rd": 100,
      },
      localCurrency: "USD",
      platformFeeRate: 0.2,
      registrationStart: new Date("2024-01-10"),
      registrationEnd: new Date("2024-01-19"),
      startDate: new Date("2024-01-21"),
      endDate: new Date("2024-01-21"),
      gameId: games.find((g) => g.name === "Connect 4")?.id || "",
      bracketType: "SINGLE_ELIMINATION",
      bracket: {
        rounds: [
          {
            round: 1,
            matches: [
              {
                id: "match1",
                player1: "player1",
                player2: "player2",
                status: "completed",
              },
            ],
          },
        ],
        totalRounds: 4,
      },
    },
  ];

  const tournaments = [];
  for (const tournamentData of tournamentsData) {
    const tournament = await prisma.tournament.create({
      data: tournamentData,
    });
    tournaments.push(tournament);
  }

  return tournaments;
}

async function createTournamentPlayers(tournaments: any[], users: any[]) {
  const regularUsers = users.filter((u) => u.role === "user");

  for (const tournament of tournaments) {
    const playerCount = tournament.currentPlayers;
    const selectedUsers = regularUsers.slice(0, playerCount);

    for (let i = 0; i < selectedUsers.length; i++) {
      const user = selectedUsers[i];
      await prisma.tournamentPlayer.create({
        data: {
          userId: user.id,
          tournamentId: tournament.id,
          registeredAt: new Date(tournament.registrationStart),
          joinedAt: new Date(tournament.registrationStart),
          isActive: true,
          seedNumber: i + 1,
          currentRound: 1,
          isEliminated: false,
          placement: null,
          prizeWon: 0,
        },
      });
    }
  }
}

async function createMatches(tournaments: any[], users: any[]) {
  const chessGame = await prisma.game.findFirst({ where: { name: "Chess" } });
  const checkersGame = await prisma.game.findFirst({
    where: { name: "Checkers" },
  });
  const connect4Game = await prisma.game.findFirst({
    where: { name: "Connect 4" },
  });

  const matches = [];

  // Create some sample matches for each tournament
  for (const tournament of tournaments) {
    const players = await prisma.tournamentPlayer.findMany({
      where: { tournamentId: tournament.id },
      include: { user: true },
    });

    if (players.length >= 2) {
      for (let i = 0; i < Math.min(players.length - 1, 3); i++) {
        const match = await prisma.match.create({
          data: {
            player1Id: players[i].userId,
            player2Id: players[i + 1].userId,
            gameId: tournament.gameId,
            tournamentId: tournament.id,
            round: 1,
            status: "COMPLETED",
            result: i % 2 === 0 ? "PLAYER1_WIN" : "PLAYER2_WIN",
            gameData: {
              moves: ["e4", "e5", "Nf3", "Nc6"],
              finalPosition: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR",
            },
            duration: 1800, // 30 minutes
            createdAt: new Date(tournament.startDate),
            startedAt: new Date(tournament.startDate),
            finishedAt: new Date(tournament.startDate.getTime() + 1800000),
          },
        });
        matches.push(match);
      }
    }
  }

  return matches;
}

async function createGameStatistics(users: any[], games: any[]) {
  const regularUsers = users.filter((u) => u.role === "user");

  for (const user of regularUsers) {
    for (const game of games) {
      const gamesPlayed = Math.floor(Math.random() * 50) + 20;
      const gamesWon = Math.floor(gamesPlayed * (user.winRate / 100));
      const gamesLost = gamesPlayed - gamesWon;
      const gamesDrawn = Math.floor(Math.random() * 5);
      const totalPlayTime = gamesPlayed * (game.averageTimeMs / 1000);
      const currentRating = user.points + Math.floor(Math.random() * 200) - 100;
      const peakRating = currentRating + Math.floor(Math.random() * 100);

      await prisma.gameStatistic.create({
        data: {
          userId: user.id,
          gameId: game.id,
          gamesPlayed,
          gamesWon,
          gamesLost,
          gamesDrawn,
          winRate: (gamesWon / gamesPlayed) * 100,
          averageScore: gamesWon * 3 + gamesDrawn * 1,
          bestScore: gamesWon * 3,
          totalPlayTime: Math.floor(totalPlayTime),
          currentRating,
          peakRating,
        },
      });
    }
  }
}

async function createTournamentEvents(tournaments: any[], users: any[]) {
  const regularUsers = users.filter((u) => u.role === "user");

  for (const tournament of tournaments) {
    const players = await prisma.tournamentPlayer.findMany({
      where: { tournamentId: tournament.id },
      include: { user: true },
    });

    // Create player joined events
    for (const player of players.slice(0, 5)) {
      await prisma.tournamentEvent.create({
        data: {
          tournamentId: tournament.id,
          userId: player.userId,
          type: "player_joined",
          message: "joined the tournament",
          metadata: {
            playerName: player.user.username,
            timestamp: player.joinedAt,
          },
        },
      });
    }

    // Create match result events
    const matches = await prisma.match.findMany({
      where: { tournamentId: tournament.id },
    });

    for (const match of matches.slice(0, 3)) {
      const winner =
        match.result === "PLAYER1_WIN" ? match.player1Id : match.player2Id;
      const loser =
        match.result === "PLAYER1_WIN" ? match.player2Id : match.player1Id;

      await prisma.tournamentEvent.create({
        data: {
          tournamentId: tournament.id,
          userId: winner,
          type: "match_result",
          message: "defeated",
          metadata: {
            opponent: users.find((u) => u.id === loser)?.username,
            score: "1-0",
            matchId: match.id,
          },
        },
      });
    }

    // Create round advancement events
    if (tournament.bracketType === "SINGLE_ELIMINATION") {
      await prisma.tournamentEvent.create({
        data: {
          tournamentId: tournament.id,
          userId: players[0].userId,
          type: "round_advanced",
          message: "advanced to Round 2",
          metadata: {
            round: 2,
            previousRound: 1,
          },
        },
      });
    }
  }
}

async function createTournamentHighlights(tournaments: any[], users: any[]) {
  const regularUsers = users.filter((u) => u.role === "user");

  for (const tournament of tournaments) {
    const players = await prisma.tournamentPlayer.findMany({
      where: { tournamentId: tournament.id },
      include: { user: true },
    });

    // Create highlights for top players
    for (let i = 0; i < Math.min(players.length, 3); i++) {
      const player = players[i];
      const achievements = [
        "Perfect Game",
        "Comeback Victory",
        "Quick Win",
        "Strategic Masterpiece",
        "Endgame Excellence",
      ];

      await prisma.tournamentHighlight.create({
        data: {
          tournamentId: tournament.id,
          userId: player.userId,
          achievement: achievements[i % achievements.length],
          description: `${achievements[i % achievements.length]} in Round ${
            i + 1
          }`,
        },
      });
    }
  }
}

async function createTournamentSpectators(tournaments: any[], users: any[]) {
  const regularUsers = users.filter((u) => u.role === "user");

  for (const tournament of tournaments) {
    const playerCount = tournament.currentPlayers;
    const spectatorCount = Math.floor(playerCount * 0.3); // 30% of players are spectators

    for (let i = 0; i < spectatorCount; i++) {
      const user = regularUsers[i % regularUsers.length];
      await prisma.tournamentSpectator.create({
        data: {
          tournamentId: tournament.id,
          userId: user.id,
          joinedAt: new Date(tournament.startDate),
          leftAt: null,
          isActive: true,
        },
      });
    }
  }
}

async function createUserActivities(users: any[]) {
  const regularUsers = users.filter((u) => u.role === "user");

  for (const user of regularUsers) {
    // Login activities
    for (let i = 0; i < 5; i++) {
      await prisma.userActivity.create({
        data: {
          userId: user.id,
          activityType: "login",
          description: "User logged in",
          ipAddress: `192.168.1.${i + 1}`,
          userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          metadata: {
            location: user.location,
            device: "desktop",
          },
        },
      });
    }

    // Game activities
    for (let i = 0; i < 3; i++) {
      await prisma.userActivity.create({
        data: {
          userId: user.id,
          activityType: "game_played",
          description: "Played chess game against opponent",
          ipAddress: `192.168.1.${i + 1}`,
          userAgent:
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          metadata: {
            gameType: "chess",
            result: i % 2 === 0 ? "win" : "loss",
            opponent: regularUsers[(i + 1) % regularUsers.length].username,
          },
        },
      });
    }

    // Tournament activities
    await prisma.userActivity.create({
      data: {
        userId: user.id,
        activityType: "tournament_joined",
        description: "Joined weekend chess tournament",
        ipAddress: "192.168.1.10",
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        metadata: {
          tournamentId: "tour_123",
          tournamentName: "Weekend Chess Championship",
        },
      },
    });
  }
}

async function createFlaggedContent(users: any[]) {
  const regularUsers = users.filter((u) => u.role === "user");
  const adminUsers = users.filter(
    (u) => u.role === "admin" || u.role === "moderator"
  );

  const flaggedContentData = [
    {
      contentType: "message",
      contentId: "msg_123",
      reporterId: regularUsers[0].id,
      reason: "inappropriate_content",
      severity: "medium",
      status: "pending",
      moderatorId: null,
      reviewedAt: null,
      notes: null,
    },
    {
      contentType: "profile",
      contentId: "profile_456",
      reporterId: regularUsers[1].id,
      reason: "spam",
      severity: "low",
      status: "reviewed",
      moderatorId: adminUsers[0].id,
      reviewedAt: new Date(),
      notes: "Profile contains excessive promotional content",
    },
    {
      contentType: "tournament_description",
      contentId: "tour_789",
      reporterId: regularUsers[2].id,
      reason: "offensive_language",
      severity: "high",
      status: "reviewed",
      moderatorId: adminUsers[0].id,
      reviewedAt: new Date(),
      notes: "Tournament description contains inappropriate language",
    },
  ];

  for (const contentData of flaggedContentData) {
    await prisma.flaggedContent.create({
      data: contentData,
    });
  }
}

async function createUserModerations(users: any[]) {
  const regularUsers = users.filter((u) => u.role === "user");
  const adminUsers = users.filter(
    (u) => u.role === "admin" || u.role === "moderator"
  );

  const moderationData = [
    {
      userId: regularUsers[0].id,
      moderatorId: adminUsers[0].id,
      action: "warn",
      reason: "Minor rule violation",
      duration: null,
      expiresAt: null,
      isActive: true,
      notes: "First warning for inappropriate language",
    },
    {
      userId: regularUsers[1].id,
      moderatorId: adminUsers[0].id,
      action: "suspend",
      reason: "Repeated violations",
      duration: 7,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      isActive: true,
      notes: "7-day suspension for multiple rule violations",
    },
  ];

  for (const moderationItem of moderationData) {
    await prisma.userModeration.create({
      data: moderationItem,
    });
  }
}

async function createAuditLogs(users: any[]) {
  const adminUsers = users.filter(
    (u) => u.role === "admin" || u.role === "moderator"
  );

  const auditData = [
    {
      userId: adminUsers[0].id,
      targetType: "user",
      targetId: users[3].id,
      action: "status_changed",
      previousValue: { status: "active" },
      newValue: { status: "suspended" },
      reason: "User moderation action",
      ipAddress: "192.168.1.100",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    {
      userId: adminUsers[0].id,
      targetType: "tournament",
      targetId: "tour_123",
      action: "created",
      previousValue: null,
      newValue: { title: "New Tournament", status: "open" },
      reason: "Tournament creation",
      ipAddress: "192.168.1.100",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  ];

  for (const auditItem of auditData) {
    await prisma.auditLog.create({
      data: auditItem,
    });
  }
}

async function createPayments(users: any[], tournaments: any[]) {
  const regularUsers = users.filter((u) => u.role === "user");

  for (const tournament of tournaments) {
    const players = await prisma.tournamentPlayer.findMany({
      where: { tournamentId: tournament.id },
      include: { user: true },
    });

    // Create entry fee payments
    for (const player of players) {
      await prisma.payment.create({
        data: {
          userId: player.userId,
          tournamentId: tournament.id,
          amount: tournament.entryFee,
          currency: tournament.localCurrency,
          type: "ENTRY_FEE",
          status: "COMPLETED",
          pesePayTransactionId: `pese_${Date.now()}_${player.userId}`,
          pesePayReference: `ref_${tournament.id}_${player.userId}`,
          paymentMethodCode: "ECOCASH",
          mobileMoneyNumber: player.user.ecocashNumber,
          paymentInitiatedAt: new Date(tournament.registrationStart),
          paymentConfirmedAt: new Date(tournament.registrationStart),
          exchangeRate: 1.0,
          localAmount: tournament.entryFee,
          localCurrency: tournament.localCurrency,
          metadata: {
            tournamentTitle: tournament.title,
            playerUsername: player.user.username,
          },
        },
      });
    }

    // Create prize payments for top players
    const prizeBreakdown = tournament.prizeBreakdown as any;
    for (
      let i = 0;
      i < Math.min(players.length, Object.keys(prizeBreakdown).length);
      i++
    ) {
      const placement = i + 1;
      const prizeKey = Object.keys(prizeBreakdown)[i];
      const prizeAmount = prizeBreakdown[prizeKey];

      if (prizeAmount > 0) {
        await prisma.payment.create({
          data: {
            userId: players[i].userId,
            tournamentId: tournament.id,
            amount: prizeAmount,
            currency: tournament.localCurrency,
            type: "PRIZE_PAYOUT",
            status: "COMPLETED",
            pesePayTransactionId: `pese_prize_${Date.now()}_${
              players[i].userId
            }`,
            pesePayReference: `ref_prize_${tournament.id}_${players[i].userId}`,
            paymentMethodCode: "ECOCASH",
            mobileMoneyNumber: players[i].user.ecocashNumber,
            paymentInitiatedAt: new Date(tournament.endDate || new Date()),
            paymentConfirmedAt: new Date(tournament.endDate || new Date()),
            exchangeRate: 1.0,
            localAmount: prizeAmount,
            localCurrency: tournament.localCurrency,
            metadata: {
              tournamentTitle: tournament.title,
              placement,
              prizeType: prizeKey,
            },
          },
        });
      }
    }
  }
}

main()
  .catch((e) => {
    console.error("❌ Seeding failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
