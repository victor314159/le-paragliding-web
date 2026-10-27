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
import { DESIGN_FILE } from '@lepara/format';
import { PRE_DATA_FILE } from '@lepara/preprocessor';
import { ComputeService } from '../compute/compute.service';
import type { DesignEditorData, DesignEditorResult, Selection } from '../editor/editor-state';
import { confirm } from '../shared/confirm-dialog';
import { diagnosticLabel, withSeverity } from '../shared/diagnostics';
import { PRE_DATA_NOTE } from '../shared/pre-data-note';
import { DesignFilesService, type InputFile } from './design-files.service';
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
  protected readonly designFile = DESIGN_FILE;
  protected readonly diagnosticLabel = diagnosticLabel;
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
  protected readonly errors = computed(() => withSeverity(this.inputs.diagnostics(), 'error'));
  protected readonly warnings = computed(() => withSeverity(this.inputs.diagnostics(), 'warning'));

  ngOnInit(): void {
    void this.inputs.selectSource(this.inputs.sourceId());
  }

  protected kind(file: InputFile): string {
    if (file.name === PRE_DATA_FILE) return 'Geometry preprocessor parameters';
    return file.name === DESIGN_FILE ? 'Wing geometry and parameters' : 'Airfoil';
  }

  /**
   * The files edited with the design, by name: the airfoils section 2 names,
   * and pre-data.txt. True for those read.
   */
  protected readonly parameterFiles = computed(() => {
    const project = this.inputs.reading().project;
    const preData = this.inputs.preDataReading();
    return new Map([
      ...(project?.design.airfoils.map(
        ({ airfoil }) => [airfoil, project.airfoils.has(airfoil)] as const,
      ) ?? []),
      ...(project && preData ? [[PRE_DATA_FILE, preData.ok] as const] : []),
    ]);
  });

  /** Opens the parameter editor, on `selection` if given: a section or an airfoil. */
  protected async editParameters(selection?: Selection): Promise<void> {
    const { DesignEditor } = await import('../editor/design-editor');
    const { project, reading } = this.inputs.reading();
    if (this.locked() || this.dialog.openDialogs.length || !project) return;
    const data: DesignEditorData = {
      project,
      reading,
      selection,
      preData: this.inputs.preDataReading(),
    };
    this.dialog
      .open(DesignEditor, {
        data,
        width: '100vw',
        height: '100dvh',
        maxWidth: '100vw',
        panelClass: 'design-editor-dialog',
        disableClose: true,
        ariaLabel: `Edit parameters · ${DESIGN_FILE}`,
      })
      .afterClosed()
      .subscribe((result: DesignEditorResult | undefined) => {
        if (!result) return;
        if ('editText' in result) {
          const target = this.inputs.files().find((file) => file.name === result.editText);
          if (target) void this.edit(target);
          return;
        }
        if (result.design) this.inputs.applyDesign(result.design);
        for (const [name, airfoil] of result.airfoils) this.inputs.applyAirfoil(name, airfoil);
        if (result.preData) this.inputs.applyPreData(result.preData);
      });
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

  /** Downloads the file, after a warning for pre-data.txt. */
  protected download(file: InputFile): void {
    if (file.name !== PRE_DATA_FILE) return this.inputs.exportFile(file);
    this.warnPreData(`Download ${PRE_DATA_FILE}?`, 'Download', () => this.inputs.exportFile(file));
  }

  /** Exports all the files, after a warning if they include pre-data.txt. */
  protected exportAll(): void {
    if (!this.inputs.files().some((file) => file.name === PRE_DATA_FILE))
      return void this.inputs.exportAll();
    this.warnPreData(`Export ${PRE_DATA_FILE} with the other files?`, 'Export', () => {
      void this.inputs.exportAll();
    });
  }

  private warnPreData(title: string, action: string, save: () => void): void {
    confirm(this.dialog, {
      title,
      message: PRE_DATA_NOTE,
      icon: 'warning',
      cancel: 'Cancel',
      confirm: action,
    }).subscribe((confirmed) => {
      if (confirmed) save();
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
