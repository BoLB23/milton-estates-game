/**
 * Resolves an asset below Vite's public directory without assuming the game is
 * hosted at the domain root. `BASE_URL` is `/` in dev and `./` in this
 * project's production build, but can also be configured for a subpath host.
 */
export function assetUrl(path: string): string {
  const relativePath = path.replace(/^\/+/, "");
  return `${import.meta.env.BASE_URL}${relativePath}`;
}
