/** Selection is restricted to bodies computed for the current chart. */
export function nextPlanetSelection(bodies: readonly {id:string}[], current: string | null, candidate: string): string | null {
  if (!bodies.some(body => body.id === candidate)) return current;
  return candidate === current ? null : candidate;
}