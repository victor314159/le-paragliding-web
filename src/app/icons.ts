import { inject } from '@angular/core';
import { MatIconRegistry } from '@angular/material/icon';
import { DomSanitizer } from '@angular/platform-browser';
import architecture from '@material-symbols/svg-400/outlined/architecture.svg' with {
  loader: 'text',
};
import darkMode from '@material-symbols/svg-400/outlined/dark_mode.svg' with { loader: 'text' };
import close from '@material-symbols/svg-400/outlined/close.svg' with { loader: 'text' };
import deleteIcon from '@material-symbols/svg-400/outlined/delete.svg' with { loader: 'text' };
import description from '@material-symbols/svg-400/outlined/description.svg' with {
  loader: 'text',
};
import download from '@material-symbols/svg-400/outlined/download.svg' with { loader: 'text' };
import edit from '@material-symbols/svg-400/outlined/edit.svg' with { loader: 'text' };
import error from '@material-symbols/svg-400/outlined/error.svg' with { loader: 'text' };
import fitScreen from '@material-symbols/svg-400/outlined/fit_screen.svg' with { loader: 'text' };
import history from '@material-symbols/svg-400/outlined/history.svg' with { loader: 'text' };
import lightMode from '@material-symbols/svg-400/outlined/light_mode.svg' with { loader: 'text' };
import moreVert from '@material-symbols/svg-400/outlined/more_vert.svg' with { loader: 'text' };
import restartAlt from '@material-symbols/svg-400/outlined/restart_alt.svg' with { loader: 'text' };
import terminal from '@material-symbols/svg-400/outlined/terminal.svg' with { loader: 'text' };
import tune from '@material-symbols/svg-400/outlined/tune.svg' with { loader: 'text' };
import upload from '@material-symbols/svg-400/outlined/upload.svg' with { loader: 'text' };
import viewInAr from '@material-symbols/svg-400/outlined/view_in_ar.svg' with { loader: 'text' };
import visibility from '@material-symbols/svg-400/outlined/visibility.svg' with { loader: 'text' };

// Material Symbols bundled at build time: no icon font and no network request.
const ICONS = {
  architecture,
  close,
  dark_mode: darkMode,
  delete: deleteIcon,
  description,
  download,
  edit,
  error,
  fit_screen: fitScreen,
  history,
  light_mode: lightMode,
  more_vert: moreVert,
  restart_alt: restartAlt,
  terminal,
  tune,
  upload,
  view_in_ar: viewInAr,
  visibility,
};

/** Registers the app's icons for `<mat-icon svgIcon="name" />`. */
export function registerIcons(): void {
  const registry = inject(MatIconRegistry);
  const sanitizer = inject(DomSanitizer);
  for (const [name, svg] of Object.entries(ICONS)) {
    // Trusted: the markup comes from a pinned package, not from user input.
    registry.addSvgIconLiteral(name, sanitizer.bypassSecurityTrustHtml(svg));
  }
}
