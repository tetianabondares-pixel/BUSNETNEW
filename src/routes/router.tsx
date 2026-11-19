import { createBrowserRouter } from "react-router-dom";
import { RootLayout } from "@/components/layout";
import { HomePage } from "@/pages/HomePage";
import { BookingPage } from "@/pages/BookingPage";
import { AdminLoginPage } from "@/pages/admin/AdminLoginPage";
import { AdminDashboardPage } from "@/pages/admin/AdminDashboardPage";
import { PassengerAuthPage } from "@/pages/auth/PassengerAuthPage";

/**
 * MVP routes:
 *   /             — landing (hero + search widget)
 *   /booking      — booking stepper stub
 *   /admin/login  — admin login (separate, protected)
 *   /admin        — admin dashboard (separate, protected)
 */
export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "booking", element: <BookingPage /> },
      { path: "login", element: <PassengerAuthPage /> },
      { path: "register", element: <PassengerAuthPage /> },
      { path: "admin/login", element: <AdminLoginPage /> },
      { path: "admin", element: <AdminDashboardPage /> },
    ],
  },
]);
