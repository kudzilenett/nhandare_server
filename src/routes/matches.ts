import { Router } from "express";

const router = Router();

// Get all matches
router.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Matches endpoint - Coming soon",
    data: { matches: [] },
  });
});

export default router;
