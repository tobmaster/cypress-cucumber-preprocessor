import path from "path-browserify";

import { toByteArray } from "base64-js";

import ErrorStackParser from "error-stack-parser";

import { SourceMapConsumer } from "source-map";

import { assertAndReturn } from "./assertions";

export interface Position {
  line: number;
  column: number;
  source: string;
}

let isSourceMapWarned = false;

function sourceMapWarn(message: string) {
  if (isSourceMapWarned) {
    return;
  }

  console.warn("cypress-cucumber-preprocessor: " + message);
  isSourceMapWarned = true;
}

/**
 * Taken from https://github.com/evanw/node-source-map-support/blob/v0.5.21/source-map-support.js#L148-L177.
 */
export function retrieveSourceMapURL(source: string) {
  let fileData: string;

  var xhr = new XMLHttpRequest();
  xhr.open("GET", source, /** async */ false);
  xhr.send(null);

  const { readyState, status } = xhr;

  if (readyState === 4 && status === 200) {
    fileData = xhr.responseText;
  } else {
    sourceMapWarn(
      `Unable to retrieve source map (readyState = ${readyState}, status = ${status})`
    );
    return;
  }

  var re =
    /(?:\/\/[@#][\s]*sourceMappingURL=([^\s'"]+)[\s]*$)|(?:\/\*[@#][\s]*sourceMappingURL=([^\s*'"]+)[\s]*(?:\*\/)[\s]*$)/gm;

  // Keep executing the search to find the *last* sourceMappingURL to avoid
  // picking up sourceMappingURLs from comments, strings, etc.
  var lastMatch, match;

  while ((match = re.exec(fileData))) lastMatch = match;

  if (!lastMatch) {
    sourceMapWarn(
      "Unable to find source mapping URL within the response. Are you bundling with source maps enabled?"
    );
    return;
  }

  return lastMatch[1];
}

export function retrievePositionFromSourceMap(
  projectRoot: string,
  sourcesRelativeTo: string
): Position | undefined {
  let position: Position;

  const stack = ErrorStackParser.parse(new Error());

  const sourceMappingURL = retrieveSourceMapURL(stack[0].fileName!);

  if (!sourceMappingURL) {
    return;
  }

  const rawSourceMap = JSON.parse(
    new TextDecoder().decode(
      toByteArray(sourceMappingURL.slice(sourceMappingURL.indexOf(",") + 1))
    )
  );

  const sourceMap = new SourceMapConsumer(rawSourceMap);

  const relevantFrame = stack[3];

  position = sourceMap.originalPositionFor({
    line: relevantFrame.getLineNumber()!,
    column: relevantFrame.getColumnNumber()!,
  });

  position.source = path.relative(
    projectRoot,
    path.join(path.dirname(sourcesRelativeTo), position.source)
  );

  return position;
}
