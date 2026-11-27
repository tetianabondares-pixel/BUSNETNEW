import { RouterProvider } from "react-router-dom";
import { ThemeProvider } from "@/theme";
import { router } from "@/routes/router";
import "@/i18n";
import { DeleteExperienceProvider } from "@/components/GlobalDeleteExperience";

export function App() {
  return (
    <ThemeProvider defaultMode="light">
      <DeleteExperienceProvider>
        <RouterProvider router={router} />
      </DeleteExperienceProvider>
    </ThemeProvider>
  );
}
