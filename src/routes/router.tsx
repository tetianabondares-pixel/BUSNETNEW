import { createBrowserRouter } from "react-router-dom";
import { RootLayout } from "@/components/layout";
import { HomePage } from "@/pages/HomePage";
import { BookingPage } from "@/pages/BookingPage";
import { AdminLoginPage } from "@/pages/admin/AdminLoginPage";
import { AdminDashboardPage } from "@/pages/admin/AdminDashboardPage";
import { PassengerAuthPage } from "@/pages/auth/PassengerAuthPage";
import { PassengerAccountPage } from "@/pages/account/PassengerAccountPage";
import { RequirePassengerAuth } from "./RequirePassengerAuth";
import { RequireAdminAuth } from "./RequireAdminAuth";

/**
 * MVP routes:
 *   /             — landing (hero + search widget)
 *   /admin/login  — admin login (separate, protected)
 *   /admin        — admin dashboard (separate, protected)
 */
export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "booking", element: <BookingPage /> },
      { path: "account", element: <RequirePassengerAuth><PassengerAccountPage /></RequirePassengerAuth> },
      { path: "auth", element: <PassengerAuthPage /> },
      { path: "login", element: <PassengerAuthPage /> },
      { path: "register", element: <PassengerAuthPage /> },
    ],
  },
  { path: "admin/login", element: <AdminLoginPage /> },
  { path: "admin", element: <RequireAdminAuth><AdminDashboardPage /></RequireAdminAuth> },
  { path: "admin/bookings", element: <RequireAdminAuth><AdminDashboardPage /></RequireAdminAuth> },
  { path: "admin/passengers", element: <RequireAdminAuth><AdminDashboardPage /></RequireAdminAuth> },
  { path: "admin/cancellations", element: <RequireAdminAuth><AdminDashboardPage /></RequireAdminAuth> },
  { path: "admin/catalog", element: <RequireAdminAuth><AdminDashboardPage /></RequireAdminAuth> },
  { path: "admin/routes", element: <RequireAdminAuth><AdminDashboardPage /></RequireAdminAuth> },
  { path: "admin/locations", element: <RequireAdminAuth><AdminDashboardPage /></RequireAdminAuth> },
  { path: "admin/popular-routes", element: <RequireAdminAuth><AdminDashboardPage /></RequireAdminAuth> },
  { path: "admin/content", element: <RequireAdminAuth><AdminDashboardPage /></RequireAdminAuth> },
  { path: "admin/audit", element: <RequireAdminAuth><AdminDashboardPage /></RequireAdminAuth> },
  { path: "admin/settings", element: <RequireAdminAuth><AdminDashboardPage /></RequireAdminAuth> },
]);
