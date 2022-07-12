import fs from "fs/promises";
import {
  getTestFiles,
  ICypressConfiguration,
} from "@badeball/cypress-configuration";
import {
  Expression,
  ParameterTypeRegistry,
  RegularExpression,
} from "@cucumber/cucumber-expressions";
import { generateMessages } from "@cucumber/gherkin";
import { IdGenerator } from "@cucumber/messages";
import { assert, assertAndReturn } from "../assertions";
import { createAstIdMap } from "../ast-helpers";
import { ensureIsRelative } from "../helpers";
import { IPreprocessorConfiguration } from "../preprocessor-configuration";
import { IStepDefinition, withRegistry } from "../registry";
import { Position } from "../source-map";
import {
  getStepDefinitionPatterns,
  getStepDefinitionPaths,
} from "../step-definitions";
import { notNull } from "../type-guards";

export interface DiagnosticStep {
  source: string;
  line: number;
  text: string;
}

export interface DiagnosticResult {
  definitionsUsage: {
    definition: IStepDefinition<unknown[]>;
    steps: DiagnosticStep[];
  }[];
  unmatchedSteps: {
    step: DiagnosticStep;
    argument: "docString" | "dataTable" | null;
    parameterTypeRegistry: ParameterTypeRegistry;
    stepDefinitionHints: {
      stepDefinitions: string[];
      stepDefinitionPatterns: string[];
      stepDefinitionPaths: string[];
    };
  }[];
  ambiguousSteps: {
    step: DiagnosticStep;
    definitions: IStepDefinition<unknown[]>[];
  }[];
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

export async function diagnose(configuration: {
  cypress: ICypressConfiguration;
  preprocessor: IPreprocessorConfiguration;
}): Promise<DiagnosticResult> {
  const result: DiagnosticResult = {
    definitionsUsage: [],
    unmatchedSteps: [],
    ambiguousSteps: [],
  };

  const testFiles = getTestFiles(configuration.cypress);

  for (const testFile of testFiles) {
    if (!testFile.endsWith(".feature")) {
      continue;
    }

    const stepDefinitionPatterns = getStepDefinitionPatterns(
      configuration,
      testFile
    );

    const stepDefinitions = await getStepDefinitionPaths(
      stepDefinitionPatterns
    );

    const registry = withRegistry(true, () => {
      for (const stepDefinition of stepDefinitions) {
        delete require.cache[stepDefinition];
        require(stepDefinition);
      }
    });

    registry.finalize();

    const options = {
      includeSource: false,
      includeGherkinDocument: true,
      includePickles: true,
      newId: IdGenerator.uuid(),
    };

    const relativeUri = ensureIsRelative(
      configuration.cypress.projectRoot,
      testFile
    );

    const envelopes = generateMessages(
      (await fs.readFile(testFile)).toString(),
      relativeUri,
      options
    );

    const gherkinDocument = assertAndReturn(
      envelopes
        .map((envelope) => envelope.gherkinDocument)
        .find((document) => document),
      "Expected to find a gherkin document"
    );

    for (const stepDefinition of registry.stepDefinitions) {
      const usage = result.definitionsUsage.find((usage) =>
        compareStepDefinition(usage.definition, stepDefinition)
      );

      if (!usage) {
        result.definitionsUsage.push({
          definition: stepDefinition,
          steps: [],
        });
      }
    }

    const astIdMap = createAstIdMap(gherkinDocument);

    const pickles = envelopes
      .map((envelope) => envelope.pickle)
      .filter(notNull);

    for (const pickle of pickles) {
      if (pickle.steps) {
        for (const step of pickle.steps) {
          const text = assertAndReturn(
            step.text,
            "Expected pickle step to have a text"
          );

          const matchingStepDefinitions =
            registry.getMatchingStepDefinitions(text);

          const astNodeId = assertAndReturn(
            step.astNodeIds?.[0],
            "Expected to find at least one astNodeId"
          );

          const astNode = assertAndReturn(
            astIdMap.get(astNodeId),
            `Expected to find scenario step associated with id = ${astNodeId}`
          );

          assert("location" in astNode, "Expected ast node to have a location");

          if (matchingStepDefinitions.length === 0) {
            let argument: "docString" | "dataTable" | null = null;

            if (step.argument?.dataTable) {
              argument = "dataTable";
            } else if (step.argument?.docString) {
              argument = "docString";
            }

            result.unmatchedSteps.push({
              step: {
                source: testFile,
                line: astNode.location?.line!,
                text: step.text!,
              },
              argument,
              parameterTypeRegistry: registry.parameterTypeRegistry,
              stepDefinitionHints: {
                stepDefinitions: [
                  configuration.preprocessor.stepDefinitions,
                ].flat(),
                stepDefinitionPatterns,
                stepDefinitionPaths: stepDefinitions,
              },
            });
          } else if (matchingStepDefinitions.length === 1) {
            const usage = assertAndReturn(
              result.definitionsUsage.find((usage) =>
                compareStepDefinition(
                  usage.definition,
                  matchingStepDefinitions[0]
                )
              ),
              "Expected to find usage"
            );

            usage.steps.push({
              source: testFile,
              line: astNode.location?.line!,
              text: step.text!,
            });
          } else {
            result.ambiguousSteps.push({
              step: {
                source: testFile,
                line: astNode.location?.line!,
                text: step.text!,
              },
              definitions: matchingStepDefinitions,
            });
          }
        }
      }
    }
  }

  return result;
}
