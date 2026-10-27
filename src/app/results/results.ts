import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import {
  MatCard,
  MatCardContent,
  MatCardHeader,
  MatCardSubtitle,
  MatCardTitle,
} from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import {
  MatCell,
  MatCellDef,
  MatColumnDef,
  MatHeaderCell,
  MatHeaderCellDef,
  MatHeaderRow,
  MatHeaderRowDef,
  MatRow,
  MatRowDef,
  MatTable,
} from '@angular/material/table';
import { MatTooltip } from '@angular/material/tooltip';
import { ComputeService, type ResultFile } from '../compute/compute.service';
import { ByteSizePipe } from '../shared/byte-size.pipe';
import { FULL_PAGE_DIALOG } from '../shared/full-page-dialog';

type FileKind = '2d' | '3d' | 'report' | 'log';

/** What a file contains, shown as a leading icon; its label is the icon's tooltip. */
const KINDS: Record<FileKind, { icon: string; label: string }> = {
  '2d': { icon: 'architecture', label: '2D drawing' },
  '3d': { icon: 'view_in_ar', label: '3D model' },
  report: { icon: 'description', label: 'Report' },
  log: { icon: 'terminal', label: 'Log' },
};

const KNOWN_FILES = new Map<string, [FileKind, string]>([
  ['leparagliding.dxf', ['2d', '2D cutting patterns for panels, ribs and reinforcements.']],
  ['lep-3d.dxf', ['3d', '3D wing geometry and line layout.']],
  ['lep-3d-surfaces.dxf', ['3d', 'Triangulated 3D wing surfaces in CAD format.']],
  [
    'lep-out.txt',
    ['report', 'Detailed calculation report: geometry, lines and design parameters.'],
  ],
  ['leparagliding.txt', ['report', 'Input geometry and parameters used for this calculation.']],
  ['lines.txt', ['report', 'Line lengths, labels, types and material totals.']],
  ['run-log.txt', ['log', 'Engine run summary and input processing steps.']],
  ['stdout.log', ['log', 'Console output recorded during the calculation.']],
  ['stderr.log', ['log', 'Engine error output, if any.']],
  ['stl/lep-3d-surfaces.stl', ['3d', 'Triangulated 3D mesh of the wing surfaces.']],
  ['stl/Upper-surface.stl', ['3d', '3D mesh of the upper wing surface (extrados).']],
  ['stl/Lower-surface.stl', ['3d', '3D mesh of the lower wing surface (intrados).']],
  ['stl/Vents-surface.stl', ['3d', '3D mesh of the air inlet surfaces.']],
  ['stl/lep-3d-surfaces.scad', ['3d', 'Wing surface geometry for OpenSCAD.']],
]);

function describe(name: string): [FileKind, string] {
  const known = KNOWN_FILES.get(name);
  if (known) return known;
  if (name.startsWith('xflr5/')) {
    if (name.endsWith('.dat'))
      return ['2d', 'Airfoil coordinates for aerodynamic analysis in XFLR5.'];
    if (name.endsWith('.xwimp')) return ['3d', 'Wing geometry for import into XFLR5.'];
  }
  return ['report', 'Additional file produced by the calculation.'];
}

/** The generated files, to preview or download one by one or all at once. */
@Component({
  selector: 'app-results',
  imports: [
    ByteSizePipe,
    DecimalPipe,
    MatButton,
    MatIconButton,
    MatCard,
    MatCardContent,
    MatCardHeader,
    MatCardSubtitle,
    MatCardTitle,
    MatIcon,
    MatTable,
    MatColumnDef,
    MatHeaderCellDef,
    MatHeaderCell,
    MatCellDef,
    MatCell,
    MatHeaderRowDef,
    MatHeaderRow,
    MatRowDef,
    MatRow,
    MatTooltip,
  ],
  templateUrl: './results.html',
  styleUrl: './results.css',
  host: { role: 'region', 'aria-labelledby': 'results-title' },
})
export class Results {
  protected readonly compute = inject(ComputeService);
  private readonly dialog = inject(MatDialog);
  protected readonly columns = ['name', 'actions'];
  protected readonly files = computed(() =>
    this.compute.files().map((file) => {
      const [kind, description] = describe(file.name);
      return { ...file, description, ...KINDS[kind] };
    }),
  );
  protected readonly zipping = signal(false);
  protected readonly trackByName = (_: number, file: ResultFile): string => file.name;

  protected async preview(file: ResultFile): Promise<void> {
    const { FilePreviewDialog } = await import('./file-preview-dialog');
    this.dialog.open(FilePreviewDialog, { ...FULL_PAGE_DIALOG, data: file });
  }

  protected async downloadZip(): Promise<void> {
    if (this.zipping()) return;
    this.zipping.set(true);
    try {
      await this.compute.downloadZip();
    } catch (error: unknown) {
      console.error('Could not build the zip archive.', error);
    } finally {
      this.zipping.set(false);
    }
  }
}
