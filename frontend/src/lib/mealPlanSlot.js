export const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export const MEALS = ["Breakfast", "Lunch", "Dinner"];

/** Resolve which day/meal slot a recipe should be assigned to. */
export function resolveAssignSlot(pendingSlot, activeDay, activeMeal) {
  if (pendingSlot?.day && pendingSlot?.meal) {
    return { day: pendingSlot.day, meal: pendingSlot.meal };
  }

  if (activeDay && activeMeal) {
    return { day: activeDay, meal: activeMeal };
  }

  return { day: DAYS[0], meal: MEALS[2] };
}

export function isValidMealPlanSlot(day, meal) {
  return DAYS.includes(day) && MEALS.includes(meal);
}
