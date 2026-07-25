import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useCustomer } from "./CustomerContext";

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

function emptyWeek() {
  return Object.fromEntries(
    DAYS.map((day) => [day, Object.fromEntries(MEALS.map((meal) => [meal, null]))])
  );
}

const MealPlanContext = createContext(null);

export function MealPlanProvider({ children }) {
  const { customerId } = useCustomer();
  const storageKey = customerId
    ? `bitebetter_meal_plan_${customerId}`
    : "bitebetter_meal_plan";

  const [plan, setPlan] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? { ...emptyWeek(), ...JSON.parse(raw) } : emptyWeek();
    } catch {
      return emptyWeek();
    }
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setPlan(raw ? { ...emptyWeek(), ...JSON.parse(raw) } : emptyWeek());
    } catch {
      setPlan(emptyWeek());
    }
  }, [storageKey]);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(plan));
  }, [plan, storageKey]);

  const value = useMemo(
    () => ({
      plan,
      assignRecipe: (day, meal, recipe) => {
        setPlan((prev) => ({
          ...prev,
          [day]: {
            ...prev[day],
            [meal]: recipe
              ? {
                  id: recipe.id,
                  name: recipe.name,
                  prepTimeMinutes: recipe.prepTimeMinutes,
                  servings: recipe.servings,
                  matchPercent: recipe.matchPercent,
                  source: recipe.source,
                }
              : null,
          },
        }));
      },
      clearSlot: (day, meal) => {
        setPlan((prev) => ({
          ...prev,
          [day]: { ...prev[day], [meal]: null },
        }));
      },
      clearDay: (day) => {
        setPlan((prev) => ({
          ...prev,
          [day]: Object.fromEntries(MEALS.map((meal) => [meal, null])),
        }));
      },
      clearWeek: () => setPlan(emptyWeek()),
    }),
    [plan]
  );

  return (
    <MealPlanContext.Provider value={value}>{children}</MealPlanContext.Provider>
  );
}

export function useMealPlan() {
  const ctx = useContext(MealPlanContext);
  if (!ctx) throw new Error("useMealPlan must be used within MealPlanProvider");
  return ctx;
}
