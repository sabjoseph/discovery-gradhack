const express = require("express");
const { handleChatAssistantRequest } = require("../services/chatAssistant");

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const result = await handleChatAssistantRequest(req.body || {});
    res.status(result.status).json(result.body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error";
    console.error("chat-assistant route error:", message);
    res.status(500).json({ error: message });
  }
});

module.exports = router;
