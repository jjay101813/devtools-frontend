// Copyright (c) 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// @ts-nocheck

/**
 * @param {string} inputString
 * @param {string} charsToEscape
 * @return {string} the string with any matching chars escaped
 */
export const escapeCharacters = (inputString, charsToEscape) => {
  let foundChar = false;
  for (let i = 0; i < charsToEscape.length; ++i) {
    if (inputString.indexOf(charsToEscape.charAt(i)) !== -1) {
      foundChar = true;
      break;
    }
  }

  if (!foundChar) {
    return String(inputString);
  }

  let result = '';
  for (let i = 0; i < inputString.length; ++i) {
    if (charsToEscape.indexOf(inputString.charAt(i)) !== -1) {
      result += '\\';
    }
    result += inputString.charAt(i);
  }

  return result;
};

/**
 * @param {string} formatString
 * @param {!Object.<string, function(string, ...):*>} formatters
 * @return {!Array.<!Object>}
 */
export const tokenizeFormatString = function(formatString, formatters) {
  const tokens = [];

  function addStringToken(str) {
    if (!str) {
      return;
    }
    if (tokens.length && tokens[tokens.length - 1].type === 'string') {
      tokens[tokens.length - 1].value += str;
    } else {
      tokens.push({type: 'string', value: str});
    }
  }

  function addSpecifierToken(specifier, precision, substitutionIndex) {
    tokens.push({type: 'specifier', specifier: specifier, precision: precision, substitutionIndex: substitutionIndex});
  }

  function addAnsiColor(code) {
    const types = {3: 'color', 9: 'colorLight', 4: 'bgColor', 10: 'bgColorLight'};
    const colorCodes = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'lightGray', '', 'default'];
    const colorCodesLight =
        ['darkGray', 'lightRed', 'lightGreen', 'lightYellow', 'lightBlue', 'lightMagenta', 'lightCyan', 'white', ''];
    const colors = {color: colorCodes, colorLight: colorCodesLight, bgColor: colorCodes, bgColorLight: colorCodesLight};
    const type = types[Math.floor(code / 10)];
    if (!type) {
      return;
    }
    const color = colors[type][code % 10];
    if (!color) {
      return;
    }
    tokens.push({
      type: 'specifier',
      specifier: 'c',
      value: {description: (type.startsWith('bg') ? 'background : ' : 'color: ') + color}
    });
  }

  let textStart = 0;
  let substitutionIndex = 0;
  const re =
      new RegExp(`%%|%(?:(\\d+)\\$)?(?:\\.(\\d*))?([${Object.keys(formatters).join('')}])|\\u001b\\[(\\d+)m`, 'g');
  for (let match = re.exec(formatString); !!match; match = re.exec(formatString)) {
    const matchStart = match.index;
    if (matchStart > textStart) {
      addStringToken(formatString.substring(textStart, matchStart));
    }

    if (match[0] === '%%') {
      addStringToken('%');
    } else if (match[0].startsWith('%')) {
      // eslint-disable-next-line no-unused-vars
      const [_, substitionString, precisionString, specifierString] = match;
      if (substitionString && Number(substitionString) > 0) {
        substitutionIndex = Number(substitionString) - 1;
      }
      const precision = precisionString ? Number(precisionString) : -1;
      addSpecifierToken(specifierString, precision, substitutionIndex);
      ++substitutionIndex;
    } else {
      const code = Number(match[4]);
      addAnsiColor(code);
    }
    textStart = matchStart + match[0].length;
  }
  addStringToken(formatString.substring(textStart));
  return tokens;
};

/**
 * @param {string} formatString
 * @param {?ArrayLike} substitutions
 * @param {!Object.<string, function(string, ...):Q>} formatters
 * @param {!T} initialValue
 * @param {function(T, Q): T|undefined} append
 * @param {!Array.<!Object>=} tokenizedFormat
 * @return {!{formattedResult: T, unusedSubstitutions: ?ArrayLike}};
 * @template T, Q
 */
export const format = function(formatString, substitutions, formatters, initialValue, append, tokenizedFormat) {
  if (!formatString || ((!substitutions || !substitutions.length) && formatString.search(/\u001b\[(\d+)m/) === -1)) {
    return {formattedResult: append(initialValue, formatString), unusedSubstitutions: substitutions};
  }

  function prettyFunctionName() {
    return 'String.format("' + formatString + '", "' + Array.prototype.join.call(substitutions, '", "') + '")';
  }

  function warn(msg) {
    console.warn(prettyFunctionName() + ': ' + msg);
  }

  function error(msg) {
    console.error(prettyFunctionName() + ': ' + msg);
  }

  let result = initialValue;
  const tokens = tokenizedFormat || tokenizeFormatString(formatString, formatters);
  const usedSubstitutionIndexes = {};

  for (let i = 0; i < tokens.length; ++i) {
    const token = tokens[i];

    if (token.type === 'string') {
      result = append(result, token.value);
      continue;
    }

    if (token.type !== 'specifier') {
      error('Unknown token type "' + token.type + '" found.');
      continue;
    }

    if (!token.value && token.substitutionIndex >= substitutions.length) {
      // If there are not enough substitutions for the current substitutionIndex
      // just output the format specifier literally and move on.
      error(
          'not enough substitution arguments. Had ' + substitutions.length + ' but needed ' +
          (token.substitutionIndex + 1) + ', so substitution was skipped.');
      result = append(result, '%' + (token.precision > -1 ? token.precision : '') + token.specifier);
      continue;
    }

    if (!token.value) {
      usedSubstitutionIndexes[token.substitutionIndex] = true;
    }

    if (!(token.specifier in formatters)) {
      // Encountered an unsupported format character, treat as a string.
      warn('unsupported format character \u201C' + token.specifier + '\u201D. Treating as a string.');
      result = append(result, token.value ? '' : substitutions[token.substitutionIndex]);
      continue;
    }

    result = append(result, formatters[token.specifier](token.value || substitutions[token.substitutionIndex], token));
  }

  const unusedSubstitutions = [];
  for (let i = 0; i < substitutions.length; ++i) {
    if (i in usedSubstitutionIndexes) {
      continue;
    }
    unusedSubstitutions.push(substitutions[i]);
  }

  return {formattedResult: result, unusedSubstitutions: unusedSubstitutions};
};

export const standardFormatters = {
  /**
   * @return {number}
   */
  d: function(substitution) {
    return !isNaN(substitution) ? substitution : 0;
  },

  /**
   * @return {number}
   */
  f: function(substitution, token) {
    if (substitution && token.precision > -1) {
      substitution = substitution.toFixed(token.precision);
    }
    return !isNaN(substitution) ? substitution : (token.precision > -1 ? Number(0).toFixed(token.precision) : 0);
  },

  /**
   * @return {string}
   */
  s: function(substitution) {
    return substitution;
  }
};

/**
 * @param {string} formatString
 * @param {!Array.<*>} substitutions
 * @return {string}
 */
export const vsprintf = function(formatString, substitutions) {
  return format(formatString, substitutions, standardFormatters, '', function(a, b) {
           return a + b;
         }).formattedResult;
};

/**
 * @param {string} format
 * @param {...*} var_arg
 * @return {string}
 */
export const sprintf = function(format, var_arg) {
  return vsprintf(format, Array.prototype.slice.call(arguments, 1));
};
