// SVG files imported `with { loader: 'text' }` are bundled as their markup.
declare module '*.svg' {
  const markup: string;
  export default markup;
}
