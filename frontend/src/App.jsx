import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { CustomerProvider } from "./context/CustomerContext";
import { ShoppingListProvider } from "./context/ShoppingListContext";
import { MealPlanProvider } from "./context/MealPlanContext";
import RequireCustomer from "./components/RequireCustomer";
import AppLayout from "./components/AppLayout";
import NamePicker from "./pages/NamePicker";
import Dashboard from "./pages/Dashboard";
import Purchases from "./pages/Purchases";
import Pantry from "./pages/Pantry";
import Recipes from "./pages/Recipes";
import RecipeDetail from "./pages/RecipeDetail";
import Recommendations from "./pages/Recommendations";
import Rewards from "./pages/Rewards";
import Profile from "./pages/Profile";

export default function App() {
  return (
    <CustomerProvider>
      <MealPlanProvider>
        <ShoppingListProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<NamePicker />} />
              <Route element={<RequireCustomer />}>
                <Route path="/app" element={<AppLayout />}>
                  <Route index element={<Dashboard />} />
                  <Route path="purchases" element={<Purchases />} />
                  <Route path="pantry" element={<Pantry />} />
                  <Route path="recipes" element={<Recipes />} />
                  <Route path="recipes/:id" element={<RecipeDetail />} />
                  <Route path="recommendations" element={<Recommendations />} />
                  <Route path="rewards" element={<Rewards />} />
                  <Route path="profile" element={<Profile />} />
                </Route>
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </ShoppingListProvider>
      </MealPlanProvider>
    </CustomerProvider>
  );
}
