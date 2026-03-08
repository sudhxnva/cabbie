export function ts(): string {
  return new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
}
