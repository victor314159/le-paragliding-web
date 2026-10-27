/** Text with links, such as a dialog message. */
export type RichText = readonly (string | { readonly text: string; readonly href: string })[];

export function plainText(parts: RichText): string {
  return parts.map((part) => (typeof part === 'string' ? part : part.text)).join('');
}
