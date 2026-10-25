import { Component, computed, inject, input } from '@angular/core';
import { SECTION_SCENES, finite, type PreviewContext } from '@lepara/views';
import { EditorState } from './editor-state';
import { PreviewViewport } from './preview-viewport';

/** Shared rendering and navigation for dimensioned input drawings and schematics. */
@Component({
  selector: 'app-detail-preview',
  imports: [PreviewViewport],
  template: `
    <figure>
      <figcaption>{{ scene().title }}</figcaption>
      @if (
        definition()?.ribs && ribs().length && !(section() === 6 && context().view === 'panels')
      ) {
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
      <svg [appPreviewViewport]="scene().viewBox" role="img" [attr.aria-label]="scene().title">
        @for (path of scene().paths; track $index) {
          <path [attr.class]="path.kind + (path.selected ? ' selected' : '')" [attr.d]="path.d">
            <title>{{ path.title }}</title>
          </path>
        }
        @for (dot of scene().dots; track $index) {
          <circle
            [attr.class]="dot.kind + (dot.selected ? ' selected' : '')"
            [attr.cx]="dot.point[0]"
            [attr.cy]="dot.point[1]"
            [attr.r]="dot.radius"
          >
            <title>{{ dot.title }}</title>
          </circle>
        }
        @for (label of scene().labels; track $index) {
          <text
            [attr.x]="label.point[0]"
            [attr.y]="label.point[1]"
            [attr.text-anchor]="label.anchor"
            [attr.font-size]="label.fontSize ?? scene().fontSize"
          >
            {{ label.text }}
          </text>
        }
      </svg>
      <p>{{ scene().note }}</p>
    </figure>
  `,
  styleUrls: ['./preview-layout.css', './preview.css', './detail-preview.css'],
})
export class DetailPreview {
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
      case 38:
        selected = e.selectedRecord(f.hvrHoles.rows);
        break;
    }
    return { selected, active, secondary };
  });
  protected readonly ribs = computed(() => {
    const design = this.editor.draft.value(),
      { selected, secondary } = this.selection();
    const range =
      this.section() === 29
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
    const requested = this.editor.previewRibs()[this.section()];
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
  protected setRib(rib: number): void {
    this.editor.setPreviewRib(this.section(), rib);
  }
}
