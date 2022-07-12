#!/usr/bin/env node

import { inspect } from "util";
import {
  CucumberExpressionGenerator,
  Expression,
  RegularExpression,
} from "@cucumber/cucumber-expressions";
import { getConfiguration as resolveCypressConfiguration } from "@badeball/cypress-configuration";
import { addAlias } from "module-alias";
import Table from "cli-table3";
import { resolve as resolvePreprocessorConfiguration } from "../preprocessor-configuration";
import { Position } from "../source-map";
import { IStepDefinition } from "../registry";
import indent, { ensureIsRelative } from "../helpers";
import { diagnose, DiagnosticResult } from "./diagnose";

const TEMPLATE = `
Given("[expression]", function ([arguments]) {
  return "pending";
});
`.trim();

export function log(...lines: string[]) {
  console.log(lines.join("\n"));
}

export function red(message: string): string {
  return `\x1b[31m${message}\x1b[0m`;
}

export function yellow(message: string): string {
  return `\x1b[33m${message}\x1b[0m`;
}

export function expressionToString(expression: Expression) {
  return expression instanceof RegularExpression
    ? String(expression.regexp)
    : expression.source;
}

export function strictCompare<T>(a: T, b: T) {
  return a === b;
}

export function comparePosition(a: Position, b: Position) {
  return a.source === b.source && a.column === b.column && a.line === b.line;
}

export function compareStepDefinition(
  a: IStepDefinition<unknown[]>,
  b: IStepDefinition<unknown[]>
) {
  return (
    expressionToString(a.expression) === expressionToString(b.expression) &&
    comparePosition(a.position!, b.position!)
  );
}

export function groupToMap<T, K>(
  collection: T[],
  getKeyFn: (el: T) => K,
  compareKeyFn: (a: K, b: K) => boolean
): Map<K, T[]> {
  const map = new Map<K, T[]>();

  el: for (const el of collection) {
    const key = getKeyFn(el);

    for (const existingKey of map.keys()) {
      if (compareKeyFn(key, existingKey)) {
        map.get(existingKey)!.push(el);
        continue el;
      }
    }

    map.set(key, [el]);
  }

  return map;
}

export function mapValues<K, A, B>(
  map: Map<K, A>,
  fn: (el: A) => B
): Map<K, B> {
  const mapped = new Map<K, B>();

  for (const [key, value] of map.entries()) {
    mapped.set(key, fn(value));
  }

  return mapped;
}

export function printDefinitionsUsage(
  projectRoot: string,
  result: DiagnosticResult
) {
  const groups = mapValues(
    groupToMap(
      result.definitionsUsage,
      (definitionsUsage) => definitionsUsage.definition.position!.source,
      strictCompare
    ),
    (definitionsUsages) =>
      mapValues(
        groupToMap(
          definitionsUsages,
          (definitionsUsage) => definitionsUsage.definition,
          compareStepDefinition
        ),
        (definitionsUsages) =>
          definitionsUsages.flatMap(
            (definitionsUsage) => definitionsUsage.steps
          )
      )
  );

  const entries: [string, string][] = Array.from(groups.entries()).flatMap(
    ([, matches]) => {
      return Array.from(matches.entries()).map<[string, string]>(
        ([stepDefinition, steps]) => {
          const { expression, position } = stepDefinition;

          const right = [
            inspect(
              expression instanceof RegularExpression
                ? expression.regexp
                : expression.source
            ) + (steps.length === 0 ? ` (${yellow("unused")})` : ""),
            ...steps.map((step) => {
              return "  " + step.text;
            }),
          ].join("\n");

          const left = [
            position!.source + ":" + position!.line,
            ...steps.map((step) => {
              return (
                ensureIsRelative(projectRoot, step.source) + ":" + step.line
              );
            }),
          ].join("\n");

          return [right, left];
        }
      );
    }
  );

  const table = new Table({
    head: ["Pattern / Text", "Location"],
    style: {
      head: [], // Disable colors in header cells.
    },
  });

  table.push(...entries);

  log(table.toString());
}

export function printAmbiguousSteps(
  projectRoot: string,
  result: DiagnosticResult
) {
  const relativeToProjectRoot = (path: string) =>
    ensureIsRelative(projectRoot, path);

  for (const ambiguousStep of result.ambiguousSteps) {
    log(
      `${red(
        "Error"
      )}: Multiple matching step definitions at ${relativeToProjectRoot(
        ambiguousStep.step.source
      )}:${ambiguousStep.step.line} for`,
      "",
      "  " + ambiguousStep.step.text,
      "",
      "Step matched the following definitions:",
      "",
      ...ambiguousStep.definitions.map(
        (definition) =>
          `  - ${inspect(
            definition.expression instanceof RegularExpression
              ? definition.expression.regexp
              : definition.expression.source
          )} (${relativeToProjectRoot(definition.position!.source)}:${
            definition.position!.line
          })`
      )
    );
  }
}

export function printUnmatchedSteps(
  projectRoot: string,
  result: DiagnosticResult
) {
  const relativeToProjectRoot = (path: string) =>
    ensureIsRelative(projectRoot, path);

  for (const unmatch of result.unmatchedSteps) {
    log(
      `${red("Error")}: Step implementation missing at ${relativeToProjectRoot(
        unmatch.step.source
      )}:${unmatch.step.line}`,
      "",
      "  " + unmatch.step.text,
      "",
      "We tried searching for files containing step definitions using the following search pattern template(s):",
      "",
      ...unmatch.stepDefinitionHints.stepDefinitions.map(
        (stepDefinition) => "  - " + stepDefinition
      ),
      "",
      "These templates resolved to the following search pattern(s):",
      "",
      ...unmatch.stepDefinitionHints.stepDefinitionPatterns.map(
        (stepDefinitionPattern) =>
          "  - " + relativeToProjectRoot(stepDefinitionPattern)
      ),
      ""
    );

    if (unmatch.stepDefinitionHints.stepDefinitionPaths.length === 0) {
      log(
        "These patterns matched *no files* containing step definitions. This almost certainly means that you have misconfigured `stepDefinitions`. Alternatively, you can implement it using the suggestion(s) below."
      );
    } else {
      log(
        "These patterns matched the following file(s):",
        "",
        ...unmatch.stepDefinitionHints.stepDefinitionPaths.map(
          (stepDefinitionPath) =>
            "  - " + relativeToProjectRoot(stepDefinitionPath)
        ),
        "",
        "However, none of these files contained a matching step definition. You can implement it using the suggestion(s) below."
      );
    }

    const cucumberExpressionGenerator = new CucumberExpressionGenerator(
      () => unmatch.parameterTypeRegistry.parameterTypes
    );

    const generatedExpressions =
      cucumberExpressionGenerator.generateExpressions(unmatch.step.text);

    const stepParameterNames = [];

    if (unmatch.argument === "dataTable") {
      stepParameterNames.push("dataTable");
    } else if (unmatch.argument === "docString") {
      stepParameterNames.push("docString");
    }

    for (const generatedExpression of generatedExpressions) {
      const expression = generatedExpression.source
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"');

      const args = generatedExpression.parameterNames
        .concat(stepParameterNames)
        .join(", ");

      log(
        "",
        indent(
          TEMPLATE.replace("[expression]", expression).replace(
            "[arguments]",
            args
          ),
          { count: 2 }
        )
      );
    }
  }
}

export async function execute(options: {
  argv: string[];
  env: NodeJS.ProcessEnv;
  cwd: string;
}): Promise<void> {
  addAlias(
    "@badeball/cypress-cucumber-preprocessor",
    "@badeball/cypress-cucumber-preprocessor/methods"
  );

  const cypress = resolveCypressConfiguration(options);

  const preprocessor = await resolvePreprocessorConfiguration(
    cypress,
    options.env
  );

  const result = await diagnose({
    cypress,
    preprocessor,
  });

  printDefinitionsUsage(cypress.projectRoot, result);

  log("");

  if (result.unmatchedSteps.length > 0) {
    printAmbiguousSteps(cypress.projectRoot, result);
    log("");
  }

  if (result.unmatchedSteps.length > 0) {
    printUnmatchedSteps(cypress.projectRoot, result);
  }

  if (result.unmatchedSteps.length > 0 || result.ambiguousSteps.length > 0) {
    process.exitCode = 1;
  } else {
    log("No problems found.");
  }
}

if (require.main === module) {
  execute({ argv: process.argv, env: process.env, cwd: process.cwd() });
}
