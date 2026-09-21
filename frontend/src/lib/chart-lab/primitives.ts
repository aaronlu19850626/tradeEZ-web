// A custom pane primitive, the most advanced extension point of Lightweight
// Charts: it draws a highlighted window plus a dashed level inside the price
// pane using the library's canvas renderer.

import type {
  IChartApi,
  IPanePrimitiveBase,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  SeriesType,
  Time,
  UTCTimestamp,
} from "lightweight-charts";

export interface WindowOptions {
  from: UTCTimestamp;
  to: UTCTimestamp;
  level: number;
  fill: string;
  line: string;
  label: string;
}

export class HighlightWindowPrimitive implements IPanePrimitiveBase {
  private options: WindowOptions;
  private readonly chart: IChartApi;
  private readonly series: ISeriesApi<SeriesType>;
  private readonly views: IPrimitivePaneView[];

  constructor(chart: IChartApi, series: ISeriesApi<SeriesType>, options: WindowOptions) {
    this.chart = chart;
    this.series = series;
    this.options = options;
    this.views = [
      {
        zOrder: () => "bottom",
        renderer: (): IPrimitivePaneRenderer => ({
          draw: (target) => {
            const from = this.chart.timeScale().timeToCoordinate(this.options.from as Time);
            const to = this.chart.timeScale().timeToCoordinate(this.options.to as Time);
            const level = this.series.priceToCoordinate(this.options.level);
            if (from === null || to === null || level === null) return;
            // biome-ignore lint/correctness/useHookAtTopLevel: this is the Lightweight Charts canvas API, not a React hook.
            target.useBitmapCoordinateSpace((scope) => {
              const context = scope.context;
              const ratio = scope.horizontalPixelRatio;
              const height = scope.bitmapSize.height;
              const left = Math.min(from, to) * ratio;
              const width = Math.max(2, Math.abs(to - from) * ratio);
              context.save();
              context.fillStyle = this.options.fill;
              context.fillRect(left, 0, width, height);
              context.strokeStyle = this.options.line;
              context.lineWidth = 1.4 * ratio;
              context.setLineDash([5 * ratio, 4 * ratio]);
              context.beginPath();
              context.moveTo(left, level * scope.verticalPixelRatio);
              context.lineTo(left + width, level * scope.verticalPixelRatio);
              context.stroke();
              context.restore();
            });
          },
        }),
      },
    ];
  }

  updateOptions(options: WindowOptions): void {
    this.options = options;
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this.views;
  }
}
