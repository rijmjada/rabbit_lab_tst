import { engineApi } from "./engine";

/**
 * Antes esta app hablaba por HTTP con un backend Spring Boot real
 * (ver `ARQUITECTURA.md`). Ahora `engineApi` (en `lib/engine/`) simula el
 * mismo comportamiento 100% en el navegador — mismo objeto `api`, mismos
 * 6 métodos, mismas firmas — así que ningún hook ni componente que
 * importa `api` desde aquí necesitó cambiar un solo carácter.
 */
export const api = engineApi;
