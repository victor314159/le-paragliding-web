import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { ColorsPreview } from './colors-preview';
import { DetailPreview } from './detail-preview';
import { DETAIL_PREVIEWS, type PreviewViews } from './detail-previews';
import { EditorState } from './editor-state';
import { GeometryPreview } from './geometry-preview';
import { HolesPreview } from './holes-preview';
import { RibPreview } from './rib-preview';
import { SkinTensionPreview } from './skin-tension-preview';
import { ThicknessPreview } from './thickness-preview';
import { WingContextPreview } from './wing-context-preview';

const WING_VIEWS: PreviewViews = [
  ['planform', 'Planform'],
  ['front', 'Front'],
];
const RIB_VIEWS: PreviewViews = [...WING_VIEWS, ['profile', 'Profile']];
const TENSION_VIEWS: PreviewViews = [
  ['both', 'Both'],
  ['extrados', 'Extrados'],
  ['intrados', 'Intrados'],
];

/** The sections with a preview, and the views it offers: the first one by default. */
export const PREVIEW_VIEWS: ReadonlyMap<number, PreviewViews> = new Map([
  [1, WING_VIEWS],
  [2, RIB_VIEWS],
  [3, RIB_VIEWS],
  [4, RIB_VIEWS],
  [5, TENSION_VIEWS],
  [15, []],
  [16, []],
  [30, []],
  [31, TENSION_VIEWS],
  ...[...DETAIL_PREVIEWS].map(([section, { views }]) => [section, views] as const),
]);

/** A docked, resizable preview alongside independently scrolling fields. */
@Component({
  selector: 'app-editor-preview',
  imports: [
    MatButton,
    MatIconButton,
    MatIcon,
    MatTooltip,
    GeometryPreview,
    HolesPreview,
    RibPreview,
    WingContextPreview,
    ColorsPreview,
    ThicknessPreview,
    SkinTensionPreview,
    DetailPreview,
  ],
  host: {
    '[class.collapsed]': 'editor.previewCollapsed()',
    '[class.resizing]': 'resizing()',
    '[style.height.px]': 'editor.previewCollapsed() ? null : editor.previewHeight()',
  },
  template: `
    @if (!editor.previewCollapsed()) {
      <div
        class="preview-divider"
        role="separator"
        tabindex="0"
        aria-label="Resize preview"
        aria-orientation="horizontal"
        aria-controls="section-preview"
        [attr.aria-valuemin]="limits().min"
        [attr.aria-valuemax]="limits().max"
        [attr.aria-valuenow]="height()"
        [attr.aria-valuetext]="height() + ' pixels preview height'"
        (pointerdown)="startResize($event)"
        (pointermove)="resize($event)"
        (pointerup)="endResize($event)"
        (pointercancel)="endResize($event)"
        (lostpointercapture)="resizing.set(false)"
        (keydown)="resizeKey($event)"
        (dblclick)="editor.previewHeight.set(null)"
      >
        <span></span>
      </div>
    }
    <div class="preview-toolbar">
      <h4 id="preview-title">Preview</h4>
      @if (!editor.previewCollapsed()) {
        @if (views().length) {
          <div class="view-selector" role="group" aria-label="Preview view">
            @if (views().length > 3) {
              <select
                class="view-select"
                aria-label="Preview view"
                [value]="view()"
                (change)="setView($any($event.target).value)"
              >
                @for (option of views(); track option[0]) {
                  <option [value]="option[0]">{{ option[1] }}</option>
                }
              </select>
            } @else {
              @for (option of views(); track option[0]) {
                <button
                  matButton
                  type="button"
                  [attr.aria-pressed]="view() === option[0]"
                  (click)="setView(option[0])"
                >
                  {{ option[1] }}
                </button>
              }
            }
          </div>
        }
        <div class="viewport-tools" role="group" aria-label="Preview navigation">
          <button
            matIconButton
            type="button"
            aria-label="Fit view"
            matTooltip="Fit view"
            (click)="fitView()"
          >
            <mat-icon svgIcon="fit_screen" />
          </button>
        </div>
      }
      <button
        matButton
        type="button"
        class="collapse-toggle"
        [attr.aria-expanded]="!editor.previewCollapsed()"
        aria-controls="section-preview"
        (click)="editor.previewCollapsed.set(!editor.previewCollapsed())"
      >
        {{ editor.previewCollapsed() ? 'Expand preview' : 'Collapse preview' }}
      </button>
    </div>
    <div
      id="section-preview"
      class="preview-body"
      role="region"
      aria-labelledby="preview-title"
      [hidden]="editor.previewCollapsed()"
    >
      @switch (section()) {
        @case (1) {
          <app-geometry-preview
            [row]="editor.selectedRecord(editor.form.geometry.ribs)"
            [view]="wingView()"
          />
        }
        @case (2) {
          @if (view() === 'profile') {
            <app-rib-preview [row]="editor.selectedRecord(editor.form.airfoils)" />
          } @else {
            <app-wing-context-preview
              [row]="editor.selectedRecord(editor.form.airfoils)"
              [view]="wingView()"
            />
          }
        }
        @case (3) {
          @if (view() === 'profile') {
            <app-rib-preview [row]="editor.selectedRecord(editor.form.anchors)" anchors />
          } @else {
            <app-wing-context-preview
              [row]="editor.selectedRecord(editor.form.anchors)"
              [view]="wingView()"
            />
          }
        }
        @case (4) {
          @if (editor.form.holes.length) {
            @if (view() === 'profile') {
              <app-holes-preview [group]="holeGroup()" [active]="activeHole()" />
            } @else {
              <app-wing-context-preview
                [row]="holeRib()"
                [view]="wingView()"
                [group]="holeGroup()"
                [activeHole]="activeHole()"
              />
            }
          } @else {
            <p>Add a hole group to preview its layout.</p>
          }
        }
        @case (5) {
          <app-skin-tension-preview [view]="view()" />
        }
        @case (31) {
          <app-skin-tension-preview [view]="view()" />
        }
        @case (15) {
          <app-colors-preview />
        }
        @case (16) {
          <app-colors-preview />
        }
        @case (30) {
          <app-thickness-preview />
        }
        @default {
          <app-detail-preview [view]="view()" />
        }
      }
    </div>
  `,
  styleUrl: './editor-preview.css',
})
export class EditorPreview {
  protected readonly editor = inject(EditorState);
  protected readonly section = computed(() => Number(this.editor.selection()));
  protected readonly views = computed(() => PREVIEW_VIEWS.get(this.section()) ?? []);
  /** Sections 5 and 31 draw the same overwidth curves, so they share a view. */
  private readonly viewKey = computed(() => (this.section() === 31 ? 5 : this.section()));
  protected readonly view = computed(() => {
    const chosen = this.editor.previewViews()[this.viewKey()];
    return this.views().some(([view]) => view === chosen) ? chosen : (this.views()[0]?.[0] ?? '');
  });
  protected readonly wingView = computed(() => (this.view() === 'front' ? 'front' : 'planform'));
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly destroy = inject(DestroyRef);
  protected readonly limits = signal({ min: 160, max: 600 });
  protected readonly height = signal(280);
  protected readonly resizing = signal(false);
  private drag?: { y: number; height: number; previous: number | null };
  protected readonly holeGroup = computed(() => this.editor.selectedRecord(this.editor.form.holes));
  protected readonly activeHole = computed(() => {
    const group = this.editor.form.holes[this.holeGroup()];
    return group ? this.editor.selectedRecord(group.holes) : 0;
  });
  /** The rib chosen in the profile view, if in the selected group. */
  protected readonly holeRib = computed(() => {
    const group = this.editor.draft.value().holes[this.holeGroup()];
    const first = (group?.firstRib ?? 1) - 1;
    const requested = this.editor.previewRibs()[4] ?? first;
    return requested >= first && requested < (group?.lastRib ?? 0) ? requested : first;
  });

  constructor() {
    afterNextRender(() => {
      const parent = this.element.parentElement;
      if (!parent) return;
      const observer = new ResizeObserver(() => {
        const max = Math.max(100, Math.floor(parent.getBoundingClientRect().height - 120));
        this.limits.set({ min: Math.min(160, max), max });
        this.height.set(Math.round(this.element.getBoundingClientRect().height));
      });
      observer.observe(parent);
      observer.observe(this.element);
      this.destroy.onDestroy(() => observer.disconnect());
    });
  }
  protected setView(view: string): void {
    this.editor.setPreviewView(this.viewKey(), view);
  }
  protected fitView(): void {
    this.editor.previewFitRequest.update((value) => value + 1);
  }
  private setHeight(height: number): void {
    this.editor.previewHeight.set(Math.max(this.limits().min, Math.min(this.limits().max, height)));
  }
  protected startResize(event: PointerEvent): void {
    if (!event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    target.focus();
    target.setPointerCapture(event.pointerId);
    this.drag = {
      y: event.clientY,
      height: this.element.getBoundingClientRect().height,
      previous: this.editor.previewHeight(),
    };
    this.resizing.set(true);
  }
  protected resize(event: PointerEvent): void {
    if (this.resizing() && this.drag)
      this.setHeight(this.drag.height + this.drag.y - event.clientY);
  }
  protected endResize(event: PointerEvent): void {
    this.resizing.set(false);
    const target = event.currentTarget as HTMLElement;
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
  }
  protected resizeKey(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.resizing() && this.drag) {
      event.preventDefault();
      event.stopPropagation();
      this.editor.previewHeight.set(this.drag.previous);
      this.resizing.set(false);
      return;
    }
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    const amount = event.shiftKey ? 50 : 20;
    this.setHeight(
      event.key === 'Home'
        ? this.limits().min
        : event.key === 'End'
          ? this.limits().max
          : this.element.getBoundingClientRect().height +
            (event.key === 'ArrowUp' ? amount : -amount),
    );
  }
}
