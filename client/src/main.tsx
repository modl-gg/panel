import { createRoot } from "react-dom/client";
import './lib/i18n';
import App from "./App";
import "./index.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { ThemeProvider } from "next-themes";
import { Router } from "wouter"; // Import Router from wouter

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <Router> {/* Wrap App with Router */}
        <App />
      </Router>
    </ThemeProvider>
  </QueryClientProvider>
);
