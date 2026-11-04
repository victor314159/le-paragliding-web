import { Component, computed, input, viewChild } from '@angular/core';
import { gridLength, type PreviewScene } from '@lepara/views';
import { PreviewViewport } from './preview-viewport';

/** The most a grid square takes on screen, in pixels: its length follows the zoom. */
const GRID_SIZE = 64;

/** A scene of @lepara/views, zoomable, with its controls projected under the title. */
@Component({
  selector: 'app-scene-preview',
  imports: [PreviewViewport],
  template: `
    <figure>
      <figcaption>{{ scene().title }}</figcaption>
      <ng-content />
      <div class="stage" [class.keyed]="scene().legend[0]?.sample">
        @if (scene().legend.length) {
          <div class="legend" aria-label="Legend">
            @for (entry of scene().legend; track entry.text) {
              <span [style.color]="entry.color">
                @if (entry.sample; as sample) {
                  <svg viewBox="0 0 24 10" aria-hidden="true">
                    @if (sample.dot) {
                      <circle [attr.class]="sample.kind" cx="12" cy="5" r="3" />
                    } @else {
                      <path [attr.class]="sample.kind" d="M1 5H23" />
                    }
                  </svg>
                } @else {
                  ●
                }
                {{ entry.text }}
              </span>
            }
            @if (grid(); as grid) {
              <span class="grid-size"><i></i>{{ grid.text }}</span>
            }
          </div>
        }
        <svg
          [appPreviewViewport]="scene().viewBox"
          role="img"
          [attr.aria-label]="scene().title"
          [class.grid]="grid()"
          [style.background-size]="grid()?.size"
          [style.background-position]="grid()?.position"
        >
          @for (path of scene().paths; track $index) {
            <path
              [attr.class]="path.kind + (path.selected ? ' selected' : '')"
              [attr.d]="path.d"
              [style.stroke]="path.color"
            >
              @if (path.title) {
                <title>{{ path.title }}</title>
              }
            </path>
          }
          @for (dot of scene().dots; track $index) {
            <circle
              [attr.class]="dot.kind + (dot.selected ? ' selected' : '')"
              [attr.cx]="dot.point[0]"
              [attr.cy]="dot.point[1]"
              [attr.r]="dot.radius"
              [style.fill]="dot.color"
            >
              @if (dot.title) {
                <title>{{ dot.title }}</title>
              }
            </circle>
          }
          @for (label of scene().labels; track $index) {
            <text
              [attr.class]="label.kind + (label.selected ? ' selected' : '')"
              [attr.x]="label.point[0]"
              [attr.y]="label.point[1]"
              [attr.text-anchor]="label.anchor"
              [attr.font-size]="label.fontSize ?? scene().fontSize"
            >
              {{ label.text }}
            </text>
          }
        </svg>
      </div>
      <p>{{ scene().note }}</p>
    </figure>
  `,
  styleUrls: ['./preview-layout.css', './scene-preview.css'],
})
export class ScenePreview {
  readonly scene = input.required<PreviewScene>();
  private readonly viewport = viewChild.required(PreviewViewport);
  // Behind the drawing, so the viewport doesn't frame it.
  protected readonly grid = computed(() => {
    const { unit } = this.scene();
    const { pixels, x, y } = this.viewport().scale();
    if (!unit || !(pixels > 0)) return undefined;
    const length = gridLength(GRID_SIZE / pixels);
    const size = length * pixels;
    return {
      text: `Grid ${length} ${unit}`,
      size: `${size}px ${size}px`,
      position: `${x}px ${y}px`,
    };
  });
}
