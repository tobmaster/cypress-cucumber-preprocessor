# Frequently asked questions

* [`--env` / `tags` isn't picked up](#--env--tags-isnt-picked-up)
* [I get `fs_1.promises.rm is not a function`](#i-get-fs_1promisesrm-is-not-a-function)
* [I get `spawn cucumber-json-formatter ENOENT`](#i-get-spawn-cucumber-json-formatter-enoent)
* [Why is `cypress-tags` missing?](#why-is-cypress-tags-missing)
* [My JSON report isn't generated](#my-json-report-isnt-generated)

## `--env` / `tags` isn't picked up

This might be because you're trying to specify `-e / --env` multiple times, but [multiple values should be comma-separated](https://docs.cypress.io/guides/guides/command-line#cypress-run-env-lt-env-gt).

## I get `fs_1.promises.rm is not a function`

Upgrade your node version to at least [v14.14.0](https://nodejs.org/api/fs.html#fspromisesrmpath-options).

## I get `spawn cucumber-json-formatter ENOENT`

You need to install `cucumber-json-formatter` **yourself**, as per [documentation](json-report.md).

## Why is `cypress-tags` missing?

From [#689](https://github.com/badeball/cypress-cucumber-preprocessor/issues/689):

> The `cypress-tags` has been removed and made redundant. Specs containing no matching scenarios are [automatically filtered](https://github.com/badeball/cypress-cucumber-preprocessor/blob/master/docs/tags.md#running-a-subset-of-scenarios), provided that `filterSpecs` is set to true.

## My JSON report isn't generated

You have likely stumbled upon a configuration caveat, see [docs/configuration.md: Caveats / Debugging](configuration.md#caveats--debugging).
