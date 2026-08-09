import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

// Nota: se evita <StrictMode> a propósito. Esta app crea infraestructura
// real en RabbitMQ al montar cada pantalla, y el doble montaje que hace
// StrictMode en desarrollo generaría escenarios duplicados.
createRoot(document.getElementById("root")!).render(<App />);

