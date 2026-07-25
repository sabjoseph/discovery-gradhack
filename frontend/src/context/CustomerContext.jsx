import { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "bitebetter_customer";

const CustomerContext = createContext(null);

export function CustomerProvider({ children }) {
  const [customer, setCustomerState] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed?.id && !parsed?.token) return null;
      return parsed;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (customer?.id && customer?.token) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(customer));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [customer]);

  const value = useMemo(
    () => ({
      customer,
      customerId: customer?.id ?? null,
      sessionToken: customer?.token ?? null,
      setCustomer: (next) => setCustomerState(next),
      clearCustomer: () => setCustomerState(null),
    }),
    [customer]
  );

  return (
    <CustomerContext.Provider value={value}>{children}</CustomerContext.Provider>
  );
}

export function useCustomer() {
  const ctx = useContext(CustomerContext);
  if (!ctx) throw new Error("useCustomer must be used within CustomerProvider");
  return ctx;
}
