import React from "react";
import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { App } from "./app";
import "./index.css";

const container = document.getElementById("root");

if (!container) {
  throw new Error("Renderer root element was not found.");
}

createRoot(container).render(
  <React.StrictMode>
    <TooltipProvider delayDuration={120}>
      <App />
    </TooltipProvider>
  </React.StrictMode>
);
