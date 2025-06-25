import { Router } from "express";

const router = Router();

// Get all tournaments
router.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Tournaments endpoint - Coming soon",
    data: { tournaments: [] },
  });
});

export default router;
