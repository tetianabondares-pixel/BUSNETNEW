import { RouterProvider } from "react-router-dom";
import { ThemeProvider } from "@/theme";
import { router } from "@/routes/router";
import "@/i18n";

export function App() {
  return (
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  );
}
