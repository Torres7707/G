import { singleton } from 'mana-syringe';
import type { CSSProperty } from '../CSSProperty';
import type { DisplayObject } from '../../display-objects';
import { CSSUnitValue } from '../cssom';
import { parseNumberList } from '../parser';

@singleton()
export class CSSPropertyAnchor implements Partial<CSSProperty<CSSUnitValue[], CSSUnitValue[]>> {
  parser = parseNumberList;

  calculator(
    name: string,
    oldParsed: CSSUnitValue[],
    parsed: CSSUnitValue[],
    object: DisplayObject,
  ) {
    if (parsed.length === 2) {
      return [parsed[0], parsed[1], new CSSUnitValue(0)];
    }

    return parsed;
  }
}