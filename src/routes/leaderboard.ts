import { Router } from "express";

const router = Router();

// Get leaderboard
router.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Leaderboard endpoint - Coming soon",
    data: { leaderboard: [] },
  });
});

export default router;
