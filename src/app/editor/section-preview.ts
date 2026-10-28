import { Component, computed, inject, input } from '@angular/core';
import { MODEL_VIEW, SECTION_SCENES, finite, type PreviewContext } from '@lepara/views';
import { EditorState } from './editor-state';
import { ModelPreview } from './model-preview';
import { ScenePreview } from './scene-preview';

/** The scene of the selected section, on the records focused in its form. */
@Component({
  selector: 'app-section-preview',
  imports: [ModelPreview, ScenePreview],
  template: `
    @if (model(); as model) {
      <app-model-preview [model]="model" />
    } @else {
      <app-scene-preview [scene]="scene()">
        @if (definition()?.ribs?.(context().view) && ribs().length) {
          <div class="preview-controls">
            <label
              >Preview rib
              <select
                aria-label="Preview rib"
                [value]="context().rib"
                (change)="setRib(+$any($event.target).value)"
              >
                @for (rib of ribs(); track rib) {
                  <option [value]="rib">Rib {{ rib + 1 }}</option>
                }
              </select>
            </label>
          </div>
        }
      </app-scene-preview>
    }
  `,
  styles: `
    :host,
    app-model-preview,
    app-scene-preview {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
      min-height: 0;
    }
    .preview-controls {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 16px;
      margin-top: 4px;
      font: var(--mat-sys-body-medium);
    }
    select {
      padding: 4px 8px;
      border: 1px solid var(--mat-sys-outline);
      border-radius: 4px;
      color: var(--mat-sys-on-surface);
      background: var(--mat-sys-surface);
      font: inherit;
    }
  `,
})
export class SectionPreview {
  readonly view = input.required<string>();
  private readonly editor = inject(EditorState);
  protected readonly section = computed(() => Number(this.editor.selection()));
  protected readonly definition = computed(() => SECTION_SCENES.get(this.section()));
  private readonly selection = computed(() => {
    const f = this.editor.form,
      e = this.editor;
    let selected = 0,
      active = 0,
      secondary = 0;
    switch (this.section()) {
      case 1:
        selected = e.selectedRecord(f.geometry.ribs);
        break;
      case 2:
        selected = e.selectedRecord(f.airfoils);
        break;
      case 3:
        selected = e.selectedRecord(f.anchors);
        break;
      case 4:
        selected = e.selectedRecord(f.holes);
        active = f.holes[selected] ? e.selectedRecord(f.holes[selected].holes) : 0;
        break;
      case 5:
        active = e.selectedRecord(f.skinTension.points);
        break;
      case 9:
        selected = e.selectedRecord(f.lines.plans);
        active = f.lines.plans[selected] ? e.selectedRecord(f.lines.plans[selected].paths) : 0;
        break;
      case 10:
        active = e.selectedRecord(f.brakes.paths);
        break;
      case 12:
        selected = e.selectedRecord(f.hvRibs.ribs);
        break;
      case 15:
      case 16: {
        const colors = this.section() === 15 ? f.extradosColors : f.intradosColors;
        const panels = colors.mode().value() === 'panels';
        selected = e.selectedRecord(panels ? colors.panels : colors.ribs);
        const rows = panels ? colors.panels[selected]?.cuts : colors.ribs[selected]?.marks;
        active = rows ? e.selectedRecord(rows) : 0;
        break;
      }
      case 17:
        selected = e.selectedRecord(f.ribPoints);
        break;
      case 20:
        selected = e.selectedRecord(f.markTypes);
        break;
      case 21:
        secondary = e.selectedRecord(f.joncs.blocs);
        selected =
          f.joncs.mode().value() === 1
            ? e.selectedRecord(f.joncs.groups)
            : f.joncs.blocs[secondary]
              ? e.selectedRecord(f.joncs.blocs[secondary].groups)
              : 0;
        break;
      case 26:
        selected = e.selectedRecord(f.glueVents.ribs);
        break;
      case 29:
        selected = e.selectedRecord(f.shaping.groups);
        active = f.shaping.groups[selected]
          ? e.selectedRecord(f.shaping.groups[selected][e.shapingSurface()].cuts)
          : 0;
        break;
      case 30:
        selected = e.selectedRecord(f.thickness.ribs);
        break;
      case 31:
        selected = e.selectedRecord(f.skinTensionGroups.groups);
        active = f.skinTensionGroups.groups[selected]
          ? e.selectedRecord(f.skinTensionGroups.groups[selected].points)
          : 0;
        break;
      case 38:
        selected = e.selectedRecord(f.hvrHoles.rows);
        break;
    }
    return { selected, active, secondary };
  });
  /** The ribs the preview offers: those of the selected group, if the section has groups. */
  protected readonly ribs = computed(() => {
    const design = this.editor.draft.value(),
      { selected, secondary } = this.selection();
    const range =
      this.section() === 4
        ? design.holes[selected]
        : this.section() === 29
          ? design.shaping.groups[selected]
          : this.section() === 21
            ? design.joncs.mode === 1
              ? design.joncs.groups[selected]
              : design.joncs.blocs[secondary]?.groups[selected]
            : undefined;
    return design.airfoils.flatMap((_, i) =>
      !range ||
      (finite(range.firstRib) &&
        finite(range.lastRib) &&
        i + 1 >= range.firstRib &&
        i + 1 <= range.lastRib)
        ? [i]
        : [],
    );
  });
  protected readonly context = computed<PreviewContext>(() => {
    const { selected } = this.selection();
    // The rows of section 30 are ribs: its preview rib is the selected row.
    const requested = this.section() === 30 ? selected : this.editor.previewRibs()[this.section()];
    const rib = this.ribs().includes(requested) ? requested : (this.ribs()[0] ?? 0);
    return {
      design: this.editor.draft.project().design,
      airfoils: this.editor.draft.project().airfoils,
      ...this.selection(),
      rib,
      surface: this.editor.shapingSurface(),
      view: this.view(),
    };
  });
  protected readonly scene = computed(() => this.definition()!.draw(this.context()));
  protected readonly model = computed(() =>
    this.view() === MODEL_VIEW[0] ? this.definition()?.model?.(this.context()) : undefined,
  );
  protected setRib(rib: number): void {
    if (this.section() === 30) this.editor.selectRecord(this.editor.form.thickness.ribs, rib);
    else this.editor.setPreviewRib(this.section(), rib);
  }
}
