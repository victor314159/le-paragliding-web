import {
  Component,
  computed,
  effect,
  type ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { tensionCurve, tensionScale } from '@lepara/views';
import { EditorState } from './editor-state';
import { PreviewViewport } from './preview-viewport';

@Component({
  selector: 'app-skin-tension-preview',
  imports: [PreviewViewport],
  template: `
    <figure>
      <figcaption>
        @if (grouped()) {
          Skin tension · group {{ group()?.group ?? '—' }} · ribs {{ group()?.firstRib ?? '—' }}–{{
            group()?.lastRib ?? '—'
          }}
        } @else {
          Skin tension · section 5
        }
      </figcaption>
      @if (!grouped() || (editor.draft.value().skinTensionGroups.mode === 1 && group())) {
        <svg
          #chart
          [appPreviewViewport]="data().viewBox"
          role="img"
          aria-label="Skin tension overwidth curves"
        >
          <text class="axis-title" x="8" y="15">
            Overwidth ({{ grouped() ? '% panel width' : '% chord' }})
          </text>
          @for (tick of data().yTicks; track $index) {
            <line
              class="tick-grid"
              [attr.x1]="data().left"
              [attr.x2]="data().right"
              [attr.y1]="tick.y"
              [attr.y2]="tick.y"
            />
            <text class="tick" [attr.x]="data().left - 8" [attr.y]="tick.y + 4" text-anchor="end">
              {{ tick.label }}
            </text>
          }
          @for (tick of data().xTicks; track tick.value) {
            <line
              class="tick-grid"
              [attr.x1]="tick.x"
              [attr.x2]="tick.x"
              [attr.y1]="data().top"
              [attr.y2]="data().bottom"
            />
            <text class="tick" [attr.x]="tick.x" [attr.y]="data().bottom + 17" text-anchor="middle">
              {{ tick.value }}
            </text>
          }
          <line
            class="zero"
            [attr.x1]="data().left"
            [attr.x2]="data().right"
            [attr.y1]="data().zero"
            [attr.y2]="data().zero"
          />
          @for (series of data().series; track series.surface) {
            <g [attr.class]="series.surface">
              <path class="curve" [attr.d]="series.path" />
              @for (point of series.points; track point.index) {
                <circle
                  class="point"
                  [class.active-point]="point.index === active()"
                  [attr.cx]="point.cx"
                  [attr.cy]="point.cy"
                  [attr.r]="point.index === active() ? 5 : 3.5"
                >
                  <title>
                    {{ series.surface }} · Point {{ point.index + 1 }} · {{ point.position }}% from
                    {{ series.surface === 'extrados' ? 'LE' : 'TE' }} · overwidth {{ point.value }}%
                  </title>
                </circle>
              }
            </g>
          }
          <text
            class="axis-title"
            [attr.x]="(data().left + data().right) / 2"
            [attr.y]="data().height - 4"
            text-anchor="middle"
          >
            {{ grouped() ? 'Position along panel edge (%)' : 'Position (% chord)' }} · LE → TE
          </text>
        </svg>
        <p>
          <span class="extrados-key">● Extrados</span> ·
          <span class="intrados-key">◆ Intrados (dashed)</span> · Intrados positions converted from
          TE.
          @if (!grouped() && editor.draft.value().skinTensionGroups.mode === 1) {
            Section 31 is active; these are the section 5 base values.
          }
          @if (data().omitted) {
            Incomplete or out-of-range points omitted; gaps are not interpolated.
          }
        </p>
      } @else {
        <p>
          {{
            editor.draft.value().skinTensionGroups.mode === 0
              ? 'Skin tension groups are disabled; section 5 supplies the base curve.'
              : 'Add a skin tension group to preview its curves.'
          }}
        </p>
      }
    </figure>
  `,
  styleUrls: ['./preview-layout.css', './skin-tension-preview.css'],
})
export class SkinTensionPreview {
  readonly view = input.required<string>();
  protected readonly editor = inject(EditorState);
  protected readonly grouped = computed(() => this.editor.selection() === 31);
  private readonly groupIndex = computed(() =>
    this.editor.selectedRecord(this.editor.form.skinTensionGroups.groups),
  );
  protected readonly group = computed(() => {
    const groups = this.editor.draft.project().design.skinTensionGroups;
    return groups.mode === 1 ? groups.groups[this.groupIndex()] : undefined;
  });
  protected readonly active = computed(() => {
    const field = this.grouped()
      ? this.editor.form.skinTensionGroups.groups[this.groupIndex()]?.points
      : this.editor.form.skinTension.points;
    return field ? this.editor.selectedRecord(field) : 0;
  });
  private readonly chart = viewChild<ElementRef<SVGSVGElement>>('chart');
  private readonly size = signal({ width: 640, height: 160 });
  protected readonly data = computed(() => {
    const input = this.grouped()
      ? (this.group()?.points ?? [])
      : this.editor.draft.project().design.skinTension.points;
    const curves = (['extrados', 'intrados'] as const).map((surface) => ({
      surface,
      points: tensionCurve(input, surface),
    }));
    const { width, height } = this.size();
    const left = 54,
      right = width - 18,
      top = 25,
      bottom = height - 40;
    const scale = tensionScale(curves.flatMap((curve) => curve.points.map((p) => p.value)));
    const y = (value: number) =>
      bottom - ((value - scale.low) / (scale.high - scale.low)) * (bottom - top);
    const x = (value: number) => left + (value / 100) * (right - left);
    const series = curves
      .filter((curve) => this.view() === 'both' || this.view() === curve.surface)
      .map((curve) => {
        const points = curve.points.map((p) => ({ ...p, cx: x(p.x), cy: y(p.value) }));
        return {
          ...curve,
          points,
          path: points
            .map((p, i) => `${i && p.index === points[i - 1].index + 1 ? 'L' : 'M'}${p.cx},${p.cy}`)
            .join(' '),
        };
      });
    return {
      series,
      left,
      right,
      top,
      bottom,
      height,
      zero: y(0),
      viewBox: `0 0 ${width} ${height}`,
      xTicks: [0, 25, 50, 75, 100].map((value) => ({ value, x: x(value) })),
      yTicks: scale.ticks.map((value) => ({
        y: y(value),
        label: Number(value.toPrecision(4)).toString(),
      })),
      omitted: curves.some((curve) => curve.points.length !== input.length),
    };
  });

  constructor() {
    effect((onCleanup) => {
      const svg = this.chart()?.nativeElement;
      if (!svg) return;
      const observer = new ResizeObserver(() => {
        const bounds = svg.getBoundingClientRect();
        if (bounds.width > 0 && bounds.height > 0)
          this.size.set({
            width: Math.max(320, Math.round(bounds.width)),
            height: Math.max(130, Math.round(bounds.height)),
          });
      });
      observer.observe(svg);
      onCleanup(() => observer.disconnect());
    });
  }
}
