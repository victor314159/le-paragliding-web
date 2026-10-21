import {
  Component,
  computed,
  inject,
  type OnInit,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import {
  MatCard,
  MatCardActions,
  MatCardContent,
  MatCardHeader,
  MatCardSubtitle,
  MatCardTitle,
} from '@angular/material/card';
import { MatChip } from '@angular/material/chips';
import { MatDialog } from '@angular/material/dialog';
import { MatDivider } from '@angular/material/divider';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import {
  MatList,
  MatListItem,
  MatListItemLine,
  MatListItemMeta,
  MatListItemTitle,
} from '@angular/material/list';
import { MatMenu, MatMenuContent, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatProgressBar } from '@angular/material/progress-bar';
import { MatOption, MatSelect } from '@angular/material/select';
import { MatTooltip } from '@angular/material/tooltip';
import { ComputeService } from '../compute/compute.service';
import { DesignFilesService, type InputFile, MAIN_FILE } from './design-files.service';
import { DESIGNS } from './designs';
import type { FileEditorData } from './file-editor-dialog';

/** The input card: pick an example or import files, then edit them. */
@Component({
  selector: 'app-design-input',
  imports: [
    MatButton,
    MatIconButton,
    MatCard,
    MatCardActions,
    MatCardContent,
    MatCardHeader,
    MatCardSubtitle,
    MatCardTitle,
    MatChip,
    MatDivider,
    MatFormField,
    MatHint,
    MatLabel,
    MatIcon,
    MatList,
    MatListItem,
    MatListItemLine,
    MatListItemMeta,
    MatListItemTitle,
    MatMenu,
    MatMenuContent,
    MatMenuItem,
    MatMenuTrigger,
    MatProgressBar,
    MatOption,
    MatSelect,
    MatTooltip,
  ],
  templateUrl: './design-input.html',
  styleUrl: './design-input.css',
  host: { role: 'region', 'aria-labelledby': 'input-title' },
})
export class DesignInput implements OnInit {
  protected readonly inputs = inject(DesignFilesService);
  private readonly compute = inject(ComputeService);
  private readonly dialog = inject(MatDialog);
  private readonly importInput = viewChild.required<ElementRef<HTMLInputElement>>('importInput');
  private pendingImport?: string;
  protected readonly sources = [
    ...DESIGNS.map((design) => ({
      id: design.id,
      label: `${design.wing} — LEparagliding ${design.program} · ${design.cells} cells`,
    })),
    { id: 'custom', label: 'My files' },
  ];
  protected readonly sourceHint = computed(() => {
    const design = this.inputs.selected();
    if (!design)
      return 'Import leparagliding.txt and its airfoils (.txt or .dat), or an exported ZIP.';
    const adapted = design.adapted ? ` Adapted for 3.29: ${design.adapted}.` : '';
    return `Official example from LEparagliding ${design.program}.${adapted}`;
  });
  protected readonly locked = computed(() => this.compute.busy() || this.inputs.pending());

  ngOnInit(): void {
    void this.inputs.selectSource(this.inputs.sourceId());
  }

  protected kind(file: InputFile): string {
    return file.name === MAIN_FILE ? 'Wing geometry and parameters' : 'Airfoil';
  }

  protected async edit(file: InputFile): Promise<void> {
    const { FileEditorDialog } = await import('./file-editor-dialog');
    if (this.locked() || this.dialog.openDialogs.length || !this.inputs.files().includes(file))
      return;
    const data: FileEditorData = { name: file.name, text: this.inputs.text(file) };
    this.dialog
      .open(FileEditorDialog, { data, width: '1040px' })
      .afterClosed()
      .subscribe((text: string | undefined) => {
        if (text !== undefined) this.inputs.edit(file, text);
      });
  }

  /** Opens the file picker, to add files or to replace the named one. */
  protected chooseImport(replaceName?: string): void {
    this.pendingImport = replaceName;
    const input = this.importInput().nativeElement;
    input.multiple = !replaceName;
    input.accept = replaceName ? '.txt,.dat' : '.txt,.dat,.zip';
    input.click();
  }

  protected onImportChange(input: HTMLInputElement): void {
    const files = Array.from(input.files ?? []);
    const replaceName = this.pendingImport;
    input.value = '';
    this.pendingImport = undefined;
    void this.inputs.importFiles(files, replaceName);
  }
}
