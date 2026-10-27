import { LINKS } from './links';
import { plainText, type RichText } from './rich-text';

/** Why pre-data.txt may not give the same geometry in the official preprocessor. */
export const PRE_DATA_NOTE: RichText = [
  "pre-data.txt keeps the official 1.6 format, but this app's preprocessor fixes ",
  { text: 'suspected bugs', href: LINKS.preprocessorPatches },
  ' of the official one, not yet confirmed by its author: ' +
    'the official preprocessor may generate a different geometry from the same file.',
];

/** The note without its link, for a tooltip. */
export const PRE_DATA_NOTE_TEXT = plainText(PRE_DATA_NOTE);
