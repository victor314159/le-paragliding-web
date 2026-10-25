import { Component, computed, inject } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { airfoilPart } from '@lepara/views';
import type { AirfoilForm } from './editor-draft';
import { EditorState } from './editor-state';
import { NumberField } from './number-field';
import { RecordRow, RemoveRow } from './record-editor';
import { TableScroll } from './table-scroll';

type Part = ReturnType<typeof airfoilPart>;
const PART_LABELS: Readonly<Record<Part, string>> = {
  extrados: 'Extrados',
  inlet: 'Air inlet',
  intrados: 'Intrados',
};

/** The ranges of ribs, from 1-based numbers in order: 1–3, 7. */
const ribRanges = (ribs: readonly number[]) =>
  ribs
    .reduce<number[][]>((ranges, rib) => {
      const last = ranges.at(-1);
      if (last && rib === last[last.length - 1] + 1) last.push(rib);
      else ranges.push([rib]);
      return ranges;
    }, [])
    .map((range) => (range.length > 1 ? `${range[0]}–${range.at(-1)}` : `${range[0]}`))
    .join(', ');

/** The points of an airfoil file, from the trailing edge, and the counts of its parts. */
@Component({
  selector: 'app-airfoil-section',
  imports: [MatIcon, MatIconButton, MatTooltip, NumberField, RecordRow, RemoveRow, TableScroll],
  template: `
    @if (form(); as form) {
      <p>
        {{
          txt()
            ? 'LEparagliding format (.txt): from the trailing edge over the extrados, the air inlet and the intrados, back to the trailing edge.'
            : 'Point list (.dat): from the trailing edge around the nose, back to the trailing edge. The engine places the air inlet from section 2.'
        }}
        Coordinates in fractions of the chord, the nose at (0, 0). {{ usage() }}
      </p>
      @if (txt()) {
        <fieldset>
          <legend>Points per part</legend>
          <app-number-field integer label="Extrados" [field]="form.extrados" />
          <app-number-field integer label="Air inlet" [field]="form.inlet" />
          <app-number-field integer label="Intrados" [field]="form.intrados" />
          <p>
            The parts share their end points: their counts add up to the number of points + 2 ({{
              form.points.length + 2
            }}). Inserting or removing a point updates the count of its part.
          </p>
        </fieldset>
      }
      <div appTableScroll role="region" aria-label="Airfoil points">
        <table class="parameter-table">
          <caption>
            Points ({{
              form.points.length
            }})
          </caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              @if (txt()) {
                <th scope="col">Part</th>
              }
              <th scope="col">x (chord)</th>
              <th scope="col">y (chord)</th>
              <th scope="col" class="row-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            @for (point of form.points; track point; let i = $index) {
              <tr [appRecordRow]="form.points" [index]="i">
                <th scope="row">{{ i + 1 }}</th>
                @if (txt()) {
                  <td class="part">{{ partLabel(i) }}</td>
                }
                <td><app-number-field compact label="x" [field]="point[0]" /></td>
                <td><app-number-field compact label="y" [field]="point[1]" /></td>
                <td class="row-actions">
                  <button
                    matIconButton
                    type="button"
                    aria-label="Insert point after"
                    matTooltip="Insert point after"
                    [disabled]="form.points.length >= max()"
                    (click)="insert(i)"
                  >
                    <mat-icon svgIcon="add" />
                  </button>
                  @if (txt()) {
                    <button
                      matIconButton
                      type="button"
                      aria-label="Remove point"
                      matTooltip="Remove point"
                      (click)="remove(i)"
                    >
                      <mat-icon svgIcon="delete" />
                    </button>
                  } @else {
                    <app-remove-row [rows]="form.points" [index]="i" label="point" />
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
  styleUrl: './section.css',
  styles: `
    .row-actions button {
      --mat-icon-button-state-layer-size: 36px;
      --mat-icon-button-touch-target-size: 36px;
      vertical-align: middle;
    }
    .part {
      padding-block: 12px;
      white-space: nowrap;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class AirfoilSection {
  protected readonly editor = inject(EditorState);
  private readonly name = computed(() => this.editor.airfoil() ?? '');
  protected readonly form = computed(() => {
    const name = this.editor.airfoil();
    return name === undefined ? undefined : this.editor.airfoilForm[name];
  });
  private readonly value = computed(() => this.editor.draft.airfoilValue()[this.name()]);
  protected readonly txt = computed(() => this.value()?.format === 'txt');
  /** The engine's arrays: see MAX_TXT_POINTS and MAX_DAT_POINTS in @lepara/format. */
  protected readonly max = computed(() => (this.txt() ? 499 : 497));
  protected readonly usage = computed(() => {
    const ribs = this.editor.draft
      .value()
      .airfoils.flatMap((row, i) => (row.airfoil === this.name() ? [i + 1] : []));
    return ribs.length
      ? `Used by ${ribs.length === 1 ? 'rib' : 'ribs'} ${ribRanges(ribs)} (section 2).`
      : 'No rib uses it (section 2).';
  });

  protected partLabel(index: number): string {
    return PART_LABELS[airfoilPart(this.value(), index)];
  }

  private update(change: (airfoil: AirfoilForm) => AirfoilForm): void {
    this.editor.draft.airfoilValue.update((airfoils) => ({
      ...airfoils,
      [this.name()]: change(airfoils[this.name()]),
    }));
  }

  /** Inserts the midpoint of `index` and the next point, in the part of the segment. */
  protected insert(index: number): void {
    if (this.editor.focusUnparsed()) return;
    this.update((airfoil) => {
      const { points } = airfoil;
      const [x0, y0] = points[index];
      const [x1, y1] = points[index + 1] ?? points[index];
      const mid = (a: number | null, b: number | null) =>
        a !== null && b !== null ? (a + b) / 2 : a;
      const inserted = [...points];
      inserted.splice(index + 1, 0, [mid(x0, x1), mid(y0, y1)]);
      if (airfoil.format !== 'txt') return { ...airfoil, points: inserted };
      // The part of the segment is that of its end; after the last point, the intrados.
      const part = index + 1 < points.length ? airfoilPart(airfoil, index + 1) : 'intrados';
      return { ...airfoil, points: inserted, [part]: (airfoil[part] ?? 0) + 1 };
    });
    const form = this.form();
    if (form) this.editor.selectRecord(form.points, index + 1);
  }

  /** Removes a point of a .txt airfoil and one from the count of its part. */
  protected remove(index: number): void {
    if (this.editor.focusUnparsed()) return;
    this.update((airfoil) => {
      const part = airfoilPart(airfoil, index);
      return {
        ...airfoil,
        points: airfoil.points.filter((_, i) => i !== index),
        [part]: (airfoil[part] ?? 0) - 1,
      };
    });
  }
}
