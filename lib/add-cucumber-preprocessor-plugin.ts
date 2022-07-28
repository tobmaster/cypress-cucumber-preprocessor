import syncFs, { promises as fs, constants as fsConstants } from "fs";

import path from "path";

import child_process from "child_process";

import stream from "stream";

import chalk from "chalk";

import resolvePkg from "resolve-pkg";

import { NdjsonToMessageStream } from "@cucumber/message-streams";

import CucumberHtmlStream from "@cucumber/html-formatter";

import messages, { IdGenerator, SourceMediaType } from "@cucumber/messages";

import parse from "@cucumber/tag-expressions";

import { generateMessages } from "@cucumber/gherkin";

import {
  getTestFiles,
  ICypressConfiguration,
} from "@badeball/cypress-configuration";

import {
  HOOK_FAILURE_EXPR,
  TASK_APPEND_MESSAGES,
  TASK_CREATE_STRING_ATTACHMENT,
  TASK_TEST_STEP_STARTED,
} from "./constants";

import { resolve as origResolve } from "./preprocessor-configuration";

import { notNull } from "./type-guards";

import { getTags } from "./environment-helpers";

import { ensureIsAbsolute } from "./helpers";

/**
 * Work-around for the fact that some Cypress versions pre v10 were missing this property in their types.
 */
declare global {
  namespace Cypress {
    interface PluginConfigOptions {
      testFiles: string[];
    }
  }
}

function memoize<T extends (...args: any[]) => any>(
  fn: T
): (...args: Parameters<T>) => ReturnType<T> {
  let result: ReturnType<T>;

  return (...args: Parameters<T>) => {
    if (result) {
      return result;
    }

    return (result = fn(...args));
  };
}

const resolve = memoize(origResolve);

let currentTestStepStartedId: string;
let currentSpecMessages: messages.Envelope[];

export async function beforeRunHandler(config: Cypress.PluginConfigOptions) {
  const preprocessor = await resolve(config, config.env);

  if (!preprocessor.messages.enabled) {
    return;
  }

  const messagesPath = ensureIsAbsolute(
    config.projectRoot,
    preprocessor.messages.output
  );

  await fs.rm(messagesPath, { force: true });
}

export async function afterRunHandler(config: Cypress.PluginConfigOptions) {
  const preprocessor = await resolve(config, config.env);

  if (!preprocessor.json.enabled && !preprocessor.html.enabled) {
    return;
  }

  const messagesPath = ensureIsAbsolute(
    config.projectRoot,
    preprocessor.messages.output
  );

  try {
    await fs.access(messagesPath, fsConstants.F_OK);
  } catch {
    return;
  }

  if (preprocessor.json.enabled) {
    const jsonPath = ensureIsAbsolute(
      config.projectRoot,
      preprocessor.json.output
    );

    await fs.mkdir(path.dirname(jsonPath), { recursive: true });

    const messages = await fs.open(messagesPath, "r");

    try {
      const json = await fs.open(jsonPath, "w");

      try {
        const { formatter, args } = preprocessor.json;
        const child = child_process.spawn(formatter, args, {
          stdio: [messages.fd, json.fd, "inherit"],
        });

        await new Promise<void>((resolve, reject) => {
          child.on("exit", (code) => {
            if (code === 0) {
              resolve();
            } else {
              reject(
                new Error(
                  `${preprocessor.json.formatter} exited non-successfully`
                )
              );
            }
          });

          child.on("error", reject);
        });
      } finally {
        await json.close();
      }
    } finally {
      await messages.close();
    }
  }

  if (preprocessor.html.enabled) {
    const htmlPath = ensureIsAbsolute(
      config.projectRoot,
      preprocessor.html.output
    );

    await fs.mkdir(path.dirname(htmlPath), { recursive: true });

    const input = syncFs.createReadStream(messagesPath);

    const output = syncFs.createWriteStream(htmlPath);

    console.log("I am invoked!");

    await new Promise<void>((resolve, reject) => {
      stream.pipeline(
        input,
        new NdjsonToMessageStream(),
        new CucumberHtmlStream(
          resolvePkg("@cucumber/html-formatter", { cwd: __dirname }) +
            "/dist/main.css",
          resolvePkg("@cucumber/html-formatter", { cwd: __dirname }) +
            "/dist/main.js"
        ),
        output,
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  }
}

export async function beforeSpecHandler(config: Cypress.PluginConfigOptions) {
  currentSpecMessages = [];
}

export async function afterSpecHandler(
  config: Cypress.PluginConfigOptions,
  spec: Cypress.Spec,
  results: CypressCommandLine.RunResult
) {
  const preprocessor = await resolve(config, config.env);

  const messagesPath = ensureIsAbsolute(
    config.projectRoot,
    preprocessor.messages.output
  );

  // `results` is undefined when running via `cypress open`.
  if (!preprocessor.messages.enabled || !currentSpecMessages || !results) {
    return;
  }

  const wasRemainingSkipped = results.tests.some((test) =>
    test.displayError?.match(HOOK_FAILURE_EXPR)
  );

  if (wasRemainingSkipped) {
    console.log(
      chalk.yellow(
        `  Hook failures can't be represented in JSON reports, thus none is created for ${spec.relative}.`
      )
    );
  } else {
    await fs.mkdir(path.dirname(messagesPath), { recursive: true });

    await fs.writeFile(
      messagesPath,
      currentSpecMessages.map((message) => JSON.stringify(message)).join("\n") +
        "\n",
      {
        flag: "a",
      }
    );
  }
}

export async function afterScreenshotHandler(
  config: Cypress.PluginConfigOptions,
  details: Cypress.ScreenshotDetails
) {
  const preprocessor = await resolve(config, config.env);

  if (!preprocessor.messages.enabled || !currentSpecMessages) {
    return details;
  }

  let buffer;

  try {
    buffer = await fs.readFile(details.path);
  } catch {
    return details;
  }

  const message: messages.Envelope = {
    attachment: {
      testStepId: currentTestStepStartedId,
      body: buffer.toString("base64"),
      mediaType: "image/png",
      contentEncoding:
        "BASE64" as unknown as messages.AttachmentContentEncoding.BASE64,
    },
  };

  currentSpecMessages.push(message);

  return details;
}

type AddOptions = {
  omitBeforeRunHandler?: boolean;
  omitAfterRunHandler?: boolean;
  omitBeforeSpecHandler?: boolean;
  omitAfterSpecHandler?: boolean;
  omitAfterScreenshotHandler?: boolean;
};

export default async function addCucumberPreprocessorPlugin(
  on: Cypress.PluginEvents,
  config: Cypress.PluginConfigOptions,
  options: AddOptions = {}
) {
  const preprocessor = await resolve(config, config.env);

  if (!options.omitBeforeRunHandler) {
    on("before:run", () => beforeRunHandler(config));
  }

  if (!options.omitAfterRunHandler) {
    on("after:run", () => afterRunHandler(config));
  }

  if (!options.omitBeforeSpecHandler) {
    on("before:spec", () => beforeSpecHandler(config));
  }

  if (!options.omitAfterSpecHandler) {
    on("after:spec", (spec, results) =>
      afterSpecHandler(config, spec, results)
    );
  }

  if (!options.omitAfterScreenshotHandler) {
    on("after:screenshot", (details) =>
      afterScreenshotHandler(config, details)
    );
  }

  on("task", {
    [TASK_APPEND_MESSAGES]: (messages: messages.Envelope[]) => {
      if (!currentSpecMessages) {
        return true;
      }

      currentSpecMessages.push(...messages);

      return true;
    },

    [TASK_TEST_STEP_STARTED]: (testStepStartedId) => {
      if (!currentSpecMessages) {
        return true;
      }

      currentTestStepStartedId = testStepStartedId;

      return true;
    },

    [TASK_CREATE_STRING_ATTACHMENT]: ({ data, mediaType, encoding }) => {
      if (!currentSpecMessages) {
        return true;
      }

      const message: messages.Envelope = {
        attachment: {
          testStepId: currentTestStepStartedId,
          body: data,
          mediaType: mediaType,
          contentEncoding: encoding,
        },
      };

      currentSpecMessages.push(message);

      return true;
    },
  });

  const tags = getTags(config.env);

  if (tags !== null && preprocessor.filterSpecs) {
    const node = parse(tags);

    const propertyName = "specPattern" in config ? "specPattern" : "testFiles";

    (config as any)[propertyName] = getTestFiles(
      config as unknown as ICypressConfiguration
    ).filter((testFile) => {
      const content = syncFs.readFileSync(testFile).toString("utf-8");

      const options = {
        includeSource: false,
        includeGherkinDocument: false,
        includePickles: true,
        newId: IdGenerator.incrementing(),
      };

      const envelopes = generateMessages(
        content,
        testFile,
        SourceMediaType.TEXT_X_CUCUMBER_GHERKIN_PLAIN,
        options
      );

      const pickles = envelopes
        .map((envelope) => envelope.pickle)
        .filter(notNull);

      return pickles.some((pickle) =>
        node.evaluate(pickle.tags?.map((tag) => tag.name).filter(notNull) ?? [])
      );
    });
  }

  return config;
}
