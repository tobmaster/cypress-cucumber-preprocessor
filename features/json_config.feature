Feature: JSON config

  Background:
    Given I've ensured cucumber-json-formatter is installed
    And a file named "assert_args_and_exec.js" with:
      """
      const assert = require("assert/strict");
      assert(process.argv[0].endsWith("node"));
      assert(process.argv[1].endsWith("assert_args_and_exec.js"));
      assert.equal(process.argv[2], "cucumber-json-formatter");
      require("child_process").execSync(process.argv[2], { stdio: "inherit" });
      """

  Scenario: passed example with config args
    Given a file named "cypress/e2e/a.feature" with:
      """
      Feature: a feature
        Scenario: a scenario
          Given a step
      """
    And a file named "cypress/support/step_definitions/steps.js" with:
      """
      const { Given } = require("@badeball/cypress-cucumber-preprocessor");
      Given("a step", function() {})
      """
    And additional preprocessor configuration
      """
      {
        "json": {
          "args": ["assert_args_and_exec.js", "cucumber-json-formatter"],
          "enabled": true,
          "formatter": "node"
        }
      }
      """
    When I run cypress
    Then it passes
    And there should be a JSON output similar to "fixtures/passed-example.json"

  Scenario: passed example with jsonArgs through -e
    Given a file named "cypress/e2e/a.feature" with:
      """
      Feature: a feature
        Scenario: a scenario
          Given a step
      """
    And a file named "cypress/support/step_definitions/steps.js" with:
      """
      const { Given } = require("@badeball/cypress-cucumber-preprocessor");
      Given("a step", function() {})
      """
    And additional preprocessor configuration
      """
      {
        "json": {
          "enabled": true,
          "formatter": "node"
        }
      }
      """
    When I run cypress with "-e jsonArgs=[\"assert_args_and_exec.js\",\"cucumber-json-formatter\"]"
    Then it passes
    And there should be a JSON output similar to "fixtures/passed-example.json"

