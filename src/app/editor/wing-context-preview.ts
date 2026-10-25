import { Component, computed, inject, input } from '@angular/core';
import {
  ANCHOR_COLORS,
  ANCHOR_NAMES,
  centroid,
  finite,
  frontPoint,
  pointPath,
  previewBounds,
  ribNumbers,
  ribProfile,
  type Point,
} from '@lepara/views';
import { EditorState } from './editor-state';
import { PreviewViewport } from './preview-viewport';

@Component({
  selector: 'app-wing-context-preview',
  imports: [PreviewViewport],
  template: `
    <figure>
      <figcaption>
        {{ view() === 'planform' ? 'Wing planform' : 'Wing front projection' }}
      </figcaption>
      <div class="anchor-legend" aria-label="Anchor colors">
        @for (name of names; track name; let i = $index) {
          <span [style.color]="colors[i]">● {{ name === 'F' ? 'F · brake' : name }}</span>
        }
      </div>
      <svg
        [appPreviewViewport]="data().viewBox"
        role="img"
        [attr.aria-label]="
          view() === 'planform'
            ? 'Wing planform with anchor positions'
            : 'Wing front view with anchor positions'
        "
      >
        <path class="outline" [attr.d]="data().outline" />
        @for (rib of data().ribs; track $index) {
          <line
            class="rib"
            [class.in-group]="rib.inGroup"
            [class.selected]="rib.index === row()"
            [attr.x1]="rib.leading[0]"
            [attr.y1]="rib.leading[1]"
            [attr.x2]="rib.trailing[0]"
            [attr.y2]="rib.trailing[1]"
          >
            <title>Rib {{ rib.index + 1 }}</title>
          </line>
        }
        @for (label of data().numbers; track label.index) {
          <text
            class="rib-number"
            [class.current]="label.index === row()"
            [attr.x]="label.point[0]"
            [attr.y]="label.point[1]"
            [attr.font-size]="data().fontSize"
          >
            {{ label.text }}
          </text>
        }
        @for (series of data().series; track series.name) {
          <path class="anchor-track" [style.stroke]="series.color" [attr.d]="series.path" />
          @for (anchor of series.dots; track $index) {
            <circle
              class="anchor-dot"
              [style.fill]="series.color"
              [class.selected]="anchor.index === row()"
              [attr.cx]="anchor.point[0]"
              [attr.cy]="anchor.point[1]"
              [attr.r]="data().radius * (anchor.index === row() ? 1.8 : 1)"
            >
              <title>
                Rib {{ anchor.index + 1 }} · {{ series.name }} · {{ anchor.percent }}% chord
              </title>
            </circle>
          }
        }
        @for (hole of data().holes; track $index) {
          <circle
            class="hole-center"
            [class.selected]="hole.hole === activeHole()"
            [attr.cx]="hole.point[0]"
            [attr.cy]="hole.point[1]"
            [attr.r]="data().radius"
          >
            <title>Rib {{ hole.index + 1 }} · Hole {{ hole.hole + 1 }} center</title>
          </circle>
        }
      </svg>
      <p>
        {{
          group() === undefined
            ? 'Colored lines: active anchors. Focus a rib row to highlight it.'
            : 'Highlighted ribs: selected hole group · Hollow dots: hole centers.'
        }}
      </p>
    </figure>
  `,
  styleUrls: ['./preview-layout.css', './preview.css'],
})
export class WingContextPreview {
  readonly view = input<'planform' | 'front'>('planform');
  readonly row = input(0);
  readonly group = input<number>();
  readonly activeHole = input(0);
  protected readonly names = ANCHOR_NAMES;
  protected readonly colors = ANCHOR_COLORS;
  private readonly editor = inject(EditorState);
  protected readonly data = computed(() => {
    const { design, airfoils } = this.editor.draft.project();
    const groupIndex = this.group();
    const group = groupIndex === undefined ? undefined : design.holes[groupIndex];
    const project = (index: number, point: Point): Point | undefined => {
      const r = design.geometry.ribs[index];
      if (this.view() === 'front') return frontPoint(design, index, point);
      if (!r || !finite(r.x) || !finite(r.yLE) || !finite(r.yTE)) return undefined;
      return [r.x, r.yLE + point[0] * (r.yTE - r.yLE)];
    };
    const half = design.geometry.ribs.flatMap((r, index) => {
      const leading = project(index, [0, 0]);
      const trailing = project(index, [1, 0]);
      if (!leading || !trailing) return [];
      const profile = ribProfile(design, airfoils, index);
      return [
        {
          index,
          leading,
          trailing,
          profile,
          inGroup:
            !!group &&
            index + 1 >= (group.firstRib ?? Infinity) &&
            index + 1 <= (group.lastRib ?? -Infinity),
        },
      ];
    });
    const sides = [-1, 1];
    const mirrored = [
      ...[...half].reverse().map((r) => ({
        ...r,
        leading: [-r.leading[0], r.leading[1]] as Point,
        trailing: [-r.trailing[0], r.trailing[1]] as Point,
      })),
      ...half,
    ];
    const outlinePoints = [
      ...mirrored.map((r) => r.leading),
      ...[...mirrored].reverse().map((r) => r.trailing),
    ];
    const series = ANCHOR_NAMES.map((name, number) => {
      const dots = sides.flatMap((side) => {
        const rows = side === -1 ? [...half].reverse() : half;
        return rows.flatMap((r) => {
          const anchor = r.profile.anchors.find((a) => a.name === name);
          const position = anchor && project(r.index, [anchor.x, anchor.y]);
          return position
            ? [
                {
                  index: r.index,
                  percent: anchor.x * 100,
                  point: [side * position[0], position[1]] as Point,
                },
              ]
            : [];
        });
      });
      const path = dots
        .map(
          (dot, i) =>
            `${i && Math.abs(dot.index - dots[i - 1].index) <= 1 ? 'L' : 'M'}${dot.point.join(',')}`,
        )
        .join(' ');
      return { name, color: ANCHOR_COLORS[number], dots, path };
    });
    const holes = half
      .filter((r) => r.inGroup)
      .flatMap((r) =>
        (group?.holes ?? []).flatMap((hole, h) => {
          if (
            ![1, 3, 4].includes(hole.type ?? 0) ||
            !finite(hole.parameters[0]) ||
            !finite(hole.parameters[1])
          )
            return [];
          const point = project(r.index, [hole.parameters[0] / 100, -hole.parameters[1] / 100]);
          return point
            ? sides.map((side) => ({
                index: r.index,
                hole: h,
                point: [side * point[0], point[1]] as Point,
              }))
            : [];
        }),
      );
    const points = [
      ...outlinePoints,
      ...series.flatMap((s) => s.dots.map((d) => d.point)),
      ...holes.map((h) => h.point),
    ];
    const bounds = previewBounds(points);
    const center = centroid(outlinePoints);
    const fontSize = (bounds.right - bounds.left) * 0.016;
    const numbers = ribNumbers(
      half.map((r) =>
        this.view() === 'front'
          ? {
              index: r.index,
              point: r.leading,
              direction: [r.leading[0] - center[0], r.leading[1] - center[1]] as Point,
            }
          : {
              index: r.index,
              point: r.trailing,
              direction: [r.trailing[0] - r.leading[0], r.trailing[1] - r.leading[1]] as Point,
            },
      ),
      fontSize,
      this.row(),
    );
    return {
      ribs: mirrored,
      numbers,
      fontSize,
      outline: pointPath(outlinePoints, true),
      series,
      holes,
      radius: Math.max(bounds.right - bounds.left, 1) * 0.0025,
      ...bounds,
    };
  });
}
