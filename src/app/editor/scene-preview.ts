import { Component, input } from '@angular/core';
import type { PreviewScene } from '@lepara/views';
import { PreviewViewport } from './preview-viewport';

/** A scene of @lepara/views, zoomable, with its controls projected under the title. */
@Component({
  selector: 'app-scene-preview',
  imports: [PreviewViewport],
  template: `
    <figure>
      <figcaption>{{ scene().title }}</figcaption>
      <ng-content />
      @if (scene().legend.length) {
        <div class="legend" aria-label="Legend">
          @for (entry of scene().legend; track entry.text) {
            <span [style.color]="entry.color">● {{ entry.text }}</span>
          }
        </div>
      }
      <svg [appPreviewViewport]="scene().viewBox" role="img" [attr.aria-label]="scene().title">
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
      <p>{{ scene().note }}</p>
    </figure>
  `,
  styleUrls: ['./preview-layout.css', './scene-preview.css'],
})
export class ScenePreview {
  readonly scene = input.required<PreviewScene>();
}
