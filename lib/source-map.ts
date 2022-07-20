import ErrorStackParser from "error-stack-parser";

export interface Position {
  line: number;
  column: number;
  source: string;
}

export function retrievePositionFromSourceMap(): Position {
  const stack = ErrorStackParser.parse(new Error());

  const relevantFrame = stack[4];

  return {
    line: relevantFrame.getLineNumber()!,
    column: relevantFrame.getColumnNumber()!,
    source: relevantFrame.fileName!,
  };
}

export function maybeRetrievePositionFromSourceMap(
  experimentalSourceMap: boolean
): Position | undefined {
  if (experimentalSourceMap) {
    return retrievePositionFromSourceMap();
  }
}
