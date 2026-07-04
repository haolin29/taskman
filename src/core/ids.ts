export function shortId(id: string | undefined): string {
  return id ? id.slice(0, 8) : '';
}
