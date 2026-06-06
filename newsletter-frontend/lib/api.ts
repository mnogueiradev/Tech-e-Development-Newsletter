/**
 * URL base da API. Em produção (Oracle Cloud), frontend e backend rodam no mesmo
 * domínio via Express — URL relativa (vazia) funciona automaticamente.
 * Defina NEXT_PUBLIC_API_URL apenas se API e frontend estiverem em hosts diferentes.
 */
export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || ""
).replace(/\/$/, "");

export const SUBSCRIBE_URL = `${API_BASE_URL}/subscribe`;
