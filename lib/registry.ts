import {
  CucumberExpression,
  RegularExpression,
  Expression,
  ParameterTypeRegistry,
  ParameterType,
} from "@cucumber/cucumber-expressions";

import parse from "@cucumber/tag-expressions";

import { v4 as uuid } from "uuid";

import ErrorStackParser from "error-stack-parser";

import { SourceMapConsumer } from "source-map";

import { toByteArray } from "base64-js";

import path from "path-browserify";

import { assertAndReturn } from "./assertions";

import DataTable from "./data_table";

import {
  IHookBody,
  IParameterTypeDefinition,
  IStepDefinitionBody,
} from "./types";

// require("source-map-support").install();

function getErrorSource(stack: string) {
  var match = /\n    at [^(]+ \((.*):(\d+):(\d+)\)/.exec(stack);
  if (match) {
    return match[1];
  } else {
    throw new Error("Unable to retrieve source!");
  }
}

function retrieveSourceMapURL(source: string) {
  let fileData: string;

  var xhr = new XMLHttpRequest();
  xhr.open("GET", source, /** async */ false);
  xhr.send(null);

  if (xhr.readyState === 4 && xhr.status === 200) {
    fileData = xhr.responseText;
  } else {
    return;
  }

  var re =
    /(?:\/\/[@#][\s]*sourceMappingURL=([^\s'"]+)[\s]*$)|(?:\/\*[@#][\s]*sourceMappingURL=([^\s*'"]+)[\s]*(?:\*\/)[\s]*$)/gm;
  // Keep executing the search to find the *last* sourceMappingURL to avoid
  // picking up sourceMappingURLs from comments, strings, etc.
  var lastMatch, match;
  while ((match = re.exec(fileData))) lastMatch = match;
  if (!lastMatch) return;
  return lastMatch[1];
}

interface IStepDefinition<T extends unknown[]> {
  expression: Expression;
  implementation: IStepDefinitionBody<T>;
  position: Position;
}

export type HookKeyword = "Before" | "After";

export interface IHook {
  id: string;
  node: ReturnType<typeof parse>;
  implementation: IHookBody;
  keyword: HookKeyword;
}

const noopNode = { evaluate: () => true };

function parseHookArguments(
  options: { tags?: string },
  fn: IHookBody,
  keyword: HookKeyword
): IHook {
  return {
    id: uuid(),
    node: options.tags ? parse(options.tags) : noopNode,
    implementation: fn,
    keyword,
  };
}

interface Position {
  line: number;
  column: number;
  source: string;
}

export class Registry {
  private parameterTypeRegistry: ParameterTypeRegistry;

  private preliminaryStepDefinitions: {
    description: string | RegExp;
    implementation: () => void;
    position: Position;
  }[] = [];

  private stepDefinitions: IStepDefinition<unknown[]>[] = [];

  public beforeHooks: IHook[] = [];

  public afterHooks: IHook[] = [];

  constructor(private projectRoot: string, private sourcesRelativeTo: string) {
    this.defineStep = this.defineStep.bind(this);
    this.runStepDefininition = this.runStepDefininition.bind(this);
    this.defineParameterType = this.defineParameterType.bind(this);
    this.defineBefore = this.defineBefore.bind(this);
    this.defineAfter = this.defineAfter.bind(this);

    this.parameterTypeRegistry = new ParameterTypeRegistry();
  }

  public finalize() {
    for (const { description, implementation, position } of this
      .preliminaryStepDefinitions) {
      if (typeof description === "string") {
        this.stepDefinitions.push({
          expression: new CucumberExpression(
            description,
            this.parameterTypeRegistry
          ),
          implementation,
          position,
        });
      } else {
        this.stepDefinitions.push({
          expression: new RegularExpression(
            description,
            this.parameterTypeRegistry
          ),
          implementation,
          position,
        });
      }
    }
  }

  public defineStep(description: string | RegExp, implementation: () => void) {
    const stack = ErrorStackParser.parse(new Error());

    // console.log(stack);

    const sourceMappingURL = assertAndReturn(
      retrieveSourceMapURL(stack[0].fileName!),
      "LOL"
    );

    const rawSourceMap = JSON.parse(
      new TextDecoder().decode(
        toByteArray(sourceMappingURL.slice(sourceMappingURL.indexOf(",") + 1))
      )
    );

    console.log(rawSourceMap);

    const sourceMap = new SourceMapConsumer(rawSourceMap);

    const relevantFrame = stack[2];

    const position = sourceMap.originalPositionFor({
      line: relevantFrame.getLineNumber()!,
      column: relevantFrame.getColumnNumber()!,
    });

    console.log({ relevantFrame, position });

    // console.log(rawSourceMap.sourceRoot);

    position.source = path.relative(
      this.projectRoot,
      path.join(path.dirname(this.sourcesRelativeTo), position.source)
    );

    console.log(position);

    if (typeof description !== "string" && !(description instanceof RegExp)) {
      throw new Error("Unexpected argument for step definition");
    }

    this.preliminaryStepDefinitions.push({
      description,
      implementation,
      position,
    });
  }

  public defineParameterType<T>({
    name,
    regexp,
    transformer,
  }: IParameterTypeDefinition<T>) {
    this.parameterTypeRegistry.defineParameterType(
      new ParameterType(name, regexp, null, transformer, true, false)
    );
  }

  public defineBefore(options: { tags?: string }, fn: IHookBody) {
    this.beforeHooks.push(parseHookArguments(options, fn, "Before"));
  }

  public defineAfter(options: { tags?: string }, fn: IHookBody) {
    this.afterHooks.push(parseHookArguments(options, fn, "After"));
  }

  private resolveStepDefintion(text: string) {
    const matchingStepDefinitions = this.stepDefinitions.filter(
      (stepDefinition) => stepDefinition.expression.match(text)
    );

    if (matchingStepDefinitions.length === 0) {
      throw new Error(`Step implementation missing for: ${text}`);
    } else if (matchingStepDefinitions.length > 1) {
      console.log(
        matchingStepDefinitions.map((step) => {
          return step.position;
        })
      );

      throw new Error(
        `Multiple matching step definitions for: ${text}\n` +
          matchingStepDefinitions
            .map((stepDefinition) => {
              const { expression } = stepDefinition;
              if (expression instanceof RegularExpression) {
                return ` ${expression.regexp} - ${stepDefinition.position.source}:${stepDefinition.position.line}`;
              } else if (expression instanceof CucumberExpression) {
                return ` ${expression.source} - ${stepDefinition.position.source}:${stepDefinition.position.line}`;
              }
            })
            .join("\n")
      );
    } else {
      return matchingStepDefinitions[0];
    }
  }

  public runStepDefininition(
    world: Mocha.Context,
    text: string,
    argument?: DataTable | string
  ) {
    const stepDefinition = this.resolveStepDefintion(text);

    const args = stepDefinition.expression
      .match(text)!
      .map((match) => match.getValue(world));

    if (argument) {
      args.push(argument);
    }

    return stepDefinition.implementation.apply(world, args);
  }

  public resolveBeforeHooks(tags: string[]) {
    return this.beforeHooks.filter((beforeHook) =>
      beforeHook.node.evaluate(tags)
    );
  }

  public resolveAfterHooks(tags: string[]) {
    return this.afterHooks.filter((beforeHook) =>
      beforeHook.node.evaluate(tags)
    );
  }

  public runHook(world: Mocha.Context, hook: IHook) {
    hook.implementation.call(world);
  }
}

declare global {
  namespace globalThis {
    var __cypress_cucumber_preprocessor_registry_dont_use_this:
      | Registry
      | undefined;
  }
}

const globalPropertyName =
  "__cypress_cucumber_preprocessor_registry_dont_use_this";

export function withRegistry(
  projectRoot: string,
  sourcesRelativeTo: string,
  fn: () => void
): Registry {
  const registry = new Registry(projectRoot, sourcesRelativeTo);
  assignRegistry(registry);
  fn();
  freeRegistry();
  return registry;
}

export function assignRegistry(registry: Registry) {
  globalThis[globalPropertyName] = registry;
}

export function freeRegistry() {
  delete globalThis[globalPropertyName];
}

export function getRegistry() {
  return assertAndReturn(
    globalThis[globalPropertyName],
    "Expected to find a global registry (this usually means you are trying to define steps or hooks in support/index.js, which is not supported)"
  );
}
