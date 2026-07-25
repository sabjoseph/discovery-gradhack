import { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "bitebetter_shopping_list";

const ShoppingListContext = createContext(null);

export function ShoppingListProvider({ children }) {
  const [items, setItems] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const value = useMemo(
    () => ({
      items,
      addMissing: (recipeName, missing = []) => {
        setItems((prev) => {
          const next = [...prev];
          for (const ing of missing) {
            const key = `${ing.name}|${ing.quantity ?? ""}|${ing.unit ?? ""}`;
            if (next.some((row) => row.key === key)) continue;
            next.push({
              key,
              name: ing.name,
              quantity: ing.quantity,
              unit: ing.unit,
              recipeName,
              addedAt: new Date().toISOString(),
            });
          }
          return next;
        });
      },
      removeItem: (key) => setItems((prev) => prev.filter((row) => row.key !== key)),
      clear: () => setItems([]),
      pruneClearedRecipes: (
        clearedRecipeNames = [],
        remainingRecipeNames = [],
        neededKeys = []
      ) => {
        const cleared = new Set(clearedRecipeNames);
        const remaining = new Set(remainingRecipeNames);
        const keys = new Set(neededKeys);
        setItems((prev) =>
          prev.filter((item) => {
            if (keys.has(item.key)) return true;
            if (remaining.has(item.recipeName)) return true;
            if (cleared.has(item.recipeName)) return false;
            return true;
          })
        );
      },
    }),
    [items]
  );

  return (
    <ShoppingListContext.Provider value={value}>
      {children}
    </ShoppingListContext.Provider>
  );
}

export function useShoppingList() {
  const ctx = useContext(ShoppingListContext);
  if (!ctx) {
    throw new Error("useShoppingList must be used within ShoppingListProvider");
  }
  return ctx;
}
