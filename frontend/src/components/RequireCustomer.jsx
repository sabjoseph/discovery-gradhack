import { Navigate, Outlet } from "react-router-dom";
import { useCustomer } from "../context/CustomerContext";

export default function RequireCustomer() {
  const { customer } = useCustomer();
  if (!customer?.id) return <Navigate to="/" replace />;
  return <Outlet />;
}
