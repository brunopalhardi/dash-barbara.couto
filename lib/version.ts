/**
 * Versão visível no canto inferior da sidebar.
 *
 * - VERSION vem do package.json (semantic versioning, bump manual).
 * - COMMIT_SHA vem do Vercel automaticamente. Em dev mostra "dev".
 */
import pkg from "../package.json";

export const VERSION = pkg.version;

export const COMMIT_SHA =
  process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev";
