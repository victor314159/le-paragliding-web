import { Component, computed, inject, input } from '@angular/core';
import {
  finite,
  holeOutline,
  offsetProfile,
  pointPath,
  previewBounds,
  ribProfile,
} from '@lepara/views';
import { EditorState } from './editor-state';
import { PreviewViewport } from './preview-viewport';

@Component({
  selector: 'app-holes-preview',
  imports: [PreviewViewport],
  template: `
    <figure>
      <figcaption>Rib holes · group {{ group() + 1 }}</figcaption>
      @if (ribs().length) {
        <div class="preview-controls">
          <label
            >Preview rib
            <select
              aria-label="Preview rib"
              [value]="rib()"
              (change)="editor.setPreviewRib(4, +$any($event.target).value)"
            >
              @for (r of ribs(); track r.index) {
                <option [value]="r.index">Rib {{ r.index + 1 }}</option>
              }
            </select>
          </label>
          <span>{{ data().name }}</span>
        </div>
      }
      <svg
        [appPreviewViewport]="data().viewBox"
        role="img"
        [attr.aria-label]="
          rib() >= 0 ? 'Lightening holes on rib ' + (rib() + 1) : 'Lightening hole layout'
        "
      >
        <path class="allowance" [attr.d]="data().allowance" />
        <path class="profile" [attr.d]="data().profile" />
        <line class="chord" x1="0" x2="1" y1="0" y2="0" />
        @for (hole of data().holes; track hole.index) {
          <path class="hole" [class.selected]="hole.index === active()" [attr.d]="hole.path">
            <title>Hole {{ hole.index + 1 }}</title>
          </path>
        }
        @for (anchor of data().anchors; track anchor.name) {
          <circle
            class="anchor-dot"
            [style.fill]="anchor.color"
            [attr.cx]="anchor.x"
            [attr.cy]="anchor.y"
            r="0.007"
          >
            <title>{{ anchor.name }} · {{ anchor.x * 100 }}% chord</title>
          </circle>
          <text
            class="profile-label"
            [attr.x]="anchor.x"
            [attr.y]="anchor.y + 0.05"
            text-anchor="middle"
          >
            {{ anchor.name }}
          </text>
        }
        @if (data().chord) {
          <path
            class="dimension"
            [attr.d]="
              'M0,' +
              data().dimensionY +
              ' H1 M0,' +
              (data().dimensionY - 0.015) +
              ' v0.03 M1,' +
              (data().dimensionY - 0.015) +
              ' v0.03'
            "
          />
          <text
            class="profile-label"
            x="0.5"
            [attr.y]="data().dimensionY + 0.04"
            text-anchor="middle"
          >
            {{ data().chord!.toFixed(1) }} cm · chord
          </text>
        }
      </svg>
      @if (!ribs().length) {
        <p>No project rib in this group's range. Only the hole coordinates are shown.</p>
      } @else if (!data().profile) {
        <p>Airfoil coordinates are unavailable for this rib.</p>
      }
      @if (data().omitted.length) {
        <p>
          Not drawn: holes {{ data().omitted.join(', ') }} (unsupported type or incomplete/invalid
          dimensions).
        </p>
      }
      <p>
        Input profile · % chord · Dashed: {{ data().seam }} mm seam offset, before panel
        corrections.
      </p>
    </figure>
  `,
  styleUrls: ['./preview-layout.css', './preview.css'],
})
export class HolesPreview {
  readonly group = input.required<number>();
  readonly active = input(0);
  protected readonly editor = inject(EditorState);
  private readonly configuration = computed(
    () => this.editor.draft.project().design.holes[this.group()],
  );
  protected readonly ribs = computed(() => {
    const group = this.configuration();
    return this.editor.draft
      .value()
      .airfoils.flatMap((r, index) =>
        finite(group?.firstRib) &&
        finite(group?.lastRib) &&
        index + 1 >= group.firstRib &&
        index + 1 <= group.lastRib
          ? [{ index, name: r.airfoil }]
          : [],
      );
  });
  protected readonly rib = computed(
    () =>
      this.ribs().find((r) => r.index === this.editor.previewRibs()[4])?.index ??
      this.ribs()[0]?.index ??
      -1,
  );
  protected readonly data = computed(() => {
    const { design, airfoils } = this.editor.draft.project();
    const profile = ribProfile(design, airfoils, this.rib());
    const points = profile.points;
    const seam = design.sewingAllowances.ribs;
    const allowance =
      profile.chord && finite(seam) ? offsetProfile(points, seam / 10 / profile.chord) : [];
    const bottom = Math.max(0.08, ...points.map((p) => p[1]), ...allowance.map((p) => p[1]));
    const dimensionY = bottom + 0.1;
    const omitted: number[] = [];
    const holes = (this.configuration()?.holes ?? []).flatMap((hole, index) => {
      const outline = holeOutline(hole);
      if (!outline) {
        omitted.push(index + 1);
        return [];
      }
      return [{ index, ...outline }];
    });
    return {
      ...profile,
      seam,
      dimensionY,
      allowance: pointPath(allowance, true),
      profile: pointPath(points),
      holes,
      omitted,
      ...previewBounds([
        [0, -0.08],
        [1, dimensionY + 0.06],
        ...points,
        ...allowance,
        ...holes.flatMap((h) => h.points),
      ]),
    };
  });
}
