const express = require("express");
const cors = require("cors");

const customersRouter = require("./routes/customers");
const purchasesRouter = require("./routes/purchases");
const pantryRouter = require("./routes/pantry");
const recipesRouter = require("./routes/recipes");
const dashboardRouter = require("./routes/dashboard");
const recommendationsRouter = require("./routes/recommendations");
const milestonesRouter = require("./routes/milestones");
const profileRouter = require("./routes/profile");
const analyticsRouter = require("./routes/analytics");
const rewardsRouter = require("./routes/rewards");

const app = express();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "BiteBetter API is running!",
    version: "1.0.0",
  });
});

app.use("/api/customers", customersRouter);
app.use("/api/purchases", purchasesRouter);
app.use("/api/pantry", pantryRouter);
app.use("/api/recipes", recipesRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/recommendations", recommendationsRouter);
app.use("/api/milestones", milestonesRouter);
app.use("/api/profile", profileRouter);
app.use("/api/analytics", analyticsRouter);
app.use("/api/rewards", rewardsRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, message: "Internal server error" });
});

module.exports = app;
