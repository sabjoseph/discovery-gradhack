import assert from "node:assert/strict";
import { resolveAssignSlot, isValidMealPlanSlot } from "../src/lib/mealPlanSlot.js";

const wedBreakfast = resolveAssignSlot(
  { day: "Wednesday", meal: "Breakfast" },
  "Monday",
  "Dinner"
);
assert.equal(wedBreakfast.day, "Wednesday");
assert.equal(wedBreakfast.meal, "Breakfast");

const friDinner = resolveAssignSlot(null, "Friday", "Dinner");
assert.equal(friDinner.day, "Friday");
assert.equal(friDinner.meal, "Dinner");

const pendingWins = resolveAssignSlot(
  { day: "Thursday", meal: "Lunch" },
  "Monday",
  "Breakfast"
);
assert.equal(pendingWins.day, "Thursday");
assert.equal(pendingWins.meal, "Lunch");

assert.equal(isValidMealPlanSlot("Wednesday", "Dinner"), true);
assert.equal(isValidMealPlanSlot("Monday", "Brunch"), false);

console.log("mealPlanSlot tests passed");
