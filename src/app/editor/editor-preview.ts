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
import { PRE_DATA_FILE } from '@lepara/preprocessor';
import {
  airfoilScene,
  MODEL_VIEW,
  preDataModel,
  preprocessorScene,
  SECTION_SCENES,
  type PreviewViews,
} from '@lepara/views';
import { EditorState, type Selection } from './editor-state';
import { ModelPreview } from './model-preview';
import { ScenePreview } from './scene-preview';
import { SectionPreview } from './section-preview';

/** The sections and files with a preview, and the views it offers: the first one by default. */
export const PREVIEW_VIEWS: ReadonlyMap<Selection, PreviewViews> = new Map<Selection, PreviewViews>(
  [
    [PRE_DATA_FILE, [['planform', 'Planform'], ['front', 'Front'], ['cells', 'Cells'], MODEL_VIEW]],
    ...[...SECTION_SCENES].map(([section, { views }]) => [section, views] as const),
  ],
);

/** Views take buttons while their labels fit the toolbar, and a select beyond. */
const BUTTON_LABELS_LENGTH = 28;

/** A docked, resizable preview alongside independently scrolling fields. */
@Component({
  selector: 'app-editor-preview',
  imports: [
    MatButton,
    MatIconButton,
    MatIcon,
    MatTooltip,
    ModelPreview,
    ScenePreview,
    SectionPreview,
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
            @if (select()) {
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
      @if (editor.airfoil()) {
        <app-scene-preview [scene]="airfoil()" />
      } @else if (section() === preDataFile) {
        @let model = view() === modelView ? generatedModel() : undefined;
        @if (model) {
          <app-model-preview [model]="model" [fitRequest]="editor.previewFitRequest()" />
        } @else if (generated(); as scene) {
          <app-scene-preview [scene]="scene" />
        } @else {
          <p class="empty">Correct the parameters to see the geometry.</p>
        }
      } @else {
        <app-section-preview [view]="view()" />
      }
    </div>
  `,
  styleUrl: './editor-preview.css',
})
export class EditorPreview {
  protected readonly editor = inject(EditorState);
  protected readonly section = this.editor.selection;
  protected readonly preDataFile = PRE_DATA_FILE;
  protected readonly modelView = MODEL_VIEW[0];
  protected readonly views = computed(() => PREVIEW_VIEWS.get(this.section()) ?? []);
  protected readonly select = computed(
    () =>
      this.views().reduce((length, [, label]) => length + label.length, 0) > BUTTON_LABELS_LENGTH,
  );
  /** Sections 5 and 31 draw the same overwidth curves, so they share a view. */
  private readonly viewKey = computed(() => (this.section() === 31 ? 5 : this.section()));
  protected readonly view = computed(() => {
    const chosen = this.editor.previewViews()[this.viewKey()];
    return this.views().some(([view]) => view === chosen) ? chosen : (this.views()[0]?.[0] ?? '');
  });
  protected readonly airfoil = computed(() => {
    const name = this.editor.airfoil() ?? '';
    const rows = this.editor.airfoilForm[name]?.points;
    return airfoilScene(
      name,
      this.editor.draft.project().airfoils.get(name),
      rows ? this.editor.selectedRecord(rows) : -1,
    );
  });
  protected readonly generated = computed(() => {
    const result = this.editor.generated();
    return (
      result &&
      preprocessorScene(
        result,
        this.editor.preprocessor.input(),
        this.view(),
        this.editor.preprocessorFocus(),
      )
    );
  });
  /** The wing the parameters generate, on its own. */
  protected readonly generatedModel = computed(() => {
    const result = this.editor.generated();
    return result && preDataModel(result);
  });
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly destroy = inject(DestroyRef);
  protected readonly limits = signal({ min: 160, max: 600 });
  protected readonly height = signal(280);
  protected readonly resizing = signal(false);
  private drag?: { y: number; height: number; previous: number | null };
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
