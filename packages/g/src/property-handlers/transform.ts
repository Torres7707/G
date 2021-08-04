import { mat4 } from 'gl-matrix';
import { addPropertiesHandler } from '../Interpolation';
import { parseAngle, parseLength, parseLengthOrPercent, mergeDimensions } from './dimension';
import { parseNumber, mergeNumbers } from './numeric';
import { makeMatrixDecomposition, quat, composeMatrix } from '../utils/matrix-decompose';

interface ParsedArg {
  t: string;
  d: number[];
}

let _: any = null;

function cast(pattern: string[]) {
  return function (contents: any[]) {
    let i = 0;
    return pattern.map((x) => { return x === _ ? contents[i++] : x; });
  }
}

function id(x: string) { return x; }

const Opx = { px: 0 };
const Odeg = { deg: 0 };

// type: [argTypes, convertTo3D, convertTo2D]
// In the argument types string, lowercase characters represent optional arguments
const transformFunctions: Record<string, any> = {
  matrix: ['NNNNNN', [_, _, 0, 0, _, _, 0, 0, 0, 0, 1, 0, _, _, 0, 1], id],
  matrix3d: ['NNNNNNNNNNNNNNNN', id],
  rotate: ['A'],
  rotatex: ['A'],
  rotatey: ['A'],
  rotatez: ['A'],
  rotate3d: ['NNNA'],
  perspective: ['L'],
  scale: ['Nn', cast([_, _, 1]), id],
  scalex: ['N', cast([_, 1, 1]), cast([_, 1])],
  scaley: ['N', cast([1, _, 1]), cast([1, _])],
  scalez: ['N', cast([1, 1, _])],
  scale3d: ['NNN', id],
  skew: ['Aa', null, id],
  skewx: ['A', null, cast([_, Odeg])],
  skewy: ['A', null, cast([Odeg, _])],
  translate: ['Tt', cast([_, _, Opx]), id],
  translatex: ['T', cast([_, Opx, Opx]), cast([_, Opx])],
  translatey: ['T', cast([Opx, _, Opx]), cast([Opx, _])],
  translatez: ['L', cast([Opx, Opx, _])],
  translate3d: ['TTL', id],
};

/**
 * scale(1) scale(1, 2)
 * scaleX(1)
 */
export function parseTransform(string: string) {
  string = string.toLowerCase().trim();
  if (string === 'none')
    return [];
  // FIXME: Using a RegExp means calcs won't work here
  const transformRegExp = /\s*(\w+)\(([^)]*)\)/g;
  const result = [];
  let match;
  let prevLastIndex = 0;
  while (match = transformRegExp.exec(string)) {
    if (match.index !== prevLastIndex)
      return;
    prevLastIndex = match.index + match[0].length;
    const functionName = match[1]; // scale
    const functionData = transformFunctions[functionName]; // scale(1, 2)
    if (!functionData) // invalid scale()
      return;
    const args = match[2].split(','); // 1,2
    const argTypes = functionData[0]; // Nn
    if (argTypes.length < args.length) // scale(N, n)
      return;

    const parsedArgs: Record<string, any>[] = [];
    for (let i = 0; i < argTypes.length; i++) {
      const arg = args[i];
      const type = argTypes[i];
      let parsedArg;
      if (!arg) {
        // @ts-ignore
        parsedArg = ({
          a: Odeg,
          n: parsedArgs[0],
          t: Opx
        })[type];
      } else {
        // @ts-ignore
        parsedArg = ({
          A: (s: string) => { return s.trim() === '0' ? Odeg : parseAngle(s); },
          N: parseNumber,
          T: parseLengthOrPercent,
          // T: parseLength, // 暂不支持 %
          L: parseLength
        })[type.toUpperCase()](arg);
      }
      if (parsedArg === undefined)
        return;
      parsedArgs.push(parsedArg);
    }
    result.push({ t: functionName, d: parsedArgs }); // { t: scale, d: [1, 2] }

    if (transformRegExp.lastIndex === string.length) {
      return result;
    }
  }
};

function numberToLongString(x: number) {
  return x.toFixed(6).replace('.000000', '');
}

function mergeMatrices(left, right) {
  if (left.decompositionPair !== right) {
    left.decompositionPair = right;
    var leftArgs = makeMatrixDecomposition(left);
  }
  if (right.decompositionPair !== left) {
    right.decompositionPair = left;
    var rightArgs = makeMatrixDecomposition(right);
  }
  if (leftArgs[0] === null || rightArgs[0] === null)
    return [[false], [true], (x) => { return x ? right[0].d : left[0].d; }];
  leftArgs[0].push(0);
  rightArgs[0].push(1);
  return [
    leftArgs,
    rightArgs,
    function (list) {
      const q = quat(leftArgs[0][3], rightArgs[0][3], list[5]);
      const mat = composeMatrix(list[0], list[1], list[2], q, list[4]);
      const stringifiedArgs = mat.map(numberToLongString).join(',');
      return stringifiedArgs;
    }
  ];
}

function typeTo2D(type: string) {
  return type.replace(/[xy]/, '');
}

function typeTo3D(type: string) {
  return type.replace(/(x|y|z|3d)?$/, '3d');
}

const isMatrixOrPerspective = function (lt: string, rt: string) {
  return ((lt === 'perspective') && (rt === 'perspective')) ||
    ((lt === 'matrix' || lt === 'matrix3d') && (rt === 'matrix' || rt === 'matrix3d'));
};

function mergeTransforms(left: ParsedArg[], right: ParsedArg[]) {
  let flipResults = false;
  if (!left.length || !right.length) {
    if (!left.length) {
      flipResults = true;
      left = right;
      right = [];
    }
    for (let i = 0; i < left.length; i++) {
      const { t: type, d: args } = left[i];
      const defaultValue = type.substr(0, 5) === 'scale' ? 1 : 0;
      right.push({
        t: type,
        // @ts-ignore
        d: args.map((arg) => {
          if (typeof arg === 'number')
            return defaultValue;
          const result = {};
          // @ts-ignore
          for (const unit in arg)
            // @ts-ignore
            result[unit] = defaultValue;
          return result;
        })
      });
    }
  }

  let leftResult = [];
  let rightResult = [];
  let types: any = [];

  if (left.length !== right.length) {
    const merged = mergeMatrices(left, right);
    leftResult = [merged[0]];
    rightResult = [merged[1]];
    types = [['matrix', [merged[2]]]];
  } else {
    for (let i = 0; i < left.length; i++) {
      const leftType = left[i].t;
      const rightType = right[i].t;
      let leftArgs = left[i].d;
      let rightArgs = right[i].d;

      const leftFunctionData = transformFunctions[leftType];
      const rightFunctionData = transformFunctions[rightType];

      let type;
      if (isMatrixOrPerspective(leftType, rightType)) {
        const merged = mergeMatrices([left[i]], [right[i]]);
        leftResult.push(merged[0]);
        rightResult.push(merged[1]);
        types.push(['matrix', [merged[2]]]);
        continue;
      } else if (leftType === rightType) {
        type = leftType;
      } else if (leftFunctionData[2] && rightFunctionData[2] && typeTo2D(leftType) === typeTo2D(rightType)) {
        type = typeTo2D(leftType);
        leftArgs = leftFunctionData[2](leftArgs);
        rightArgs = rightFunctionData[2](rightArgs);
      } else if (leftFunctionData[1] && rightFunctionData[1] && typeTo3D(leftType) === typeTo3D(rightType)) {
        type = typeTo3D(leftType);
        leftArgs = leftFunctionData[1](leftArgs);
        rightArgs = rightFunctionData[1](rightArgs);
      } else {
        const merged = mergeMatrices(left, right);
        leftResult = [merged[0]];
        rightResult = [merged[1]];
        types = [['matrix', [merged[2]]]];
        break;
      }

      const leftArgsCopy = [];
      const rightArgsCopy = [];
      const stringConversions = [];
      for (let j = 0; j < leftArgs.length; j++) {
        const merge = typeof leftArgs[j] === 'number' ? mergeNumbers : mergeDimensions;
        const merged = merge(leftArgs[j], rightArgs[j]);
        leftArgsCopy[j] = merged[0];
        rightArgsCopy[j] = merged[1];
        stringConversions.push(merged[2]);
      }
      leftResult.push(leftArgsCopy);
      rightResult.push(rightArgsCopy);
      types.push([type, stringConversions]);
    }
  }

  if (flipResults) {
    let tmp = leftResult;
    leftResult = rightResult;
    rightResult = tmp;
  }

  return [leftResult, rightResult, (list) => {
    return list.map((args, i: number) => {
      const stringifiedArgs = args.map((arg, j: number) => {
        return types[i][1][j](arg);
      }).join(',');
      if (types[i][0] === 'matrix' && stringifiedArgs.split(',').length === 16)
        types[i][0] = 'matrix3d';
      return types[i][0] + '(' + stringifiedArgs + ')';

    }).join(' ');
  }];
}

addPropertiesHandler(parseTransform, mergeTransforms, ['transform']);