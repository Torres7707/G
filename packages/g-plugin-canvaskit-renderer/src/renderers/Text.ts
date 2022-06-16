import type { DisplayObject, ParsedPathStyleProps, ParsedTextStyleProps } from '@antv/g';
import { ContextService, CSSRGB, inject, singleton } from '@antv/g';
import type { EmbindEnumEntity, Typeface } from 'canvaskit-wasm';
import { FontLoader } from '../FontLoader';
import type {
  CanvasKitContext,
  RendererContribution,
  RendererContributionContext,
} from '../interfaces';
import { TextRendererContribution } from '../interfaces';
import { color2CanvaskitColor } from '../util';

/**
 * One of the biggest features that CanvasKit offers over the HTML Canvas API is paragraph shaping.
 * To use text your applicatoin, supply a font file and use Promise.all to run your code when both CanvasKit and the font file are ready.
 *
 * @see https://skia.org/docs/user/modules/quickstart/#text-shaping
 * @see https://fiddle.skia.org/c/@Canvas_drawText
 *
 * Depend on volatile Google Fonts:
 * @see https://github.com/flutter/flutter/issues/85793
 *
 * CJK Fonts:
 * @see https://github.com/flutter/flutter/issues/77212
 * @see https://github.com/flutter/flutter/issues/53897
 *
 * Emoji:
 * @see https://github.com/flutter/flutter/issues/76248
 */
@singleton({
  token: TextRendererContribution,
})
export class TextRenderer implements RendererContribution {
  @inject(ContextService)
  private contextService: ContextService<CanvasKitContext>;

  @inject(FontLoader)
  private fontLoader: FontLoader;

  render(object: DisplayObject, context: RendererContributionContext) {
    const { CanvasKit } = this.contextService.getContext();
    const { canvas } = context;
    const {
      text,
      fontSize,
      fontFamily: fontFamilies,
      fontWeight,
      // fontStyle,
      // lineWidth,
      textAlign,
      textBaseline,
      // lineJoin,
      // miterLimit = 0,
      letterSpacing = 0,
      // stroke,
      fill,
      // fillOpacity,
      // strokeOpacity,
      // opacity,
      wordWrap,
      wordWrapWidth,
      dx,
      dy,
      // @ts-ignore
      alongPath,
      // @ts-ignore
      maxLines,
      // @ts-ignore
      ellipsis,
      // @ts-ignore
      decorationLine,
      // @ts-ignore
      decorationThickness,
      // @ts-ignore
      decorationStyle,
      // @ts-ignore
      decorationColor,
      // @ts-ignore
      direction,
      // @ts-ignore
      backgroundColor,
      // @ts-ignore
      foregroundColor,
      // @ts-ignore
      wordSpacing,
      // @ts-ignore
      disableHinting,
      // @ts-ignore
      shadows,
      // @ts-ignore
      halfLeading,
      // @ts-ignore
      fontFeatures,
      // @ts-ignore
      strutStyle,
      // @ts-ignore
      heightMultiplier,
    } = object.parsedStyle as ParsedTextStyleProps;

    const TEXT_ALIGN_MAP: Record<CanvasTextAlign, EmbindEnumEntity> = {
      left: CanvasKit.TextAlign.Left,
      center: CanvasKit.TextAlign.Center,
      right: CanvasKit.TextAlign.Right,
      end: CanvasKit.TextAlign.End,
      start: CanvasKit.TextAlign.Start,
    };
    const TEXT_BASELINE_MAP: Record<CanvasTextBaseline, EmbindEnumEntity> = {
      alphabetic: CanvasKit.TextBaseline.Alphabetic,
      bottom: undefined,
      hanging: undefined,
      ideographic: CanvasKit.TextBaseline.Ideographic,
      middle: undefined,
      top: undefined,
    };

    // fontFamily
    const loadedFontFamilies: string[] = [];
    const loadedFontData: ArrayBuffer[] = [];
    const loadedTypefaces: Typeface[] = [];
    fontFamilies.split(',').forEach((fontFamily) => {
      loadedFontFamilies.push(fontFamily.trim());
      loadedFontData.push(this.fontLoader.getFontBuffer(fontFamily.trim()));
      loadedTypefaces.push(this.fontLoader.getTypeface(fontFamily.trim()));
    });

    if (alongPath) {
      const skPath = new CanvasKit.Path();
      const { defX: x, defY: y, path: parsedPath } = alongPath.parsedStyle as ParsedPathStyleProps;

      const { curve, zCommandIndexes } = parsedPath;
      const pathCommand = [...curve];
      zCommandIndexes.forEach((zIndex, index) => {
        pathCommand.splice(zIndex + index, 1, ['Z']);
      });

      for (let i = 0; i < pathCommand.length; i++) {
        const params = pathCommand[i]; // eg. M 100 200
        const command = params[0];
        // V,H,S,T 都在前面被转换成标准形式
        switch (command) {
          case 'M':
            skPath.moveTo(params[1] - x, params[2] - y);
            break;
          case 'C':
            skPath.cubicTo(
              params[1] - x,
              params[2] - y,
              params[3] - x,
              params[4] - y,
              params[5] - x,
              params[6] - y,
            );
            break;
          case 'Z':
            skPath.close();
            break;
          default:
            break;
        }
      }

      const textPaint = new CanvasKit.Paint();
      textPaint.setAntiAlias(true);
      textPaint.setStyle(CanvasKit.PaintStyle.Fill);
      if (fill instanceof CSSRGB && !fill.isNone) {
        textPaint.setColor(
          CanvasKit.Color4f(
            Number(fill.r) / 255,
            Number(fill.g) / 255,
            Number(fill.b) / 255,
            Number(fill.alpha),
          ),
        );
      }
      const skFont = new CanvasKit.Font(loadedTypefaces[0], fontSize.value);
      const textblob = CanvasKit.TextBlob.MakeOnPath(text, skPath, skFont);
      canvas.drawTextBlob(textblob, 0, 0, textPaint);
    } else {
      const DECORATION_MAP = {
        none: CanvasKit.NoDecoration,
        underline: CanvasKit.UnderlineDecoration,
        overline: CanvasKit.OverlineDecoration,
        'line-through': CanvasKit.LineThroughDecoration,
      };
      const DECORATION_STYLE_MAP = {
        solid: CanvasKit.DecorationStyle.Solid,
        double: CanvasKit.DecorationStyle.Double,
        dotted: CanvasKit.DecorationStyle.Dotted,
        dashed: CanvasKit.DecorationStyle.Dashed,
        wavy: CanvasKit.DecorationStyle.Wavy,
      };
      const DIRECTION_MAP = {
        ltr: CanvasKit.TextDirection.LTR,
        rtl: CanvasKit.TextDirection.RTL,
      };

      const paraStyle = new CanvasKit.ParagraphStyle({
        textStyle: {
          backgroundColor: color2CanvaskitColor(CanvasKit, backgroundColor),
          color: CanvasKit.Color4f(
            Number((fill as CSSRGB).r) / 255,
            Number((fill as CSSRGB).g) / 255,
            Number((fill as CSSRGB).b) / 255,
            Number((fill as CSSRGB).alpha),
          ),
          decoration: DECORATION_MAP[decorationLine || 'none'],
          decorationColor: color2CanvaskitColor(CanvasKit, decorationColor),
          decorationThickness,
          decorationStyle: DECORATION_STYLE_MAP[decorationStyle || 'solid'],
          fontFamilies: loadedFontFamilies,
          fontFeatures,
          fontSize: fontSize.value,
          fontStyle: {
            weight: {
              value: Number(fontWeight.value),
            },
            // width?: FontWidth;
            // slant?: FontSlant;
          },
          foregroundColor: color2CanvaskitColor(
            CanvasKit,
            foregroundColor || object.getAttribute('fill'),
          ),
          heightMultiplier,
          halfLeading,
          letterSpacing,
          // locale?: string;
          shadows: (shadows || []).map(({ color, offset, blurRadius }) => {
            return {
              color: color2CanvaskitColor(CanvasKit, color),
              offset,
              blurRadius,
            };
          }),
          textBaseline: TEXT_BASELINE_MAP[textBaseline.value],
          wordSpacing,
        },
        textAlign: TEXT_ALIGN_MAP[textAlign.value],
        disableHinting,
        ellipsis,
        // heightMultiplier,
        maxLines,
        strutStyle,
        textDirection: DIRECTION_MAP[direction || 'ltr'],
        // textHeightBehavior?: TextHeightBehavior;
      });

      // use cached font manager
      const fontMgr = this.fontLoader.getOrCreateFontMgr(CanvasKit, loadedFontFamilies);

      const builder = CanvasKit.ParagraphBuilder.Make(paraStyle, fontMgr);
      builder.addText(text);
      const paragraph = builder.build();

      if (wordWrap) {
        // width in pixels to use when wrapping text
        paragraph.layout(wordWrapWidth);
      } else {
        paragraph.layout(text.length * fontSize.value);
      }

      // account for textBaseline
      const paragraphHeight = paragraph.getHeight();
      const paragraphMaxWidth = paragraph.getMaxWidth();
      let offsetX = 0;
      // handle horizontal text align
      if (textAlign.value === 'center') {
        offsetX -= paragraphMaxWidth / 2;
      } else if (textAlign.value === 'right' || textAlign.value === 'end') {
        offsetX -= paragraphMaxWidth;
      }
      let linePositionY = 0;
      // handle vertical text baseline
      if (textBaseline.value === 'middle') {
        linePositionY = -paragraphHeight / 2;
      } else if (
        textBaseline.value === 'bottom' ||
        textBaseline.value === 'alphabetic' ||
        textBaseline.value === 'ideographic'
      ) {
        linePositionY = -paragraphHeight;
      } else if (textBaseline.value === 'top' || textBaseline.value === 'hanging') {
        linePositionY = 0;
      }

      canvas.drawParagraph(paragraph, offsetX + dx.value, linePositionY + dy.value);

      paragraph.delete();
      builder.delete();
    }
  }
}